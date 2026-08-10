/**
 * Demo dataset mirroring 01/01_Project_Info_mock.json.
 *
 * Used to exercise the populated states of Screens 01 and 02 (Project Overview
 * KPIs, Project Health, duplicate detection on import). The component list
 * reproduces the mock's derived totals: 18 units, 9 heat sources, 412.3 W.
 */

import type { Project, Scenario } from '@/domain/project';
import { SCHEMA_VERSION } from '@/domain/project';
import {
  emptyArchitecturePrep,
  emptyExternalMappings,
  emptyThermalSpec,
  type Component,
  type ComponentProvenance,
  type LimitType,
  type PackageType,
} from '@/domain/component';
import { sourced, unknownValue } from '@/domain/sourcedValue';

export const DEMO_PROJECT_ID = 'CBNG_FR1_RRU_EVT2';
/** A second project so Screen 02's "Existing Project" source has something to read. */
export const DEMO_SOURCE_PROJECT_ID = 'RRU_VOLUME_REF_A';

export function demoProject(): Project {
  const now = new Date().toISOString();
  return {
    project_id: DEMO_PROJECT_ID,
    project_name: 'CBNG FR1 RRU EVT2',
    project_context: {
      customer: 'CBNG / Verizon',
      owner: 'Tedus',
      description: 'FR1 outdoor RRU thermal network development',
      product_type: 'RRU',
      frequency_range: 'FR1',
      project_stage: 'EVT',
      cooling_architecture: 'Natural Convection',
      enclosure_type: 'Outdoor Sealed',
      main_heat_rejection: ['Rear Heat Sink'],
      base_architecture: 'Small Base + Main Base',
      notes: [
        '• Design assumptions follow GR-487 Issue 4 (outdoor equipment environmental conditions).',
        '• Solar condition is not applied for the baseline scenario (placeholder).',
        '• Natural convection baseline with rear heat sink as main heat rejection path.',
        '• Detailed boundary conditions and material properties are defined in later screens.',
      ].join('\n'),
    },
    active_scenario_id: 'SCN_001',
    status: 'active',
    meta: { created_at: now, updated_at: now, schema_version: SCHEMA_VERSION },
  };
}

export function demoSourceProject(): Project {
  const now = new Date().toISOString();
  return {
    ...demoProject(),
    project_id: DEMO_SOURCE_PROJECT_ID,
    project_name: 'RRU Volume Reference A',
    project_context: {
      ...demoProject().project_context,
      description: 'Reference component set carried over from the Volume Evaluation Tool',
      project_stage: 'Architecture',
      notes: '',
    },
    meta: { created_at: now, updated_at: now, schema_version: SCHEMA_VERSION },
  };
}

export function demoScenario(projectId = DEMO_PROJECT_ID): Scenario {
  return {
    id: 'SCN_001',
    project_id: projectId,
    name: '55C_0mps',
    ambient_C: 55,
    wind_mps: 0,
    solar_W_m2: 0,
    power_scale: 1,
    notes: 'Baseline natural convection scenario',
    is_default: true,
  };
}

function provenance(sourceProjectId: string, sourceProjectName: string): ComponentProvenance {
  return {
    source_type: 'ExistingProject',
    source_project_id: sourceProjectId,
    source_project_name: sourceProjectName,
    source_file: null,
    imported_at: new Date().toISOString(),
  };
}

interface Seed {
  id: string;
  name: string;
  category: Component['category'];
  qty: number;
  power_W: number;
  r_jc?: number | null;
  limit_C?: number | null;
  limit_type?: LimitType;
  package_type?: PackageType;
  board_type?: Component['thermal_spec']['board_path']['type'];
  tim?: Component['thermal_spec']['tim']['type'];
  pad?: [number, number];
}

function build(seeds: Seed[], sourceId: string, sourceName: string): Component[] {
  return seeds.map((seed) => {
    const spec = emptyThermalSpec();
    return {
      id: seed.id,
      name: seed.name,
      category: seed.category,
      enabled: true,
      qty: seed.qty,
      power_W: sourced(seed.power_W, 'Imported', { confidence: 'medium' }),
      thermal_spec: {
        ...spec,
        limit_type: seed.limit_type ?? 'Unknown',
        limit_C: seed.limit_C == null ? null : sourced(seed.limit_C, 'Datasheet'),
        r_jc_C_per_W:
          seed.r_jc == null ? unknownValue<number>('Imported') : sourced(seed.r_jc, 'Datasheet'),
        package_type: seed.package_type ?? null,
        geometry: {
          ...spec.geometry,
          pad_L_mm: seed.pad?.[0] ?? null,
          pad_W_mm: seed.pad?.[1] ?? null,
        },
        board_path: { type: seed.board_type ?? 'None', parameters: {} },
        tim: { ...spec.tim, type: seed.tim ?? 'None', inheritance: 'project' },
      },
      architecture_prep: emptyArchitecturePrep(),
      provenance: provenance(sourceId, sourceName),
      external_mappings: emptyExternalMappings(),
    };
  });
}

/** 9 dissipating units + 9 passive units = 18 components, 412.3 W total. */
export function demoComponents(): Component[] {
  return build(
    [
      {
        id: 'CMP_FINAL_PA',
        name: 'Final PA',
        category: 'RF',
        qty: 4,
        power_W: 52.13,
        r_jc: 0.18,
        limit_C: 180,
        limit_type: 'Tj',
        package_type: 'QFN',
        pad: [20, 10],
        board_type: 'Copper Coin',
        tim: 'Grease',
      },
      {
        id: 'CMP_DRIVER_PA',
        name: 'Driver PA',
        category: 'RF',
        qty: 2,
        power_W: 18.0,
        r_jc: 0.45,
        limit_C: 150,
        limit_type: 'Tj',
        package_type: 'QFN',
        pad: [5, 5],
        board_type: 'Copper Coin',
        tim: 'Grease',
      },
      {
        id: 'CMP_TRANSCEIVER',
        name: 'Transceiver',
        category: 'RF',
        qty: 1,
        power_W: 22.5,
        r_jc: 0.6,
        limit_C: 110,
        board_type: 'Thermal Via',
        tim: 'Pad',
      },
      {
        id: 'CMP_FPGA',
        name: 'FPGA',
        category: 'Digital',
        qty: 1,
        power_W: 85.0,
        r_jc: 0.12,
        limit_C: 100,
        limit_type: 'Tj',
        package_type: 'BGA',
        pad: [35, 35],
        board_type: 'Thermal Via',
        tim: 'Pad',
      },
      {
        id: 'CMP_DCDC',
        name: 'DC-DC Converter',
        category: 'Power',
        qty: 1,
        power_W: 60.28,
        r_jc: 0.9,
        limit_C: 125,
        board_type: 'None',
        tim: 'Putty',
      },
      { id: 'CMP_DUPLEXER', name: 'Duplexer', category: 'Filter', qty: 2, power_W: 0 },
      { id: 'CMP_RF_CONNECTOR', name: 'RF Connector', category: 'Other', qty: 4, power_W: 0 },
      { id: 'CMP_SHIELDING_CAN', name: 'Shielding Can', category: 'Other', qty: 3, power_W: 0 },
    ],
    DEMO_SOURCE_PROJECT_ID,
    'RRU Volume Reference A',
  );
}

/**
 * The reference project Screen 02 imports FROM. Deliberately overlaps with the
 * demo project on "Final PA" and "FPGA" so duplicate handling has something real
 * to resolve, and carries rows with missing Rjc / zero power to exercise warnings.
 */
export function demoSourceComponents(): Component[] {
  return build(
    [
      {
        id: 'SRC_FINAL_PA',
        name: 'Final PA',
        category: 'RF',
        qty: 4,
        power_W: 52.13,
        r_jc: 0.35,
        limit_C: 180,
        board_type: 'Copper Coin',
        tim: 'Grease',
      },
      {
        id: 'SRC_DRIVER_PA_8W',
        name: 'Driver PA 8W',
        category: 'RF',
        qty: 4,
        power_W: 9.54,
        r_jc: null,
        limit_C: 180,
        board_type: 'Copper Coin',
        tim: 'Grease',
      },
      {
        id: 'SRC_LNA',
        name: 'LNA',
        category: 'RF',
        qty: 4,
        power_W: 0.5,
        r_jc: 0.8,
        limit_C: 95,
        board_type: 'Thermal Via',
        tim: 'Pad',
      },
      {
        id: 'SRC_FPGA',
        name: 'FPGA',
        category: 'Digital',
        qty: 1,
        power_W: 35.0,
        r_jc: 0.16,
        limit_C: 110,
        board_type: 'Thermal Via',
        tim: 'Putty',
      },
      {
        id: 'SRC_DDR4',
        name: 'DDR4 4Gb',
        category: 'Digital',
        qty: 4,
        power_W: 2.5,
        r_jc: 0.32,
        limit_C: 95,
        board_type: 'Thermal Via',
        tim: 'Pad',
      },
      {
        id: 'SRC_MCU',
        name: 'MCU',
        category: 'Digital',
        qty: 1,
        power_W: 1.2,
        r_jc: 0.5,
        limit_C: 95,
        board_type: 'Thermal Via',
        tim: 'Pad',
      },
      {
        id: 'SRC_POWER_MODULE',
        name: 'Power Module',
        category: 'Power',
        qty: 1,
        power_W: 29.0,
        r_jc: 0.3,
        limit_C: 110,
        board_type: 'None',
        tim: 'Grease',
      },
      {
        id: 'SRC_BPF',
        name: 'BPF 2.6G',
        category: 'Filter',
        qty: 1,
        power_W: 31.07,
        r_jc: null,
        limit_C: 110,
        board_type: 'None',
        tim: 'Pad',
      },
      {
        id: 'SRC_INDUCTOR',
        name: 'Inductor 100uH',
        category: 'Other',
        qty: 2,
        power_W: 0.8,
        r_jc: null,
        limit_C: null,
        board_type: 'None',
      },
    ],
    'RRU_VOLUME_LEGACY',
    'RRU Volume Tool (legacy export)',
  );
}
