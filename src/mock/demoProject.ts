/**
 * Demo dataset mirroring 01/01_Project_Info_mock.json.
 *
 * Used to exercise the populated states of Screen 01 (Project Overview KPIs,
 * Project Health, Recommended Next Step) before Screen 02 can import real
 * component data. The component list reproduces the mock's derived totals:
 * 18 components, 9 heat sources, 412.3 W.
 */

import type { Project, Scenario } from '@/domain/project';
import { SCHEMA_VERSION } from '@/domain/project';
import type { ComponentRecord } from '@/data/componentStore';

export const DEMO_PROJECT_ID = 'CBNG_FR1_RRU_EVT2';

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

export function demoScenario(): Scenario {
  return {
    id: 'SCN_001',
    project_id: DEMO_PROJECT_ID,
    name: '55C_0mps',
    ambient_C: 55,
    wind_mps: 0,
    solar_W_m2: 0,
    power_scale: 1,
    notes: 'Baseline natural convection scenario',
    is_default: true,
  };
}

/** 9 dissipating units + 9 passive units = 18 components, 412.3 W total. */
export function demoComponents(): ComponentRecord[] {
  return [
    {
      id: 'CMP_FINAL_PA',
      component: 'Final PA',
      qty: 4,
      power_W: 52.13,
      board_type: 'RF',
      limit_C: 180,
      R_jc: 0.18,
      tim_type: 'Grease',
    },
    {
      id: 'CMP_DRIVER_PA',
      component: 'Driver PA',
      qty: 2,
      power_W: 18.0,
      board_type: 'RF',
      limit_C: 150,
      R_jc: 0.45,
      tim_type: 'Grease',
    },
    {
      id: 'CMP_TRX',
      component: 'Transceiver',
      qty: 1,
      power_W: 22.5,
      board_type: 'RF',
      limit_C: 110,
      R_jc: 0.6,
      tim_type: 'Pad',
    },
    {
      id: 'CMP_FPGA',
      component: 'FPGA',
      qty: 1,
      power_W: 85.0,
      board_type: 'DIGITAL',
      limit_C: 100,
      R_jc: 0.12,
      tim_type: 'Pad',
    },
    {
      id: 'CMP_DCDC',
      component: 'DC-DC Converter',
      qty: 1,
      power_W: 60.28,
      board_type: 'POWER',
      limit_C: 125,
      R_jc: 0.9,
      tim_type: 'Gap Filler',
    },
    { id: 'CMP_DUPLEXER', component: 'Duplexer', qty: 2, power_W: 0, board_type: 'FILTER' },
    { id: 'CMP_RF_CONN', component: 'RF Connector', qty: 4, power_W: 0, board_type: 'OTHER' },
    { id: 'CMP_SHIELD', component: 'Shielding Can', qty: 3, power_W: 0, board_type: 'OTHER' },
  ];
}
