import { describe, expect, it } from 'vitest';

import {
  completenessOf,
  completenessScore,
  statusOf,
  summarizeReadiness,
  validateComponent,
} from './componentReadiness';
import { combineEffects, effectOfChange, isMappedToNetwork } from './componentInvalidation';
import {
  componentTotalPowerW,
  contactAreaMm2,
  createComponent,
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyThermalSpec,
  inferLimitType,
  totalPowerW,
  type Component,
} from './component';
import { sourced, unknownValue, withValue } from './sourcedValue';
import { setResult, type ResultValue } from '@/thermal/resultValue';
import { createRth, setRthFromSource } from '@/thermal/rth';
import {
  canonicalComponentToLegacy,
  legacyComponentToCanonical,
} from '@/adapters/legacyComponentAdapter';
import { normalizeBoardType, normalizeTim } from '@/importers/component/normalizeComponent';
import { toLibraryEntry, fromLibraryEntry } from '@/data/componentLibraryStore';

function base(overrides: Partial<Component> = {}): Component {
  return {
    ...createComponent({
      id: 'CMP_TEST',
      name: 'Final PA',
      category: 'RF',
      qty: 4,
      power_W: 52.13,
      provenance: {
        source_type: 'ExistingProject',
        source_project_id: 'REF_A',
        source_project_name: 'Ref A',
        source_file: null,
        imported_at: '2026-01-01T00:00:00Z',
      },
    }),
    ...overrides,
  };
}

/** Test case A of 04 §38 — a fully specified PA. */
function readyPA(): Component {
  const component = base();
  return {
    ...component,
    thermal_spec: {
      ...emptyThermalSpec(),
      limit_type: 'Tj',
      limit_type_confirmed: true,
      limit_C: sourced(180, 'Datasheet'),
      r_jc_C_per_W: sourced(0.35, 'Datasheet'),
      package_type: 'QFN',
      geometry: { ...emptyThermalSpec().geometry, contact_L_mm: 20, contact_W_mm: 10 },
      board_path: { type: 'Copper Coin', parameters: {} },
      tim: { ...emptyThermalSpec().tim, type: 'Grease', inheritance: 'component' },
    },
    architecture_prep: {
      ...emptyArchitecturePrep(),
      template_preference: 'BOTTOM_COOL_COIN',
    },
  };
}

describe('limit type', () => {
  // The Volume Tool decides this with `_src === 'PWR' || name includes 'ddr'`.
  // Same rule, but the result is never presented as if it were sourced.
  it('quotes power devices against the case and everything else against the junction', () => {
    expect(inferLimitType('Power', 'DC-DC 12V')).toBe('Tc');
    expect(inferLimitType('RF', 'Final PA')).toBe('Tj');
    expect(inferLimitType('Digital', 'FPGA')).toBe('Tj');
  });

  it('recognises DDR as case limited whatever its category', () => {
    expect(inferLimitType('Digital', 'DDR4 Bank A')).toBe('Tc');
    expect(inferLimitType('Other', 'U500_DDR')).toBe('Tc');
  });

  it('does not match ddr inside an unrelated word', () => {
    expect(inferLimitType('Digital', 'ADDRESS_BUFFER')).toBe('Tj');
  });

  it('leaves a new component unconfirmed, so nothing presents a guess as fact', () => {
    const component = base();
    expect(component.thermal_spec.limit_type).toBe('Tj');
    expect(component.thermal_spec.limit_type_confirmed).toBe(false);
    expect(completenessOf(component).Limit).toBe(false);
    expect(
      validateComponent(component).some(
        (issue) => issue.field === 'limit_type' && issue.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('clears the warning once a type is confirmed', () => {
    const confirmed = readyPA();
    expect(validateComponent(confirmed).some((issue) => issue.field === 'limit_type')).toBe(false);
  });
});

// --- Readiness -------------------------------------------------------------

describe('component readiness', () => {
  it('marks a fully specified PA as READY (04 §38 case A)', () => {
    const component = readyPA();
    expect(statusOf(component)).toBe('READY');
    const score = completenessScore(completenessOf(component));
    expect(score).toEqual({ done: 9, total: 9 });
  });

  it('treats a missing Rjc as a warning, not a blocker (04 §38 case B)', () => {
    const component = { ...readyPA() };
    component.thermal_spec = { ...component.thermal_spec, r_jc_C_per_W: unknownValue<number>() };
    expect(statusOf(component)).toBe('WARNING');
    expect(validateComponent(component).some((i) => i.severity === 'error')).toBe(false);
    expect(completenessOf(component).Rjc).toBe(false);
  });

  it('treats a negative Rjc as an error (04 §38 case C)', () => {
    const component = { ...readyPA() };
    component.thermal_spec = { ...component.thermal_spec, r_jc_C_per_W: sourced(-1, 'Manual') };
    expect(statusOf(component)).toBe('ERROR');
  });

  it('never coerces an unknown Rjc to zero (AC-04-06)', () => {
    const component = base();
    expect(component.thermal_spec.r_jc_C_per_W).toBeNull();

    const withUnknown = {
      ...component,
      thermal_spec: { ...component.thermal_spec, r_jc_C_per_W: unknownValue<number>() },
    };
    expect(withUnknown.thermal_spec.r_jc_C_per_W?.value).toBeNull();
    expect(withUnknown.thermal_spec.r_jc_C_per_W?.value).not.toBe(0);
  });

  it('keeps a case-limited part on Tc (04 §38 case D)', () => {
    const ddr = {
      ...readyPA(),
      name: 'DDR4',
      category: 'Digital' as const,
      thermal_spec: {
        ...readyPA().thermal_spec,
        limit_type: 'Tc' as const,
        limit_C: sourced(95, 'Datasheet'),
      },
    };
    expect(ddr.thermal_spec.limit_type).toBe('Tc');
    expect(statusOf(ddr)).toBe('READY');
    // Nothing in validation pushes it back to Tj.
    expect(validateComponent(ddr).some((i) => i.field === 'limit_type')).toBe(false);
  });

  it('rejects zero and negative qty but allows zero power', () => {
    expect(statusOf(base({ qty: 0 }))).toBe('ERROR');
    expect(statusOf(base({ qty: 1.5 }))).toBe('ERROR');

    const passive = { ...readyPA(), power_W: sourced(0, 'Manual') };
    expect(statusOf(passive)).toBe('READY');
  });

  it('derives contact area from contact dims, pad dims or a custom override', () => {
    const geometry = emptyThermalSpec().geometry;
    expect(contactAreaMm2(geometry)).toBeNull();
    expect(contactAreaMm2({ ...geometry, pad_L_mm: 4, pad_W_mm: 5 })).toBe(20);
    expect(
      contactAreaMm2({ ...geometry, pad_L_mm: 4, pad_W_mm: 5, contact_L_mm: 2, contact_W_mm: 3 }),
    ).toBe(6);
    expect(
      contactAreaMm2({
        ...geometry,
        contact_L_mm: 2,
        contact_W_mm: 3,
        custom_contact_area_mm2: 99,
      }),
    ).toBe(99);
  });

  it('summarises the project, excluding disabled components', () => {
    const enabled = readyPA();
    const disabled = { ...readyPA(), id: 'CMP_OFF', name: 'Off', enabled: false };
    const summary = summarizeReadiness([enabled, disabled]);

    expect(summary.components).toBe(4);
    expect(summary.heat_sources).toBe(4);
    expect(summary.total_power_W).toBeCloseTo(208.52, 2);
    expect(summary.ready).toBe(1);
    expect(summary.disabled).toBe(1);
    expect(totalPowerW([enabled, disabled])).toBeCloseTo(208.52, 2);
  });

  it('computes Total Power as Qty × Power, not edge heat flow', () => {
    expect(componentTotalPowerW(readyPA())).toBeCloseTo(208.52, 2);
  });
});

// --- Invalidation matrix ---------------------------------------------------

describe('downstream invalidation (04 §32)', () => {
  it('marks both network review and solver dirty for topology-shaping fields', () => {
    for (const field of ['category', 'qty', 'tim.type', 'board_path.type', 'geometry']) {
      expect(effectOfChange(field, false)).toMatchObject({
        networkReview: true,
        solverDirty: true,
      });
    }
  });

  it('marks only the solver dirty for power and Rjc', () => {
    for (const field of ['power_W', 'r_jc_C_per_W']) {
      expect(effectOfChange(field, false)).toMatchObject({
        networkReview: false,
        solverDirty: true,
      });
    }
    expect(effectOfChange('power_W', false).dirtyReasons).toEqual(['component_power_changed']);
    expect(effectOfChange('r_jc_C_per_W', false).dirtyReasons).toEqual(['component_rth_changed']);
  });

  it('does not invalidate the physical solve for limit changes', () => {
    for (const field of ['limit_C', 'limit_type']) {
      expect(effectOfChange(field, false)).toEqual({
        networkReview: false,
        solverDirty: false,
        dirtyReasons: [],
      });
    }
  });

  it('invalidates nothing for provenance or a FloTHERM alias', () => {
    for (const field of ['provenance', 'external_mappings', 'flotherm_alias', 'notes']) {
      expect(effectOfChange(field, false)).toEqual({
        networkReview: false,
        solverDirty: false,
        dirtyReasons: [],
      });
    }
  });

  it('makes a rename consequential only once the component is mapped', () => {
    expect(effectOfChange('name', false)).toEqual({
      networkReview: false,
      solverDirty: false,
      dirtyReasons: [],
    });
    expect(effectOfChange('name', true)).toMatchObject({ networkReview: true, solverDirty: true });
  });

  it('knows a component is mapped once Screen 05 drafted a profile', () => {
    expect(isMappedToNetwork(readyPA())).toBe(false);
    expect(
      isMappedToNetwork({
        ...readyPA(),
        architecture_prep: { ...readyPA().architecture_prep, thermal_profile_status: 'Draft' },
      }),
    ).toBe(true);
  });

  it('combines a batch of edits into the strongest effect', () => {
    expect(
      combineEffects([effectOfChange('notes', false), effectOfChange('qty', false)]),
    ).toMatchObject({ networkReview: true, solverDirty: true });
  });
});

// --- Architecture prep never builds a graph --------------------------------

describe('architecture preferences are preparation only (04 §19, AC-04-12/13/14)', () => {
  it('stores a template preference without any topology', () => {
    const component = {
      ...readyPA(),
      architecture_prep: {
        ...emptyArchitecturePrep(),
        template_preference: 'BOTTOM_COOL_COIN' as const,
        preferred_base_zone: 'RF Left' as const,
        qty_model_preference: 'INDIVIDUAL' as const,
      },
    };

    // The component model has no node or edge field at all — the graph lives in
    // networkStore and is only written by Screen 05.
    expect('nodes' in component).toBe(false);
    expect('edges' in component).toBe(false);
    expect(component.architecture_prep.thermal_profile_status).toBe('Not Assigned');
  });

  it('records Qty 4 Individual as a preference, not four nodes (04 §38 case E)', () => {
    const component = {
      ...readyPA(),
      qty: 4,
      architecture_prep: {
        ...emptyArchitecturePrep(),
        qty_model_preference: 'INDIVIDUAL' as const,
      },
    };
    expect(component.architecture_prep.qty_model_preference).toBe('INDIVIDUAL');
    expect(component.qty).toBe(4);
  });
});

// --- Screen 03 deferred compatibility --------------------------------------

describe('03 FloTHERM deferred contract (04 §28)', () => {
  it('stores a FloTHERM alias verbatim without parsing it (04 §38 case G)', () => {
    const component = {
      ...readyPA(),
      external_mappings: {
        ...emptyExternalMappings(),
        flotherm: {
          object_aliases: ['RF_Board/PA1/Package'],
          mapping_status: 'unmapped' as const,
        },
      },
    };

    expect(component.external_mappings.flotherm?.object_aliases).toEqual(['RF_Board/PA1/Package']);
    // No temperature, no heat flow, no column assumption was derived from it.
    expect(component.external_mappings.flotherm).not.toHaveProperty('temperature');
    expect(component.external_mappings.flotherm?.mapping_status).toBe('unmapped');
  });

  it('keeps analytical, FloTHERM and measured Rth side by side (04 §28.5)', () => {
    const analytical = createRth(0.12, 'Analytical', 'medium', 'hand calc');
    const withCfd = setRthFromSource(analytical, 'FloTHERM', 0.15, 'high');
    const withBench = setRthFromSource(withCfd, 'Measurement', 0.17, 'high');
    const withManual = setRthFromSource(withBench, 'Manual', 0.2, 'low');

    expect(withManual.analytical).toBe(0.12);
    expect(withManual.flotherm).toBe(0.15);
    expect(withManual.measurement).toBe(0.17);
    expect(withManual.manual).toBe(0.2);
    // The analytical value was never overwritten and remains the active source.
    expect(withManual.active_source).toBe('Analytical');
  });

  it('writes one result source without disturbing the others', () => {
    const analytical: ResultValue<number> = {
      value: 92.4,
      unit: '°C',
      source: 'analytical',
      scenario_id: 'SCN_001',
    };
    const flotherm: ResultValue<number> = {
      value: 95.1,
      unit: '°C',
      source: 'flotherm',
      scenario_id: 'SCN_001',
    };

    const set = setResult(setResult({}, 'analytical', analytical), 'flotherm', flotherm);
    expect(set.analytical?.value).toBe(92.4);
    expect(set.flotherm?.value).toBe(95.1);
  });
});

// --- Library ---------------------------------------------------------------

describe('component library (04 §26, AC-04-11)', () => {
  it('excludes project-specific graph, mapping and zone data', () => {
    const component: Component = {
      ...readyPA(),
      architecture_prep: {
        template_preference: 'BOTTOM_COOL_COIN',
        preferred_base_zone: 'RF Left',
        qty_model_preference: 'INDIVIDUAL',
        thermal_profile_status: 'Ready',
      },
      external_mappings: {
        flotherm: { object_aliases: ['RF_Board/PA1'], mapping_status: 'mapped' },
      },
    };

    const entry = toLibraryEntry(component);
    const serialized = JSON.stringify(entry);

    expect(entry.thermal_spec.r_jc_C_per_W?.value).toBe(0.35);
    expect(entry.template_preference).toBe('BOTTOM_COOL_COIN');
    // Base zone, FloTHERM mapping and profile status must not travel.
    expect(serialized).not.toContain('RF Left');
    expect(serialized).not.toContain('RF_Board/PA1');
    expect(serialized).not.toContain('thermal_profile_status');
    expect(entry).not.toHaveProperty('preferred_base_zone');
  });

  it('rehydrates into a project component with a clean, unmapped state', () => {
    const entry = toLibraryEntry(readyPA());
    const rehydrated = fromLibraryEntry(entry, { id: 'CMP_NEW', qty: 2 });

    expect(rehydrated.qty).toBe(2);
    expect(rehydrated.thermal_spec.r_jc_C_per_W?.value).toBe(0.35);
    expect(rehydrated.architecture_prep.preferred_base_zone).toBe('Unassigned');
    expect(rehydrated.architecture_prep.thermal_profile_status).toBe('Not Assigned');
    expect(rehydrated.external_mappings.flotherm?.mapping_status).toBe('unmapped');
  });
});

// --- Legacy compatibility --------------------------------------------------

describe('legacy compatibility (04 §30)', () => {
  const legacy = {
    Component: 'Final PA',
    Qty: 4,
    'Power(W)': 52.13,
    'Height(mm)': 250,
    Pad_L: 20,
    Pad_W: 10,
    'Thick(mm)': 2.5,
    Board_Type: 'Cu Coin',
    'Limit(C)': 180,
    R_jc: 0.35,
    TIM_Type: 'Grease',
    category: 'rf',
    tcPlacement: 'top-center',
    validation: { checked: true },
  };

  const adapt = () =>
    legacyComponentToCanonical(legacy, {
      id: 'CMP_FINAL_PA',
      provenance: {
        source_type: 'ExistingProject',
        source_project_id: 'VOL_TOOL',
        source_project_name: 'Volume Tool',
        source_file: null,
        imported_at: '2026-01-01T00:00:00Z',
      },
      normalizeBoardType,
      normalizeTim,
    });

  it('reads the current tool data correctly (AC-04-17)', () => {
    const component = adapt();
    expect(component.name).toBe('Final PA');
    expect(component.category).toBe('RF');
    expect(component.qty).toBe(4);
    expect(component.power_W.value).toBeCloseTo(52.13);
    expect(component.thermal_spec.r_jc_C_per_W?.value).toBe(0.35);
    expect(component.thermal_spec.board_path.type).toBe('Copper Coin');
    expect(component.thermal_spec.tim.type).toBe('Grease');
  });

  it('does not silently reinterpret legacy geometry (04 §30)', () => {
    const component = adapt();
    expect(component.thermal_spec.geometry.needs_review).toBe(true);
    expect(component.thermal_spec.geometry.package_H_mm).toBeNull();
    expect(validateComponent(component).some((i) => i.message.includes('legacy geometry'))).toBe(
      true,
    );
  });

  // Height is a vertical POSITION in the Volume Tool, feeding its local-ambient
  // correction. It is not package geometry and this tool models no such
  // correction, so it survives as metadata rather than as a geometry field.
  it('keeps legacy Height as metadata rather than geometry', () => {
    const component = adapt();
    expect(component.metadata?.['Height(mm)']).toBe(250);
    expect(component.thermal_spec.geometry).not.toHaveProperty('legacy_height_mm');
  });

  it('infers the limit surface the legacy schema never recorded', () => {
    const component = adapt();
    // An RF part is quoted against the junction — but it is only a guess.
    expect(component.thermal_spec.limit_type).toBe('Tj');
    expect(component.thermal_spec.limit_type_confirmed).toBe(false);
  });

  it('does not claim a limit type the legacy schema never stated', () => {
    // The schema has no such column, so the surface is inferred, and inferring
    // it is recorded as unconfirmed rather than presented as fact.
    expect(adapt().thermal_spec.limit_type_confirmed).toBe(false);
  });

  it('preserves unknown legacy fields through a round trip (AC-04-18, 04 §38 case H)', () => {
    const component = adapt();
    expect(component.metadata?.tcPlacement).toBe('top-center');
    expect(component.metadata?.validation).toEqual({ checked: true });

    const back = canonicalComponentToLegacy(component);
    expect(back.tcPlacement).toBe('top-center');
    expect(back.validation).toEqual({ checked: true });
    expect(back.Component).toBe('Final PA');
    expect(back['Power(W)']).toBeCloseTo(52.13);
    expect(back.category).toBe('rf');
  });
});

// --- SourcedValue ----------------------------------------------------------

describe('SourcedValue', () => {
  it('keeps the source when the value changes', () => {
    const original = sourced(0.35, 'Datasheet', { reference: 'PA rev C' });
    const edited = withValue(original, 0.4, 'Manual');
    expect(edited.value).toBe(0.4);
    expect(edited.source).toBe('Manual');
    expect(edited.reference).toBe('PA rev C');
  });

  it('represents unknown as null with low confidence', () => {
    const unknown = unknownValue<number>('Imported');
    expect(unknown.value).toBeNull();
    expect(unknown.confidence).toBe('low');
  });
});
