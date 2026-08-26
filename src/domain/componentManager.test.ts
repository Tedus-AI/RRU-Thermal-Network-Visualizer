import { BUILTIN_TIM_IDS, MEASURED_INTERFACE_TIM_ID } from '@/domain/materials';
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
  GEOMETRY_RULES,
  sourceAreaMm2,
  heatPathPatch,
  sourceFaceMm,
  createComponent,
  emptyArchitecturePrep,
  emptyExternalMappings,
  TEMPLATE_FOR_HEAT_PATH,
  emptyThermalSpec,
  inferHeatPath,
  inferLimitType,
  metalBaseContactAreaMm2,
  metalBaseExposedAreaMm2,
  spreadAreaMm2,
  spreadFaceMm,
  spreadingAreaMm2,
  totalPowerW,
  type Component,
  ARCHITECTURE_TEMPLATES,
  HEAT_PATH_LABELS,
  HEAT_PATH_TYPES,
  LEGACY_HEAT_PATHS,
  MODULE_SURFACE_EQUIVALENT_PARAMETERS,
  migrateHeatPathType,
  emptyGeometry,
  PACKAGE_TYPES,
  PACKAGE_TYPE_HINTS,
  cavityFilterBodyPrefill,
  emptyMount,
  mountFootprintMm2,
  mountPipeCount,
  type MountSpec,
  type ThermalSpec,
} from './component';
import { sourced, unknownValue, withValue } from './sourcedValue';
import { setResult, type ResultValue } from '@/thermal/resultValue';
import { createRth, setRthFromSource } from '@/thermal/rth';
import {
  canonicalComponentToLegacy,
  legacyComponentToCanonical,
} from '@/adapters/legacyComponentAdapter';
import { normalizeHeatPath } from '@/importers/component/normalizeComponent';
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
      // A Coin path takes its joint face from the package, because that is the
      // face the part is reflowed onto.
      geometry: { ...emptyThermalSpec().geometry, package_L_mm: 20, package_W_mm: 10 },
      heat_path: { type: 'Coin', parameters: {} },
      heat_path_confirmed: true,
      tim: { ...emptyThermalSpec().tim, tim_id: BUILTIN_TIM_IDS.grease },
    },
    architecture_prep: {
      ...emptyArchitecturePrep(),
      template_preference: 'BOTTOM_COOL_COIN',
      // Screen 04 no longer asks for a template — the heat path decides it —
      // so the open architecture choice, and what READY now requires, is which
      // shared structure the part attaches to.
      preferred_base_zone: 'RF Left',
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

  it('treats Rjc as N/A for a manufacturer-surface module', () => {
    const module = readyPA();
    module.name = 'Power Module';
    module.category = 'Power';
    module.thermal_spec = {
      ...module.thermal_spec,
      limit_type: 'Ts',
      limit_reference_note: 'Center',
      r_jc_C_per_W: null,
      geometry: {
        ...module.thermal_spec.geometry,
        package_L_mm: 58,
        package_W_mm: 26,
        source_L_mm: null,
        source_W_mm: null,
      },
      heat_path: {
        type: 'DirectMetal',
        parameters: { source_model: 'SurfaceBodyBased', contact_geometry: 'FullBase' },
      },
    };
    module.architecture_prep.template_preference = 'DIRECT_METAL';

    expect(completenessOf(module).Rjc).toBe(true);
    expect(validateComponent(module).some((issue) => issue.field === 'r_jc_C_per_W')).toBe(false);
    expect(statusOf(module)).toBe('READY');
  });

  it('requires a surface reference and its exact datasheet location for that model', () => {
    const module = readyPA();
    module.thermal_spec = {
      ...module.thermal_spec,
      limit_type: 'Tj',
      limit_reference_note: '',
      r_jc_C_per_W: null,
      geometry: {
        ...module.thermal_spec.geometry,
        package_L_mm: 58,
        package_W_mm: 26,
        source_L_mm: null,
        source_W_mm: null,
      },
      heat_path: {
        type: 'DirectMetal',
        parameters: { source_model: 'SurfaceBodyBased', contact_geometry: 'FullBase' },
      },
    };

    const issues = validateComponent(module);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'limit_type', severity: 'error' }),
        expect.objectContaining({ field: 'limit_reference_note', severity: 'warning' }),
      ]),
    );
    expect(completenessOf(module).Limit).toBe(false);
  });

  it('requires a positive characterized Rth for a measured Metal Base interface', () => {
    const component = readyPA();
    component.thermal_spec = {
      ...component.thermal_spec,
      limit_type: 'Tc',
      limit_reference_note: 'Center',
      r_jc_C_per_W: null,
      heat_path: {
        type: 'DirectMetal',
        parameters: {
          source_model: 'SurfaceBodyBased',
          contact_geometry: 'FullBase',
        },
      },
      tim: {
        ...component.thermal_spec.tim,
        tim_id: MEASURED_INTERFACE_TIM_ID,
        measured_rth_C_per_W: sourced(0, 'Measurement'),
      },
    };

    expect(completenessOf(component).TIM).toBe(false);
    expect(validateComponent(component).some((issue) => issue.field === 'tim.measured_rth_C_per_W')).toBe(
      true,
    );

    component.thermal_spec.tim.measured_rth_C_per_W = sourced(0.12, 'Measurement');
    expect(completenessOf(component).TIM).toBe(true);
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

  it('derives source area from L × W, or a custom override', () => {
    const geometry = emptyThermalSpec().geometry;
    expect(sourceAreaMm2(geometry)).toBeNull();
    expect(sourceAreaMm2({ ...geometry, source_L_mm: 4, source_W_mm: 5 })).toBe(20);
    // A coin-soldered part is joined across its whole base, so on that path the
    // joint face follows the package and the source pair is not read at all.
    expect(
      sourceAreaMm2(
        { ...geometry, package_L_mm: 20, package_W_mm: 10, source_L_mm: 4, source_W_mm: 5 },
        'Coin',
      ),
    ).toBe(200);
  });

  // The whole point of splitting the two faces: heat enters across one and
  // leaves across the other, and for a bottom-cooled part they differ a lot.
  describe('spread area', () => {
    const board = {
      ...emptyThermalSpec().geometry,
      source_L_mm: 10,
      source_W_mm: 10,
      board_thickness_mm: 2.5,
    };

    it('spreads a board path by one board thickness across the footprint', () => {
      expect(spreadAreaMm2(board, 'Board')).toBeCloseTo(12.5 * 12.5, 6);
    });

    it('uses the geometric mean for conduction through the spreader', () => {
      expect(spreadingAreaMm2(board, 'Board')).toBeCloseTo(Math.sqrt(100 * 156.25), 6);
    });

    it('does not spread a top-cooled or bolted part', () => {
      // A bolted part states its contact face; a top-cooled one leaves through
      // the case top, which is the package outline — so each reads its own.
      expect(spreadAreaMm2({ ...board, package_L_mm: 8, package_W_mm: 8 }, 'TopSurface')).toBe(64);
      expect(spreadAreaMm2(board, 'DirectMetal')).toBe(100);
    });

    // A fabricated coin size would silently move every PA's margin.
    it('leaves a coin path unresolved until a coin size is supplied', () => {
      expect(spreadAreaMm2(board, 'Coin')).toBeNull();
      expect(spreadAreaMm2(board, 'Coin', 55 * 35)).toBe(1925);
    });

    /**
     * No path takes a stated spread face any more — every one derives it, which
     * is the only way the field the user reads and the area the solver uses can
     * be guaranteed to agree.
     */
    it('derives the spread face on every path, and says the same thing twice', () => {
      for (const path of ['Board', 'TopSurface', 'DirectMetal'] as const) {
        const face = spreadFaceMm(board, path);
        const area = spreadAreaMm2(board, path);
        expect(face.L != null && face.W != null ? face.L * face.W : null).toBe(area);
      }
      const coinFace = spreadFaceMm(board, 'Coin', { L: 55, W: 35 });
      expect(coinFace).toEqual({ L: 55, W: 35 });
      expect(spreadAreaMm2(board, 'Coin', 1925)).toBe(1925);
    });

    it('cannot spread without the inputs, and never invents them', () => {
      const bare = { ...emptyThermalSpec().geometry, source_L_mm: 10, source_W_mm: 10 };
      expect(spreadAreaMm2(bare, 'Board')).toBeNull();
      // Not even a conservative fall-back: an unknown far face means an unknown
      // area, and a resolved-looking guess would reorder the bottleneck ranking.
      expect(spreadingAreaMm2(bare, 'Board')).toBeNull();
    });

    it('still resolves where the path genuinely does not spread', () => {
      const bare = { ...emptyThermalSpec().geometry, source_L_mm: 10, source_W_mm: 10 };
      expect(spreadingAreaMm2({ ...bare, package_L_mm: 10, package_W_mm: 10 }, 'TopSurface')).toBe(
        100,
      );
      expect(spreadingAreaMm2(bare, 'DirectMetal')).toBe(100);
    });
  });

  describe('heat path', () => {
    it('mirrors the Volume Tool category defaults', () => {
      expect(inferHeatPath('RF')).toBe('Coin');
      expect(inferHeatPath('Digital')).toBe('Board');
      expect(inferHeatPath('Power')).toBe('TopSurface');
      expect(inferHeatPath('Filter')).toBe('DirectMetal');
    });

    it('leaves a new component unconfirmed and warns about it', () => {
      const component = base();
      expect(component.thermal_spec.heat_path_confirmed).toBe(false);
      expect(completenessOf(component)['Heat Path']).toBe(false);
      expect(validateComponent(component).some((i) => i.field === 'heat_path.type')).toBe(true);
    });

    it('maps each path onto the template it implies', () => {
      expect(TEMPLATE_FOR_HEAT_PATH.Coin).toBe('BOTTOM_COOL_COIN');
      expect(TEMPLATE_FOR_HEAT_PATH.Board).toBe('BOTTOM_COOL_VIA');
      expect(TEMPLATE_FOR_HEAT_PATH.TopSurface).toBe('TOP_COOL_LID');
      expect(TEMPLATE_FOR_HEAT_PATH.DirectMetal).toBe('DIRECT_METAL');
    });
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
    for (const field of [
      'category',
      'qty',
      'tim.type',
      'heat_path.type',
      'heat_path.parameters.source_model',
      'heat_path.parameters.exposed_surface_enabled',
      'geometry',
    ]) {
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
    for (const field of ['limit_C', 'limit_type', 'limit_reference_note']) {
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
      normalizeHeatPath,
      resolveTimId: () => BUILTIN_TIM_IDS.grease,
    });

  it('reads the current tool data correctly (AC-04-17)', () => {
    const component = adapt();
    expect(component.name).toBe('Final PA');
    expect(component.category).toBe('RF');
    expect(component.qty).toBe(4);
    expect(component.power_W.value).toBeCloseTo(52.13);
    expect(component.thermal_spec.r_jc_C_per_W?.value).toBe(0.35);
    expect(component.thermal_spec.heat_path.type).toBe('Coin');
    expect(component.thermal_spec.tim.tim_id).toBe(BUILTIN_TIM_IDS.grease);
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

  it('round-trips the TNV-only module-surface semantics through a legacy row', () => {
    const module = readyPA();
    module.name = 'Power Module';
    module.category = 'Power';
    module.thermal_spec = {
      ...module.thermal_spec,
      limit_type: 'Ts',
      limit_reference_note: 'Center',
      r_jc_C_per_W: null,
      heat_path: {
        type: 'DirectMetal',
        parameters: { source_model: 'SurfaceBodyBased', contact_geometry: 'FullBase' },
      },
    };

    const row = canonicalComponentToLegacy(module);
    expect(row.Board_Type).toBe('None');
    expect(row._tnv_heat_path).toBe('DirectMetal');

    const restored = legacyComponentToCanonical(row, {
      id: 'CMP_POWER_MODULE',
      provenance: module.provenance,
      normalizeHeatPath,
      resolveTimId: () => BUILTIN_TIM_IDS.grease,
    });
    expect(restored.thermal_spec).toMatchObject({
      // The legacy row cannot carry a metal-face path, so the round trip lands
      // on the merged one via the importer's alias table.
      heat_path: { type: 'DirectMetal' },
      limit_type: 'Ts',
      limit_type_confirmed: true,
      limit_reference_note: 'Center',
      r_jc_C_per_W: null,
    });
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

/**
 * A coin-soldered part is reflowed onto the coin across its whole base, so on
 * that path the joint face IS the package outline and the coin's own footprint
 * is the project's. Neither is typed twice, and neither can drift.
 */
describe('coin geometry follows the package and the project', () => {
  const coin = () => {
    const component = readyPA();
    component.thermal_spec.geometry = {
      ...emptyThermalSpec().geometry,
      package_L_mm: 18,
      package_W_mm: 12,
      // Deliberately different, to prove they are not what a coin path reads.
      source_L_mm: 4,
      source_W_mm: 4,
    };
    return component;
  };

  it('takes the joint face from the package, not the source pair', () => {
    expect(sourceFaceMm(coin().thermal_spec.geometry, 'Coin')).toEqual({ L: 18, W: 12 });
    expect(sourceAreaMm2(coin().thermal_spec.geometry, 'Coin')).toBe(216);
  });

  /**
   * Two paths read the package and two read the stated pair — the split is
   * `GEOMETRY_RULES`, not a special case for coins.
   */
  it('reads the package on a top-cooled part too, and the pair on the rest', () => {
    const geometry = coin().thermal_spec.geometry;
    expect(sourceAreaMm2(geometry, 'TopSurface')).toBe(216);
    expect(sourceAreaMm2(geometry, 'Board')).toBe(16);
    expect(sourceAreaMm2(geometry, 'DirectMetal')).toBe(16);
  });

  it('takes the spread face from the project coin', () => {
    expect(spreadAreaMm2(coin().thermal_spec.geometry, 'Coin', 1925)).toBe(1925);
  });

  // With no project coin size there is no coin area — never a guess from the
  // component's own numbers, which would silently move every PA's margin.
  it('has no spread face at all until the project states the coin', () => {
    expect(spreadAreaMm2(coin().thermal_spec.geometry, 'Coin', null)).toBeNull();
  });
});

/**
 * The heat path chooses the resistance chain, and each chain has exactly one
 * template — so the template is written from the path rather than asked for a
 * second time where the two could disagree.
 */
describe('heatPathPatch', () => {
  it('sets the template the path implies, and confirms the path', () => {
    const patch = heatPathPatch(readyPA(), 'Board');
    expect(patch.thermal_spec.heat_path.type).toBe('Board');
    expect(patch.thermal_spec.heat_path_confirmed).toBe(true);
    expect(patch.architecture_prep.template_preference).toBe('BOTTOM_COOL_VIA');
  });

  it('keeps the two in step for every path', () => {
    for (const [path, template] of [
      ['Coin', 'BOTTOM_COOL_COIN'],
      ['Board', 'BOTTOM_COOL_VIA'],
      ['TopSurface', 'TOP_COOL_LID'],
      ['DirectMetal', 'DIRECT_METAL'],
    ] as const) {
      expect(heatPathPatch(readyPA(), path).architecture_prep.template_preference).toBe(template);
    }
  });

  it('leaves the base zone alone — that is a separate decision', () => {
    const component = readyPA();
    component.architecture_prep.preferred_base_zone = 'RF Right';
    expect(heatPathPatch(component, 'Board').architecture_prep.preferred_base_zone).toBe('RF Right');
  });

  it('defaults filters to a surface/body source and active parts to a junction source', () => {
    const filter = readyPA();
    filter.category = 'Filter';
    const passive = heatPathPatch(filter, 'DirectMetal');
    expect(passive.thermal_spec.heat_path.parameters.source_model).toBe('SurfaceBodyBased');

    const active = heatPathPatch(readyPA(), 'DirectMetal');
    expect(active.thermal_spec.heat_path.parameters.source_model).toBe('JunctionBased');
  });

  it('derives full-base, perimeter-frame and exposed-surface areas', () => {
    const spec = emptyThermalSpec('Tc', 'DirectMetal');
    spec.geometry = {
      ...spec.geometry,
      package_L_mm: 100,
      package_W_mm: 80,
      package_H_mm: 20,
    };
    spec.heat_path.parameters = {
      source_model: 'SurfaceBodyBased',
      contact_geometry: 'PerimeterFrame',
      perimeter_land_width_mm: 2,
      exposed_surface_enabled: true,
      exposed_area_mode: 'DerivedPackage',
    };
    expect(metalBaseContactAreaMm2(spec)).toBe(704);
    expect(metalBaseExposedAreaMm2(spec)).toBe(15_200);

    spec.heat_path.parameters.contact_geometry = 'FullBase';
    expect(metalBaseContactAreaMm2(spec)).toBe(8_000);
  });
});

/**
 * The rule table is the single answer to "which geometry does this path need",
 * read by the inspector and by the solver alike. If they ever disagree the user
 * edits one number and a different one is solved with, so it is pinned here.
 */
describe('GEOMETRY_RULES', () => {
  const geometry = {
    ...emptyThermalSpec().geometry,
    package_L_mm: 18,
    package_W_mm: 12,
    source_L_mm: 6,
    source_W_mm: 6,
    board_thickness_mm: 1.6,
  };

  it('asks for a source face only where the package cannot answer', () => {
    expect(GEOMETRY_RULES.Coin.source).toBe('package');
    expect(GEOMETRY_RULES.TopSurface.source).toBe('package');
    // An E-PAD and a bolt-down flange are both smaller than the outline, and
    // nothing but the datasheet or the drawing knows by how much.
    expect(GEOMETRY_RULES.Board.source).toBe('stated');
    expect(GEOMETRY_RULES.DirectMetal.source).toBe('stated');
  });

  it('names exactly one thickness per path, or none', () => {
    expect(GEOMETRY_RULES.Coin.thickness).toBe('project_coin');
    expect(GEOMETRY_RULES.Board.thickness).toBe('board');
    // Nothing conducts through a spreader on these two, so no thickness applies.
    expect(GEOMETRY_RULES.TopSurface.thickness).toBe('none');
    expect(GEOMETRY_RULES.DirectMetal.thickness).toBe('none');
  });

  it('derives the board spread face at 45 degrees, matching the Volume Tool', () => {
    expect(spreadFaceMm(geometry, 'Board')).toEqual({ L: 7.6, W: 7.6 });
  });

  it('leaves a non-spreading path on the face heat entered', () => {
    expect(spreadFaceMm(geometry, 'TopSurface')).toEqual({ L: 18, W: 12 });
    expect(spreadFaceMm(geometry, 'DirectMetal')).toEqual({ L: 6, W: 6 });
  });

  it('cannot derive a board spread face without the thickness', () => {
    const noThickness = { ...geometry, board_thickness_mm: null };
    expect(spreadFaceMm(noThickness, 'Board')).toEqual({ L: null, W: null });
    expect(spreadAreaMm2(noThickness, 'Board')).toBeNull();
  });

  /**
   * Changing the path must change what is asked for, with no stale value left
   * feeding the solver — the whole reason the spread pair stopped being stored.
   */
  it('switches cleanly between paths on one component', () => {
    expect(sourceAreaMm2(geometry, 'Coin')).toBe(216);
    expect(sourceAreaMm2(geometry, 'Board')).toBe(36);
    expect(spreadAreaMm2(geometry, 'Board')).toBeCloseTo(7.6 * 7.6, 6);
    expect(spreadAreaMm2(geometry, 'TopSurface')).toBe(216);
    expect(spreadAreaMm2(geometry, 'DirectMetal')).toBe(36);
  });

  /**
   * What ModuleSurface used to guarantee, now expressed through the option that
   * replaced it. Its whole contribution was "the contact IS the package
   * outline", and `contact_geometry: 'FullBase'` says exactly that — so a
   * migrated component still reads 18 x 12, not the 6 x 6 stated source face.
   */
  it('reads a full-base metal contact off the package outline', () => {
    const fullBase = sourceAreaMm2(geometry, 'DirectMetal', {
      source_model: 'SurfaceBodyBased',
      contact_geometry: 'FullBase',
    });
    expect(fullBase).toBe(216);
    // A perimeter land is smaller than the outline, which is the case
    // ModuleSurface could never express.
    const frame = sourceAreaMm2(geometry, 'DirectMetal', {
      source_model: 'SurfaceBodyBased',
      contact_geometry: 'PerimeterFrame',
      perimeter_land_width_mm: 2,
    });
    expect(frame).toBeLessThan(216);
  });
});

describe('the merged metal-face heat path', () => {
  const moduleGeometry = {
    ...emptyGeometry(),
    package_L_mm: 58,
    package_W_mm: 26,
    source_L_mm: null,
    source_W_mm: null,
  };

  /**
   * The merge is only safe if a migrated ModuleSurface component computes the
   * same number it always did. Its area came from the package outline; under
   * DirectMetal that is `contact_geometry: 'FullBase'`, and the migration
   * supplies it.
   */
  it('gives a migrated module the area it had before', () => {
    expect(
      sourceAreaMm2(moduleGeometry, 'DirectMetal', MODULE_SURFACE_EQUIVALENT_PARAMETERS),
    ).toBe(58 * 26);
  });

  it('maps the retired path and refuses to invent one', () => {
    expect(migrateHeatPathType('ModuleSurface')).toBe('DirectMetal');
    expect(LEGACY_HEAT_PATHS.ModuleSurface).toBe('DirectMetal');
    for (const path of HEAT_PATH_TYPES) expect(migrateHeatPathType(path)).toBe(path);
    expect(migrateHeatPathType('SomethingElse')).toBeNull();
    expect(migrateHeatPathType(undefined)).toBeNull();
  });

  it('no longer offers ModuleSurface anywhere a person can reach', () => {
    expect(HEAT_PATH_TYPES as readonly string[]).not.toContain('ModuleSurface');
    expect(ARCHITECTURE_TEMPLATES as readonly string[]).not.toContain('MODULE_SURFACE_TIM');
    // Every surviving path still names a template and a label.
    for (const path of HEAT_PATH_TYPES) {
      expect(TEMPLATE_FOR_HEAT_PATH[path]).toBeDefined();
      expect(HEAT_PATH_LABELS[path].zh.length).toBeGreaterThan(3);
    }
  });

  /**
   * Rjc is the thing the two paths disagreed about, and after the merge it is
   * `source_model` that decides — which is more accurate than the old test,
   * because a flanged transistor on a metal face DOES have one.
   */
  it('drops Rjc only for a surface-referenced source', () => {
    const surface = readyPA();
    surface.thermal_spec = {
      ...surface.thermal_spec,
      r_jc_C_per_W: null,
      limit_type: 'Ts',
      limit_reference_note: 'Center',
      geometry: moduleGeometry,
      heat_path: { type: 'DirectMetal', parameters: MODULE_SURFACE_EQUIVALENT_PARAMETERS },
    };
    expect(completenessOf(surface).Rjc).toBe(true);

    const junctionBased = readyPA();
    junctionBased.thermal_spec = {
      ...junctionBased.thermal_spec,
      r_jc_C_per_W: null,
      geometry: moduleGeometry,
      heat_path: {
        type: 'DirectMetal',
        parameters: { source_model: 'JunctionBased', contact_geometry: 'FullBase' },
      },
    };
    expect(completenessOf(junctionBased).Rjc).toBe(false);
  });
});

/**
 * A groove takes one pipe, so a two-pipe design is two grooves side by side.
 * Storing the total width instead meant doing that multiplication by hand and
 * keeping the answer rather than the design — 13 mm and "two 6.5s" are the same
 * number and not the same part.
 */
describe('pipes under an embedded heat pipe', () => {
  const embedded = (patch: Partial<MountSpec>): MountSpec => ({
    ...emptyMount('EmbeddedHeatPipe'),
    contact_L_mm: 35,
    contact_W_mm: 6.5,
    ...patch,
  });

  it('multiplies the copper by how many pipes there are', () => {
    expect(mountFootprintMm2(embedded({ heat_pipe_count: 2 }))).toBeCloseTo(455, 9);
  });

  it('reads a missing count as one pipe, so nothing stored earlier moves', () => {
    expect(mountFootprintMm2(embedded({ contact_W_mm: 13 }))).toBeCloseTo(455, 9);
    expect(mountPipeCount(embedded({}))).toBe(1);
  });

  it('never takes a fraction of a pipe, or less than one', () => {
    expect(mountPipeCount(embedded({ heat_pipe_count: 2.7 }))).toBe(2);
    expect(mountPipeCount(embedded({ heat_pipe_count: 0 }))).toBe(1);
    expect(mountPipeCount(embedded({ heat_pipe_count: -3 }))).toBe(1);
    expect(mountPipeCount(embedded({ heat_pipe_count: Number.NaN }))).toBe(1);
  });

  it('is an embedded-pipe idea only: a block is one block however many pipes are under it', () => {
    const block: MountSpec = {
      ...emptyMount('SmallBaseHeatPipe'),
      contact_L_mm: 30,
      contact_W_mm: 20,
      heat_pipe_count: 3,
    };
    expect(mountPipeCount(block)).toBe(1);
    expect(mountFootprintMm2(block)).toBeCloseTo(600, 9);
  });

  it('still refuses to invent an area from a missing dimension', () => {
    expect(mountFootprintMm2(embedded({ contact_W_mm: null, heat_pipe_count: 2 }))).toBeNull();
  });
});

/**
 * A machined cavity filter bolts down across most of the heat sink, so its body
 * outline starts as the base's. Retyping two numbers Screen 01 already holds is
 * how the two come to disagree.
 */
describe('cavity filter body prefill', () => {
  const BASE = { L_mm: 300, W_mm: 220 };

  function filter(patch: Partial<ThermalSpec> = {}): ThermalSpec {
    return {
      ...emptyThermalSpec(),
      package_type: 'Cavity Filter',
      heat_path: { type: 'DirectMetal', parameters: { source_model: 'SurfaceBodyBased' } },
      ...patch,
    };
  }

  it('fills the blank body outline from the HSK base', () => {
    expect(cavityFilterBodyPrefill(filter(), BASE)).toEqual({
      package_L_mm: 300,
      package_W_mm: 220,
    });
  });

  it('never overwrites a size somebody stated — a filter is usually smaller', () => {
    const stated = filter({
      geometry: { ...emptyThermalSpec().geometry, package_L_mm: 280, package_W_mm: 200 },
    });
    expect(cavityFilterBodyPrefill(stated, BASE)).toBeNull();
  });

  it('fills only the side that is blank', () => {
    const half = filter({
      geometry: { ...emptyThermalSpec().geometry, package_L_mm: 280 },
    });
    expect(cavityFilterBodyPrefill(half, BASE)).toEqual({ package_W_mm: 220 });
  });

  it('needs all three of the path, the source model and the package', () => {
    expect(cavityFilterBodyPrefill(filter({ package_type: 'Module' }), BASE)).toBeNull();
    expect(
      cavityFilterBodyPrefill(
        filter({ heat_path: { type: 'TopSurface', parameters: {} } }),
        BASE,
      ),
    ).toBeNull();
    expect(
      cavityFilterBodyPrefill(
        filter({
          heat_path: { type: 'DirectMetal', parameters: { source_model: 'JunctionBased' } },
        }),
        BASE,
      ),
    ).toBeNull();
  });

  it('fills nothing when Screen 01 has no base size yet', () => {
    expect(cavityFilterBodyPrefill(filter(), { L_mm: null, W_mm: undefined })).toBeNull();
    expect(cavityFilterBodyPrefill(filter(), { L_mm: 0, W_mm: 220 })).toEqual({
      package_W_mm: 220,
    });
  });

  it('is a package the list offers, not an off-list leftover', () => {
    expect(PACKAGE_TYPES).toContain('Cavity Filter');
    expect(PACKAGE_TYPE_HINTS['Cavity Filter'].zh).toBeTruthy();
  });
});
