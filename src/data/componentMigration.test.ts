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

describe('the mount axis', () => {
  /**
   * `thermal_spec` is rebuilt field by field, so a field the migrator does not
   * name is silently dropped on every read. That is deliberate for fields that
   * were removed — and it is exactly how a newly added one disappears: the
   * mount chosen in Screen 04 survived in memory and vanished the moment
   * Screen 05 reloaded the components.
   */
  it('carries a stored mount through a load', () => {
    const stored = migrateComponent(
      {
        id: 'CMP_M',
        name: 'M',
        thermal_spec: {
          mount: { type: 'Pedestal', contact_L_mm: 25, contact_W_mm: 25, height_mm: 8 },
        },
      },
      0,
    )!;
    expect(stored.thermal_spec.mount).toMatchObject({
      type: 'Pedestal',
      contact_L_mm: 25,
      contact_W_mm: 25,
      height_mm: 8,
      heat_pipe_R_C_per_W: null,
      // Fields the stored record predates, filled with what it silently meant.
      attachment: 'Integral',
      block_k_W_mK: null,
      joint_tim_id: null,
    });
    // And again, because every save writes back what the last load produced.
    expect(migrateComponent(stored, 0)!.thermal_spec.mount).toEqual(stored.thermal_spec.mount);
  });

  /** Silence means the part sits flat on the base — that is what everyone built. */
  it('reads a record written before mounts existed as Direct', () => {
    expect(migrateComponent(PRE_04_RECORD, 0)!.thermal_spec.mount).toMatchObject({
      type: 'Direct',
      contact_L_mm: null,
      contact_W_mm: null,
      height_mm: null,
      heat_pipe_R_C_per_W: null,
      attachment: 'Integral',
    });
  });

  /** The same trap one layer down: a field added later must survive a reload. */
  it('carries a bolted copper boss and its joint through a load', () => {
    const stored = migrateComponent(
      {
        id: 'CMP_B',
        name: 'B',
        thermal_spec: {
          mount: {
            type: 'Pedestal',
            attachment: 'Bolted',
            block_k_W_mK: 385,
            joint_tim_id: 'TIM_PUTTY',
            joint_blt_mm: 0.2,
          },
        },
      },
      0,
    )!;
    expect(stored.thermal_spec.mount).toMatchObject({
      attachment: 'Bolted',
      block_k_W_mK: 385,
      joint_tim_id: 'TIM_PUTTY',
      joint_blt_mm: 0.2,
    });
    expect(migrateComponent(stored, 0)!.thermal_spec.mount).toEqual(stored.thermal_spec.mount);
  });

  /** A vapour chamber is never milled out of the heat sink. */
  it('forces a vapour chamber to be a separate part', () => {
    const stored = migrateComponent(
      {
        id: 'CMP_V',
        name: 'V',
        thermal_spec: { mount: { type: 'VaporChamber', attachment: 'Integral' } },
      },
      0,
    )!;
    expect(stored.thermal_spec.mount?.attachment).toBe('Bolted');
  });

  it('falls back to Direct for a type it does not know, and never invents a dimension', () => {
    const odd = migrateComponent(
      {
        id: 'CMP_O',
        name: 'O',
        thermal_spec: { mount: { type: 'Teleportation', height_mm: 'x' } },
      },
      0,
    )!;
    expect(odd.thermal_spec.mount?.type).toBe('Direct');
    expect(odd.thermal_spec.mount?.height_mm).toBeNull();
  });
});

/**
 * A preference naming a template the registry no longer has makes a component
 * UNBUILDABLE: `getTemplate` returns nothing, `buildComponentSubgraph` returns
 * null, and Generate used to skip the component without a word — so whatever
 * its old subgraph contained stayed in place forever. That is what kept a
 * duplicate heat source alive through three separate attempts to sweep it.
 */
describe('architecture template preference', () => {
  const prefOf = (raw: unknown) =>
    migrateComponent({ id: 'C', name: 'C', architecture_prep: { template_preference: raw } }, 0)!
      .architecture_prep.template_preference;

  it('maps a removed template onto the one that replaced it', () => {
    expect(prefOf('MODULE_SURFACE_TIM')).toBe('DIRECT_METAL');
  });

  it('leaves a template the registry still has alone', () => {
    for (const id of ['BOTTOM_COOL_COIN', 'TOP_COOL_LID', 'DIRECT_METAL', 'CUSTOM']) {
      expect(prefOf(id)).toBe(id);
    }
  });

  /** Never a guess: UNASSIGNED means nobody has decided, and Screen 05 asks. */
  it('falls back to UNASSIGNED for anything it does not recognise', () => {
    expect(prefOf('SOMETHING_INVENTED')).toBe('UNASSIGNED');
    expect(prefOf(42)).toBe('UNASSIGNED');
    expect(prefOf(undefined)).toBe('UNASSIGNED');
  });
});

/**
 * `BARE_DIE` and `SMALL_BASE_HEAT_PIPE` were a heat path and a MOUNT wearing one
 * name. Migrating the template alone would throw the mount away, which is the
 * whole thing those two templates were carrying.
 */
describe('templates that dissolved into the mount axis', () => {
  const migrate = (templateId: string, spec: Record<string, unknown> = {}) =>
    migrateComponent(
      {
        id: 'C',
        name: 'C',
        category: 'Digital',
        architecture_prep: { template_preference: templateId },
        thermal_spec: spec,
      },
      0,
    )!;

  it('turns Bare Die into the component\u2019s own heat path plus a boss', () => {
    const migrated = migrate('BARE_DIE', { heat_path: { type: 'TopSurface' } });
    expect(migrated.architecture_prep.template_preference).toBe('TOP_COOL_LID');
    expect(migrated.thermal_spec.mount?.type).toBe('Pedestal');
  });

  it('turns Small Base + Heat Pipe into the heat path plus that mount', () => {
    const migrated = migrate('SMALL_BASE_HEAT_PIPE', { heat_path: { type: 'Coin' } });
    // The component's own heat path decides the template, not a fixed mapping.
    expect(migrated.architecture_prep.template_preference).toBe('BOTTOM_COOL_COIN');
    expect(migrated.thermal_spec.mount?.type).toBe('SmallBaseHeatPipe');
  });

  /** A mount chosen after the split is the engineer speaking more recently. */
  it('does not overwrite a mount the component already has', () => {
    const migrated = migrate('BARE_DIE', {
      heat_path: { type: 'TopSurface' },
      mount: { type: 'VaporChamber', contact_L_mm: 200 },
    });
    expect(migrated.thermal_spec.mount?.type).toBe('VaporChamber');
  });
});

/**
 * The library's `Solder` row was a second editable copy of Screen 01's
 * standalone solder pair, and only the standalone pair was ever read by the
 * copper-coin chain — so the two could drift and the row was the one that did
 * not count. The row is gone; the reference cannot stand.
 */
describe('the removed Solder material', () => {
  it('clears a component that pointed at it, and remembers what it said', () => {
    const migrated = migrateComponent(
      { id: 'C', name: 'C', thermal_spec: { tim: { tim_id: 'TIM_SOLDER', blt_mm: 0.3 } } },
      0,
    )!;
    expect(migrated.thermal_spec.tim.tim_id).toBeNull();
    expect(migrated.metadata?._removed_tim_id).toBe('TIM_SOLDER');
    // The bond line the engineer stated is theirs and stays.
    expect(migrated.thermal_spec.tim.blt_mm?.value).toBe(0.3);
  });

  it('leaves every other material alone', () => {
    const migrated = migrateComponent(
      { id: 'C', name: 'C', thermal_spec: { tim: { tim_id: BUILTIN_TIM_IDS.putty } } },
      0,
    )!;
    expect(migrated.thermal_spec.tim.tim_id).toBe(BUILTIN_TIM_IDS.putty);
    expect(migrated.metadata?._removed_tim_id).toBeUndefined();
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

  it('keeps manufacturer surface and baseplate references distinct', () => {
    expect(migrate({ limit_type: 'Ts' }).thermal_spec).toMatchObject({
      limit_type: 'Ts',
      limit_type_confirmed: true,
    });
    expect(migrate({ limit_type: 'Tb' }).thermal_spec).toMatchObject({
      limit_type: 'Tb',
      limit_type_confirmed: true,
    });
  });

  it('normalizes a legacy manufacturer reference location to a supported choice', () => {
    expect(
      migrate({
        limit_type: 'Ts',
        limit_type_confirmed: true,
        limit_reference_note: 'Baseplate center',
      }).thermal_spec.limit_reference_note,
    ).toBe('Center');
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

  it('keeps the canonical manufacturer-surface path', () => {
    // ModuleSurface folded into DirectMetal, and the migration must carry the
    // two settings that keep the chain identical.
    const migrated = migrate({ heat_path: { type: 'ModuleSurface' } }).heat_path;
    expect(migrated.type).toBe('DirectMetal');
    expect(migrated.parameters).toMatchObject({
      source_model: 'SurfaceBodyBased',
      contact_geometry: 'FullBase',
    });
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

  it('keeps Metal Base source, contact and exposed-surface parameters', () => {
    const parameters = {
      source_model: 'SurfaceBodyBased',
      contact_geometry: 'PerimeterFrame',
      perimeter_land_width_mm: 2,
      exposed_surface_enabled: true,
      exposed_area_mode: 'Custom',
      custom_exposed_area_mm2: 15_200,
    };
    const spec = migrate({ heat_path: { type: 'DirectMetal', parameters } }, 'Filter');
    expect(spec.heat_path.parameters).toEqual(parameters);
  });

  // Rjc = 0 was the only way to say "one isothermal body" before the source
  // model applied to every heat path — and it never worked, because a
  // zero-resistance edge has infinite conductance and Screen 07 rejects it.
  it('reads Rjc = 0 as a body source', () => {
    const spec = migrate({
      heat_path: { type: 'Board', parameters: {} },
      r_jc_C_per_W: { value: 0, source: 'Manual' },
    });
    expect(spec.heat_path.parameters.source_model).toBe('SurfaceBodyBased');
    // The stored 0 is left alone: it is no longer read, and an engineer who
    // switches back to a junction should see the number they typed.
    expect(spec.r_jc_C_per_W?.value).toBe(0);
  });

  it('leaves a stated source model alone even when Rjc is 0', () => {
    const spec = migrate({
      heat_path: { type: 'Board', parameters: { source_model: 'JunctionBased' } },
      r_jc_C_per_W: 0,
    });
    expect(spec.heat_path.parameters.source_model).toBe('JunctionBased');
  });

  it('does not read a real Rjc as a body source', () => {
    const spec = migrate({
      heat_path: { type: 'Board', parameters: {} },
      r_jc_C_per_W: 1.7,
    });
    expect(spec.heat_path.parameters.source_model).toBeUndefined();
  });
});
