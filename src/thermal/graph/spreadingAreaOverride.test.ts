/**
 * The embedded-heat-pipe carve-out has to survive the trip into the solver.
 *
 * An embedded pipe lies in a groove machined flush with the face the part sits
 * on, so that face is part copper and part aluminium: the pipe branch owns the
 * copper strip and the spreading branch may only spread through what is left.
 * The remainder cannot be read back off the graph — the spreading edge's
 * parameter link points at the FULL contact area, which is what the two share —
 * so `buildMountChain` records it on the edge as `source_area_override_mm2`.
 *
 * `refreshHskBaseConnectionEdges` has always read that back. `updateLinkedEdge`
 * did not: resolving the link overwrote the carved-out area with the full
 * footprint on the solver's own clone. Screen 05 showed one number and Screen 07
 * solved a different one — the exact failure the override exists to prevent,
 * reached down a second path.
 *
 * Found in a real project: an XCZU67DR on one embedded pipe, 35 x 35 mm package
 * with a 35 x 13 mm groove. Screen 05 carried 770 mm²; the solve used 1225.
 */

import { describe, expect, it } from 'vitest';

import { defaultMaterials } from '@/domain/materials';
import { createComponent, type Component } from '@/domain/component';

import { computeRth } from '../resistance/calculators';
import type { ThermalNetwork } from '../types';
import { projectComponentMaster } from './componentProjection';
import { SOURCE_AREA_OVERRIDE_KEY } from './hskBaseConnection';

const PACKAGE_AREA = 1225;
const GROOVE_AREA = 455;
const ALUMINIUM_AREA = PACKAGE_AREA - GROOVE_AREA;

const SPREADING_EDGE = 'EDGE_PORT_CMP_FPGA_TIM_HEAT_OUT_HSK_BASE';
const TIM_EDGE = 'EDGE_CMP_FPGA_LID_TIM';

function component(): Component {
  return createComponent({
    id: 'CMP_FPGA',
    name: 'XCZU67DR',
    category: 'Digital',
    qty: 1,
    power_W: 35,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-02T00:00:00.000Z',
    },
  });
}

/** The lid → TIM → base chain, with the spreading edge linked to the TIM area. */
function network(): ThermalNetwork {
  const node = (id: string, type: string, componentRef: string | null) => ({
    id,
    name: id,
    type,
    power_W: 0,
    limit_C: null,
    component_ref: componentRef,
    disabled: false,
  });

  return {
    nodes: {
      NODE_CMP_FPGA_LID: node('NODE_CMP_FPGA_LID', 'lid', 'CMP_FPGA'),
      NODE_CMP_FPGA_TIM: node('NODE_CMP_FPGA_TIM', 'tim_interface', 'CMP_FPGA'),
      NODE_HSK_BASE: node('NODE_HSK_BASE', 'heat_sink_base', null),
    },
    edges: {
      [TIM_EDGE]: {
        id: TIM_EDGE,
        from: 'NODE_CMP_FPGA_LID',
        to: 'NODE_CMP_FPGA_TIM',
        type: 'tim',
        method: 'tim_thickness_k',
        // The whole package face — shared by the groove and the aluminium.
        parameters: { thickness_mm: 0.5, k_W_mK: 9.1, area_mm2: PACKAGE_AREA },
        rth: { analytical: 0.045, active_source: 'Analytical', provenance: {} },
        resolution: 'resolved',
        enabled: true,
        origin: { kind: 'template', component_id: 'CMP_FPGA' },
      },
      [SPREADING_EDGE]: {
        id: SPREADING_EDGE,
        from: 'NODE_CMP_FPGA_TIM',
        to: 'NODE_HSK_BASE',
        type: 'spreading',
        method: 'spreading_disc',
        parameters: {
          thickness_mm: 7,
          k_W_mK: 150,
          plate_area_mm2: 92400,
          source_area_mm2: ALUMINIUM_AREA,
          psi_variant: 'max',
        },
        parameter_links: { source_area_mm2: `${TIM_EDGE}.parameters.area_mm2` },
        rth: { analytical: 0.0568, active_source: 'Analytical', provenance: {} },
        resolution: 'resolved',
        enabled: true,
        // The projection only visits edges a component owns.
        origin: { kind: 'shared_structure', component_id: 'CMP_FPGA' },
        metadata: {
          connection_role: 'hsk_base_conduction',
          area_source_edge_id: TIM_EDGE,
          [SOURCE_AREA_OVERRIDE_KEY]: ALUMINIUM_AREA,
        },
      },
    },
    templates: { CMP_FPGA: { component_id: 'CMP_FPGA', qty_model: 'AGGREGATE' } },
    zones: { NODE_HSK_BASE: { type: 'heat_sink_base' } },
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

describe('the spreading area a mount dictates', () => {
  it('survives the projection the solver builds its input from', () => {
    const projected = projectComponentMaster(network(), [component()], defaultMaterials(), {
      physics: true,
      limits: true,
    });

    const edge = projected.edges[SPREADING_EDGE];
    expect(edge.parameters?.source_area_mm2).toBe(ALUMINIUM_AREA);
    // Not the full face the link points at, which is what the groove and the
    // aluminium share and what the bug restored.
    expect(edge.parameters?.source_area_mm2).not.toBe(PACKAGE_AREA);
  });

  it('leaves a linked area alone when no mount dictated one', () => {
    const base = network();
    delete base.edges[SPREADING_EDGE].metadata![SOURCE_AREA_OVERRIDE_KEY];
    // A stale stored area must still be refreshed from the link, which is what
    // the link is for: Screen 01 edits have to reach the spreading edge.
    base.edges[SPREADING_EDGE].parameters!.source_area_mm2 = 1;

    const projected = projectComponentMaster(base, [component()], defaultMaterials(), {
      physics: true,
      limits: true,
    });

    expect(projected.edges[SPREADING_EDGE].parameters?.source_area_mm2).toBe(PACKAGE_AREA);
  });

  it('costs the resistance the carve-out is worth', () => {
    const shared = { thickness_mm: 7, k_W_mK: 150, plate_area_mm2: 92400, psi_variant: 'max' };
    // The Bi the real scenario produced, so the numbers are the project's own.
    const bi = 0.10573659363508808;
    const carved = computeRth('spreading_disc', {
      ...shared,
      source_area_mm2: ALUMINIUM_AREA,
      bi,
    } as never).value!;
    const whole = computeRth('spreading_disc', {
      ...shared,
      source_area_mm2: PACKAGE_AREA,
      bi,
    } as never).value!;

    // Spreading from a smaller patch costs more, so the bug read LOW.
    expect(carved).toBeGreaterThan(whole);
    expect(carved).toBeCloseTo(0.3223, 3);
    expect(whole).toBeCloseTo(0.2803, 3);
  });
});
