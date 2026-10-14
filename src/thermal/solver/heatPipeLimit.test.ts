/**
 * A heat pipe's vendor resistance is only true below its transport limit.
 *
 * The network gives a two-phase device a constant R, so it will happily route
 * any amount of heat through one. These pin the check that compares what it was
 * asked to carry with what it can carry, and the mount data that feeds it.
 */

import { describe, expect, it } from 'vitest';

import { emptyMount, mountPipeQmax } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { buildMountChain } from '../graph/componentMount';
import { scaleParametersForDevices } from '../resistance/calculators';
import { createRth } from '../rth';
import type { ThermalEdge, ThermalNetwork } from '../types';
import type { EdgeSolutionResult } from './solverTypes';
import { heatPipeLimitIssues } from './solveScenario';

function pipeNetwork(qmax?: number): ThermalNetwork {
  const edge: ThermalEdge = {
    id: 'E_PIPE',
    from: 'PORT',
    to: 'BASE',
    type: 'heat_pipe',
    method: 'direct_rth',
    rth: createRth(0.2, 'Analytical', 'medium'),
    parameters: { R_C_per_W: 0.2, ...(qmax != null ? { q_max_W: qmax } : {}) },
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
  return {
    nodes: {
      PORT: { id: 'PORT', name: 'PA exit face' },
      BASE: { id: 'BASE', name: 'HSK base' },
    },
    edges: { E_PIPE: edge },
  } as unknown as ThermalNetwork;
}

const carried = (heat_flow_W: number): Record<string, EdgeSolutionResult> => ({
  E_PIPE: { edge_id: 'E_PIPE', heat_flow_W } as EdgeSolutionResult,
});

describe('heat pipe transport limit', () => {
  it('warns when the solve routes more heat through a pipe than it can carry', () => {
    const issues = heatPipeLimitIssues(pipeNetwork(30), carried(42));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe('heat_pipe_qmax_exceeded');
    expect(issues[0].message).toContain('140 %');
  });

  it('counts heat in either direction', () => {
    expect(heatPipeLimitIssues(pipeNetwork(30), carried(-42))[0].code).toBe(
      'heat_pipe_qmax_exceeded',
    );
  });

  it('says nothing for a pipe inside its limit', () => {
    expect(heatPipeLimitIssues(pipeNetwork(30), carried(29.9))).toEqual([]);
  });

  // "Not checked" must never read like "checked and fine".
  it('reports a pipe with no stated Qmax as unchecked', () => {
    const issues = heatPipeLimitIssues(pipeNetwork(), carried(5));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].code).toBe('heat_pipe_qmax_unchecked');
  });
});

describe('the Qmax a mount puts on its pipe edge', () => {
  const materials = { ...defaultMaterials(), hsk_base_k_W_mK: sourced(96, 'Manual') };

  it('multiplies one pipe by the count, like the resistance divides', () => {
    const mount = {
      ...emptyMount('EmbeddedHeatPipe'),
      contact_L_mm: 40,
      contact_W_mm: 8,
      heat_pipe_count: 2,
      heat_pipe_R_C_per_W: 0.3,
      heat_pipe_qmax_W: 35,
    };
    expect(mountPipeQmax(mount)).toBe(70);

    const chain = buildMountChain({
      portNodeId: 'PORT',
      targetNodeId: 'BASE',
      componentRef: 'CMP',
      mount,
      materials,
      sourceAreaMm2: 900,
    });
    const pipe = chain.edges.find((edge) => edge.type === 'heat_pipe')!;
    expect(pipe.parameters?.q_max_W).toBe(70);
  });

  it('leaves the parameter off when nobody stated a limit', () => {
    const chain = buildMountChain({
      portNodeId: 'PORT',
      targetNodeId: 'BASE',
      componentRef: 'CMP',
      mount: { ...emptyMount('VaporChamber'), heat_pipe_R_C_per_W: 0.05 },
      materials,
    });
    const chamber = chain.edges.find((edge) => edge.type === 'heat_pipe')!;
    expect(chamber.parameters?.q_max_W).toBeUndefined();
  });

  it('scales with the devices an aggregated chain stands for', () => {
    expect(
      scaleParametersForDevices('direct_rth', { R_C_per_W: 0.2, q_max_W: 30 }, 4),
    ).toEqual({ R_C_per_W: 0.05, q_max_W: 120 });
  });
});
