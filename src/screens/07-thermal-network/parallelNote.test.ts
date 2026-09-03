/**
 * The combined resistance where two branches rejoin.
 *
 * This printed 0.030 for a pair whose branches were labelled 0.322 and 0.065 —
 * the reader could see the two numbers and see that the answer was impossible,
 * since a parallel pair is always smaller than either branch but never eight
 * times smaller. The cause was that the note read `activeRth`, the edge's own
 * STORED number, while the branch labels showed the SOLVED one.
 *
 * They differ by design: Screen 05 must build every spreading edge at Bi → ∞
 * because the far-face h is scenario data, and Screen 07 re-solves it against
 * the scenario's real boundary. 0.057 ∥ 0.065 is 0.030; 0.322 ∥ 0.065 is 0.054.
 * The note has to be built from the numbers on screen beside it.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { parallelNote, solvedParallelRth } from './solvedBusElements';

const SPREADING = 'EDGE_PORT_CMP_FPGA_TIM_HEAT_OUT_HSK_BASE';
const PIPE = 'EDGE_PORT_MOUNT_CMP_FPGA_TIM_HEAT_PIPE';
const SCENARIO = 'SCN_001';

/** The real XCZU67DR pair: the stored floor is what the bug read. */
function network(): ThermalNetwork {
  const edge = (id: string, analytical: number) => ({
    id,
    from: 'NODE_CMP_FPGA_TIM',
    to: 'NODE_HSK_BASE',
    enabled: true,
    rth: { analytical, active_source: 'Analytical', provenance: {} },
  });
  return {
    nodes: {},
    edges: {
      // Bi → ∞ floor. The solve replaces it with 0.3222.
      [SPREADING]: edge(SPREADING, 0.056823),
      [PIPE]: edge(PIPE, 0.065),
    },
    templates: {},
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

function solution(): ThermalSolution {
  const result = (id: string, R: number, Q: number, dT: number) => ({
    edge_id: id,
    from: 'NODE_CMP_FPGA_TIM',
    to: 'NODE_HSK_BASE',
    heat_flow_W: Q,
    delta_T_C: dT,
    actual_direction: 'forward',
    active_rth_C_per_W: R,
    active_rth_source: 'Analytical',
    rth_origin: 'edge',
  });
  return {
    node_temperatures_C: {},
    edge_results: {
      [SPREADING]: result(SPREADING, 0.3222, 5.88, 1.8931),
      [PIPE]: result(PIPE, 0.065, 29.12, 1.8931),
    },
  } as unknown as ThermalSolution;
}

describe('the parallel note on the solved graph', () => {
  it('combines the SOLVED resistances, not the stored floor', () => {
    const combined = solvedParallelRth(network(), solution(), [SPREADING, PIPE], SCENARIO);

    // 0.3222 ∥ 0.065
    expect(combined).toBeCloseTo(0.054088, 5);
    // The bug's answer, from the Bi → ∞ floor.
    expect(combined).not.toBeCloseTo(0.030319, 5);
  });

  it('is smaller than either branch — the property that exposed the bug', () => {
    const combined = solvedParallelRth(network(), solution(), [SPREADING, PIPE], SCENARIO)!;

    expect(combined).toBeLessThan(0.065);
    expect(combined).toBeLessThan(0.3222);
    // …but never by more than the number of branches.
    expect(combined).toBeGreaterThan(0.065 / 2);
  });

  /**
   * The branches read "Rth N/A" before a solve, so the note must not read a
   * confident 0.030 underneath them — same fault as the original bug, quieter.
   */
  it('says nothing when nothing has been solved', () => {
    expect(solvedParallelRth(network(), null, [SPREADING, PIPE], SCENARIO)).toBeNull();
    expect(parallelNote(network(), null, [SPREADING, PIPE], 'rth', SCENARIO)).toBe('∥ —');
  });

  /**
   * A per-scenario override stands in for a solved value, because the branch
   * label shows it the same way. One branch unknown still makes the pair
   * unknown — conductances cannot be added around a hole.
   */
  it('honours a scenario override, and needs every branch', () => {
    const net = network();
    net.edges[SPREADING].scenario_overrides = { [SCENARIO]: { R_C_per_W: 0.3222 } };

    // The pipe is still unknown, so the pair is.
    expect(solvedParallelRth(net, null, [SPREADING, PIPE], SCENARIO)).toBeNull();

    net.edges[PIPE].scenario_overrides = { [SCENARIO]: { R_C_per_W: 0.065 } };
    expect(solvedParallelRth(net, null, [SPREADING, PIPE], SCENARIO)).toBeCloseTo(0.054088, 5);
  });

  describe('and what it says in each mode', () => {
    const note = (mode: string) =>
      parallelNote(network(), solution(), [SPREADING, PIPE], mode, SCENARIO);

    it('writes the combination only in Rth', () => {
      expect(note('rth')).toBe('∥ 0.054 °C/W');
    });

    it('adds the flows in Heat Flow', () => {
      expect(note('heat_flow')).toBe('∑ 35.0 W');
    });

    it('names the one ΔT the pair shares, as a fall', () => {
      expect(note('delta_t')).toBe('shared ↓1.9 °C');
    });

    /**
     * A stray °C/W among a graph of temperatures was the complaint: the note
     * ignored the toolbar entirely.
     */
    it('says nothing where there is no combinable quantity', () => {
      for (const mode of ['temperature', 'node_type', 'rth_source']) {
        expect(note(mode), mode).toBe('');
      }
    });
  });
});
