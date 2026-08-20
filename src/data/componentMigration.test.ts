import { BUILTIN_TIM_IDS } from '@/domain/materials';
import { describe, expect, it } from 'vitest';
import { migrateComponent, migrateComponents } from './componentMigration';

/**
 * Regression suite for the schema change Screen 04 introduced.
 *
 * The bug this guards against: Screen 04 widened the component model but the
 * loader assumed every stored record already matched the new shape. Anyone with
 * data written by Screen 02 got a crash — and, with no error boundary, a blank
 * page. Every field the widening touched is covered here.
 */

/** Exactly what Screen 02 wrote before the Screen 04 model change. */
const PRE_04_RECORD = {
  id: 'CMP_PA',
  name: 'Final PA',
  category: 'RF',
  qty: 4,
  power_W: 52.13,
  thermal_spec: {
    r_jc_C_per_W: 0.35,
    limit_C: 180,
    limit_type: null,
    board_type: 'Copper Coin',
    tim_type: 'Grease',
    pad_L_mm: 20,
    pad_W_mm: 10,
    thickness_mm: 2.5,
    height_mm: 250,
  },
  thermal_profile: null,
  provenance: {
    source_type: 'CSV',
    source_project_id: null,
    source_project_name: null,
    source_file: 'components.csv',
    imported_at: '2026-01-01T00:00:00Z',
  },
  metadata: { supplier: 'ACME', tcPlacement: 'top-center' },
};

describe('pre-04 component migration', () => {
  const migrated = migrateComponent(PRE_04_RECORD, 0)!;

  it('lifts a bare numeric power into a SourcedValue', () => {
    expect(migrated.power_W.value).toBeCloseTo(52.13);
    expect(migrated.power_W.source).toBeTruthy();
  });

  it('lifts Rjc and the thermal limit without inventing values', () => {
    expect(migrated.thermal_spec.r_jc_C_per_W?.value).toBe(0.35);
    expect(migrated.thermal_spec.limit_C?.value).toBe(180);
  });

  it('moves the flat board type onto the heat path it describes', () => {
    expect(migrated.thermal_spec.heat_path.type).toBe('Coin');
    expect(migrated.thermal_spec.heat_path.parameters).toEqual({});
    // A stated board type is a decision, so the migrated path is not a guess.
    expect(migrated.thermal_spec.heat_path_confirmed).toBe(true);
  });

  it('moves the flat TIM type into a TIM spec', () => {
    expect(migrated.thermal_spec.tim.tim_id).toBe(BUILTIN_TIM_IDS.grease);
  });

  it('moves the flat geometry fields and flags them for review', () => {
    const geometry = migrated.thermal_spec.geometry;
    expect(geometry.source_L_mm).toBe(20);
    expect(geometry.source_W_mm).toBe(10);
    expect(geometry.board_thickness_mm).toBe(2.5);
    // 04 §30 — legacy semantics are confirmed by a human, never assumed.
    expect(geometry.needs_review).toBe(true);
    expect(geometry.package_H_mm).toBeNull();
  });

  it('drops geometry fields the model no longer has', () => {
    const geometry = migrated.thermal_spec.geometry;
    expect(geometry).not.toHaveProperty('legacy_height_mm');
    expect(geometry).not.toHaveProperty('custom_thickness_mm');
  });

  it('adds the fields the old shape never had', () => {
    expect(migrated.enabled).toBe(true);
    expect(migrated.architecture_prep.template_preference).toBe('UNASSIGNED');
    expect(migrated.architecture_prep.thermal_profile_status).toBe('Not Assigned');
    expect(migrated.external_mappings.flotherm?.mapping_status).toBe('unmapped');
  });

  it('does not claim a limit type the old record never stated', () => {
    expect(migrated.thermal_spec.limit_type_confirmed).toBe(false);
  });

  it('preserves provenance and unknown metadata', () => {
    expect(migrated.provenance.source_type).toBe('CSV');
    expect(migrated.provenance.source_file).toBe('components.csv');
    expect(migrated.metadata?.supplier).toBe('ACME');
    expect(migrated.metadata?.tcPlacement).toBe('top-center');
  });

  it('keeps a missing Rjc as null rather than 0', () => {
    const sparse = migrateComponent(
      { id: 'X', name: 'Passive', qty: 1, power_W: 0, thermal_spec: { r_jc_C_per_W: null } },
      0,
    )!;
    expect(sparse.thermal_spec.r_jc_C_per_W).toBeNull();
    expect(sparse.power_W.value).toBe(0);
  });
});

describe('migration robustness', () => {
  it('is a no-op on records already in the current shape', () => {
    const current = migrateComponent(PRE_04_RECORD, 0)!;
    const again = migrateComponent(current, 0)!;
    expect(again.power_W.value).toBeCloseTo(52.13);
    expect(again.thermal_spec.heat_path.type).toBe('Coin');
    expect(again.thermal_spec.tim.tim_id).toBe(BUILTIN_TIM_IDS.grease);
    expect(again.enabled).toBe(true);
  });

  it('drops malformed entries without losing the valid ones', () => {
    const result = migrateComponents([
      PRE_04_RECORD,
      'garbage',
      null,
      42,
      {},
      { id: 'CMP_OK', name: 'OK', qty: 1, power_W: 1 },
    ]);
    expect(result.map((c) => c.name)).toEqual(['Final PA', 'OK']);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(migrateComponents(undefined)).toEqual([]);
    expect(migrateComponents(null)).toEqual([]);
    expect(migrateComponents({})).toEqual([]);
  });

  it('survives a record with no thermal_spec at all', () => {
    const bare = migrateComponent({ id: 'B', name: 'Bare', qty: 2, power_W: 3 }, 0)!;
    // Nothing to migrate means nothing to trust: inferred, and flagged as such.
    expect(bare.thermal_spec.heat_path.type).toBe('Board');
    expect(bare.thermal_spec.heat_path_confirmed).toBe(false);
    expect(bare.thermal_spec.tim.tim_id).toBeNull();
    expect(bare.thermal_spec.geometry.source_L_mm).toBeNull();
  });
});

describe('limit type migration', () => {
  const migrate = (spec: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    migrateComponent({ name: 'X', category: 'Digital', thermal_spec: spec, ...extra }, 0)!;

  it('keeps a stated Tj or Tc and treats it as settled', () => {
    expect(migrate({ limit_type: 'Tc' }).thermal_spec).toMatchObject({
      limit_type: 'Tc',
      limit_type_confirmed: true,
    });
  });

  // Ts named the package exterior, which Tc already covers — but renaming a
  // surface limit to a case limit is a reinterpretation, so it needs a human.
  it('folds Ts onto Tc but leaves it unconfirmed', () => {
    expect(migrate({ limit_type: 'Ts' }).thermal_spec).toMatchObject({
      limit_type: 'Tc',
      limit_type_confirmed: false,
    });
  });

  it('treats Custom and Unknown as "nobody decided" and infers instead', () => {
    for (const legacy of ['Custom', 'Unknown', undefined]) {
      const spec = migrate({ limit_type: legacy }).thermal_spec;
      expect(spec.limit_type).toBe('Tj');
      expect(spec.limit_type_confirmed).toBe(false);
    }
  });

  it('infers from the category the record already had', () => {
    expect(migrate({}, { category: 'Power' }).thermal_spec.limit_type).toBe('Tc');
  });

  it('trusts a confirmation flag a newer record already carries', () => {
    expect(
      migrate({ limit_type: 'Tc', limit_type_confirmed: true }).thermal_spec.limit_type_confirmed,
    ).toBe(true);
  });
});

describe('heat path migration', () => {
  const migrate = (spec: Record<string, unknown>, category = 'Digital') =>
    migrateComponent({ name: 'X', category, thermal_spec: spec }, 0)!.thermal_spec;

  it('maps each stored board type onto the path it described', () => {
    expect(migrate({ board_path: { type: 'Copper Coin' } }).heat_path.type).toBe('Coin');
    expect(migrate({ board_path: { type: 'Thermal Via' } }).heat_path.type).toBe('Board');
    expect(migrate({ board_path: { type: 'PCB Only' } }).heat_path.type).toBe('Board');
    expect(migrate({ board_path: { type: 'Direct Metal' } }).heat_path.type).toBe('DirectMetal');
  });

  // `None` never meant "no path" — those rows conduct straight out of the
  // package top. Reading it as an absence would delete a real thermal route.
  it('reads None as top-surface cooling, not as an absent path', () => {
    expect(migrate({ board_path: { type: 'None' } }).heat_path.type).toBe('TopSurface');
  });

  it('treats Custom as undecided and infers from the category', () => {
    const spec = migrate({ board_path: { type: 'Custom' } }, 'RF');
    expect(spec.heat_path.type).toBe('Coin');
    expect(spec.heat_path_confirmed).toBe(false);
  });

  it('keeps the parameters the stored path carried', () => {
    const spec = migrate({ board_path: { type: 'Thermal Via', parameters: { via_count: 24 } } });
    expect(spec.heat_path.parameters).toEqual({ via_count: 24 });
  });
});
