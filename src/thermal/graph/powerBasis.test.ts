/**
 * A scenario's 功耗 (01): the hot-condition Pd, or the room-temperature Pd.
 *
 * AI-Thermal states two powers per part — `Power(W)` at the hot condition and
 * `Power_RT(W)` at 25 °C. A room-temperature scenario has to put the second one
 * on the nodes, and a part without one keeps its hot power (never zero) and is
 * named, so the solve is conservative and says why.
 */

import { describe, expect, it } from 'vitest';

import { componentPowerFor, createComponent, type Component } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';
import { buildSolveInput, solveInputSignature } from '@/thermal/solver/buildSolveInput';

import {
  componentsMissingRtPower,
  projectComponentLimits,
  projectComponentMaster,
} from './componentProjection';
import { buildComponentSubgraph } from './networkBuilder';
import type { ThermalNetwork } from '../types';

function part(id: string, hot: number, rt?: number): Component {
  const base = createComponent({
    id,
    name: id,
    category: 'RF',
    qty: 1,
    power_W: hot,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-10-27T00:00:00.000Z',
    },
  });
  return rt == null ? base : { ...base, power_rt_W: sourced(rt, 'Imported') };
}

function networkFor(components: Component[]): ThermalNetwork {
  const nodes: ThermalNetwork['nodes'] = {};
  const edges: ThermalNetwork['edges'] = {};
  const templates: Record<string, unknown> = {};
  for (const component of components) {
    const subgraph = buildComponentSubgraph(component, {
      templateId: 'TOP_COOL_LID',
      qtyModel: 'INDIVIDUAL',
      materials: defaultMaterials(),
    })!;
    for (const node of subgraph.nodes) nodes[node.id] = node;
    for (const edge of subgraph.edges) edges[edge.id] = edge;
    templates[component.id] = { template_id: 'TOP_COOL_LID', qty_model: 'INDIVIDUAL' };
  }
  return {
    id: 'NET',
    name: 'Test',
    project_id: 'P',
    network_name: 'Test',
    nodes,
    edges,
    templates,
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

/** The node that carries a part's power — its junction. */
function powerOf(network: ThermalNetwork, componentId: string): number {
  const node = Object.values(network.nodes).find(
    (entry) => entry.component_ref === componentId && entry.power_W !== 0,
  );
  return node!.power_W;
}

describe('componentPowerFor', () => {
  it('reads the room-temperature power when the scenario asks for it', () => {
    expect(componentPowerFor(part('PA', 40, 36), 'rt')).toBe(36);
    expect(componentPowerFor(part('PA', 40, 36), 'hot')).toBe(40);
  });

  it('falls back to the hot power when the part has no room-temperature power', () => {
    expect(componentPowerFor(part('PA', 40), 'rt')).toBe(40);
  });
});

describe('projection by power basis', () => {
  const pa = part('PA', 40, 36);
  const fpga = part('FPGA', 20);
  const network = networkFor([pa, fpga]);
  const materials = defaultMaterials();

  it('hot is the default and leaves the hot power on the nodes', () => {
    const hot = projectComponentMaster(network, [pa, fpga], materials);
    expect(powerOf(hot, 'PA')).toBe(40);
  });

  it('rt puts each part’s room-temperature power on its node, the hot power where there is none', () => {
    const rt = projectComponentMaster(network, [pa, fpga], materials, {
      physics: true,
      limits: true,
      powerBasis: 'rt',
    });
    expect(powerOf(rt, 'PA')).toBe(36);
    expect(powerOf(rt, 'FPGA')).toBe(20);
  });

  it('the result-side projection carries the basis power only when asked', () => {
    const edited = part('PA', 45, 36);
    expect(powerOf(projectComponentLimits(network, [edited, fpga]), 'PA')).toBe(40);
    expect(powerOf(projectComponentLimits(network, [edited, fpga], 'hot'), 'PA')).toBe(45);
    expect(powerOf(projectComponentLimits(network, [edited, fpga], 'rt'), 'PA')).toBe(36);
  });

  it('names the heat-carrying parts that have no room-temperature power', () => {
    expect(componentsMissingRtPower(network, [pa, fpga]).map((c) => c.id)).toEqual(['FPGA']);
  });
});

describe('solve input by power basis', () => {
  const pa = part('PA', 40, 36);
  const fpga = part('FPGA', 20);
  const network = networkFor([pa, fpga]);
  const base = {
    network,
    components: [pa, fpga],
    materials: defaultMaterials(),
    boundarySet: null,
    ports: [],
    scenarioId: 'S1',
  };

  it('solves a room-temperature scenario with the room-temperature powers and says which parts fell back', () => {
    const rt = buildSolveInput({ ...base, powerBasis: 'rt' });
    expect(rt.power_basis).toBe('rt');
    expect(rt.component_power_W).toBeCloseTo(56, 9);
    const note = rt.notes.find((entry) => entry.code === 'rt_power_missing');
    expect(note?.severity).toBe('warning');
    expect(note?.message_zh).toContain('FPGA');
    expect(note?.fix_in).toBe('04');
  });

  it('a hot scenario is unchanged and says nothing about room-temperature power', () => {
    const hot = buildSolveInput(base);
    expect(hot.power_basis).toBe('hot');
    expect(hot.component_power_W).toBeCloseTo(60, 9);
    expect(hot.notes.some((entry) => entry.code === 'rt_power_missing')).toBe(false);
  });

  it('switching the basis makes a solution stale even when no part has a room-temperature power', () => {
    const hotOnly = { ...base, components: [part('PA', 40), fpga] };
    const hot = solveInputSignature(buildSolveInput(hotOnly));
    const rt = solveInputSignature(buildSolveInput({ ...hotOnly, powerBasis: 'rt' }));
    expect(rt).not.toBe(hot);
  });
});
