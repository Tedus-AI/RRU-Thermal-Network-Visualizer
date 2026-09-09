/**
 * The sentence that replaced a screen.
 *
 * Screen 09 was five tabs of histograms and statistics over a population of
 * NODES — a count that says how finely the network was drawn, not how hot the
 * machine is. What it never said was the one thing the specification is written
 * in: how much hotter the air can get. That is this, and it is small enough to
 * be checked exactly.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork } from '../types';
import type { ThermalSolution } from '../solver/solverTypes';

import { ambientHeadroom } from './ambientHeadroom';

function net(
  nodes: { id: string; limit?: number | null; fixed?: boolean; disabled?: boolean }[],
): ThermalNetwork {
  return {
    nodes: Object.fromEntries(
      nodes.map((entry) => [
        entry.id,
        {
          id: entry.id,
          name: `${entry.id} name`,
          type: 'custom',
          power_W: 0,
          limit_C: entry.limit ?? null,
          disabled: entry.disabled ?? false,
          boundary_type: entry.fixed ? 'fixed_temperature' : undefined,
        },
      ]),
    ),
    edges: {},
    templates: {},
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

const solved = (temperatures: Record<string, number>) =>
  ({ node_temperatures_C: temperatures }) as unknown as ThermalSolution;

describe('ambientHeadroom', () => {
  it('reads the highest usable ambient off the worst margin', () => {
    const answer = ambientHeadroom(
      net([{ id: 'A', limit: 95 }, { id: 'B', limit: 100 }, { id: 'C' }]),
      solved({ A: 94.31, B: 88, C: 120 }),
      45,
    );

    expect(answer).not.toBeNull();
    expect(answer!.worst_node_id).toBe('A');
    expect(answer!.worst_margin_C).toBeCloseTo(0.69, 2);
    // The measured figure for this model: solved crossing 45.67, this 45.686.
    expect(answer!.max_ambient_C).toBeCloseTo(45.69, 2);
    expect(answer!.headroom_C).toBeCloseTo(0.69, 2);
    // C is hotter than either, and irrelevant: nothing says it may not be.
    expect(answer!.limited_node_count).toBe(2);
  });

  it('says how far the air must COOL when the machine is already over', () => {
    const answer = ambientHeadroom(net([{ id: 'A', limit: 95 }]), solved({ A: 104.55 }), 55);

    expect(answer!.headroom_C).toBeCloseTo(-9.55, 2);
    expect(answer!.max_ambient_C).toBeCloseTo(45.45, 2);
  });

  it('ignores a disabled part, and a limited one the solve did not reach', () => {
    const answer = ambientHeadroom(
      net([
        { id: 'A', limit: 95 },
        { id: 'HOT', limit: 60, disabled: true },
        { id: 'GONE', limit: 50 },
      ]),
      solved({ A: 90, HOT: 90 }),
      45,
    );

    expect(answer!.worst_node_id).toBe('A');
    expect(answer!.limited_node_count).toBe(1);
  });

  /**
   * A pinned node does not warm with the air, so the rise across a path that
   * ends on one genuinely moves with ambient and the addition stops being
   * exact. The number is still the best available; the flag is what lets the
   * screen say so instead of implying a precision it does not have.
   */
  it('flags a fixed-temperature node, which is what breaks the arithmetic', () => {
    expect(
      ambientHeadroom(net([{ id: 'A', limit: 95 }]), solved({ A: 90 }), 45)!.assumes_uniform_rise,
    ).toBe(true);
    expect(
      ambientHeadroom(
        net([{ id: 'A', limit: 95 }, { id: 'COLD', fixed: true }]),
        solved({ A: 90, COLD: 20 }),
        45,
      )!.assumes_uniform_rise,
    ).toBe(false);
  });

  it('answers nothing rather than zero when there is nothing to answer', () => {
    expect(ambientHeadroom(net([{ id: 'A' }]), solved({ A: 90 }), 45)).toBeNull();
    expect(ambientHeadroom(net([{ id: 'A', limit: 95 }]), null, 45)).toBeNull();
    expect(ambientHeadroom(net([{ id: 'A', limit: 95 }]), solved({ A: 90 }), null)).toBeNull();
  });
});
