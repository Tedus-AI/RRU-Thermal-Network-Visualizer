/**
 * A component's rows follow the heat, not the alphabet.
 *
 * Reported on the STARKCORE PA, whose five nodes listed as
 *
 *   Case · Copper Coin · Junction · Solder · TIM
 *
 * because that is `localeCompare` on the node ids. The junction — the hottest
 * node in the part, and the one the whole chain exists to cool — sat third,
 * between two nodes downstream of it, and the table disagreed with the network
 * diagram about the same nine components.
 */

import { describe, expect, it } from 'vitest';

import type { ThermalNetwork, ThermalNode } from '@/thermal/types';

import { compareAlongHeatPath, heatPathDistance, sortAlongHeatPath } from './heatPathOrder';

function node(
  id: string,
  extra: { power?: number; instance?: string; temperature?: number } = {},
): ThermalNode {
  return {
    id,
    name: id,
    power_W: extra.power ?? 0,
    metadata: {
      ...(extra.instance ? { instance: extra.instance } : {}),
      ...(extra.power ? { component_power_linked: true } : {}),
    },
  } as unknown as ThermalNode;
}

function net(nodes: ThermalNode[], links: Array<[string, string]>): ThermalNetwork {
  return {
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(
      links.map(([from, to], index) => [`E${index}`, { id: `E${index}`, from, to }]),
    ),
  } as unknown as ThermalNetwork;
}

/** The real PA chain, with the ids in the alphabetical order it used to use. */
const PA_NODES = [
  node('NODE_PA_1_CASE'),
  node('NODE_PA_1_COIN'),
  node('NODE_PA_1_JUNCTION', { power: 53 }),
  node('NODE_PA_1_SOLDER'),
  node('NODE_PA_1_TIM'),
];
const PA_LINKS: Array<[string, string]> = [
  ['NODE_PA_1_JUNCTION', 'NODE_PA_1_CASE'],
  ['NODE_PA_1_CASE', 'NODE_PA_1_SOLDER'],
  ['NODE_PA_1_SOLDER', 'NODE_PA_1_COIN'],
  ['NODE_PA_1_COIN', 'NODE_PA_1_TIM'],
];

function sorted(network: ThermalNetwork, ids: string[], temps: Record<string, number> = {}) {
  const rows = ids.map((id) => ({
    node: network.nodes[id],
    temperature_C: temps[id] ?? null,
  }));
  return sortAlongHeatPath(network, rows, (row) => row).map((row) => row.node.id);
}

describe('one chain', () => {
  it('runs from the junction down the path, not from A to Z', () => {
    const network = net(PA_NODES, PA_LINKS);

    expect(sorted(network, PA_NODES.map((n) => n.id))).toEqual([
      'NODE_PA_1_JUNCTION',
      'NODE_PA_1_CASE',
      'NODE_PA_1_SOLDER',
      'NODE_PA_1_COIN',
      'NODE_PA_1_TIM',
    ]);
  });

  it('measures distance from the node that dissipates', () => {
    const distance = heatPathDistance(net(PA_NODES, PA_LINKS), PA_NODES.map((n) => n.id));

    expect(distance.get('NODE_PA_1_JUNCTION')).toBe(0);
    expect(distance.get('NODE_PA_1_CASE')).toBe(1);
    expect(distance.get('NODE_PA_1_TIM')).toBe(4);
  });

  /**
   * Switching an edge off says something about heat flow, not about whether two
   * nodes are adjacent. A chain that re-ordered itself on a disabled link would
   * be worse than alphabetical.
   */
  it('still follows a disabled edge', () => {
    const network = net(PA_NODES, PA_LINKS);
    network.edges.E0 = { ...network.edges.E0, enabled: false };

    expect(sorted(network, PA_NODES.map((n) => n.id))[0]).toBe('NODE_PA_1_JUNCTION');
  });
});

describe('several devices', () => {
  /**
   * A ×4 part is four identical chains. Ordering by distance alone would give
   * four Junctions, then four Cases — every instance shredded across the block.
   */
  it('keeps each instance whole', () => {
    const nodes = [1, 2].flatMap((i) => [
      node(`NODE_PA_${i}_CASE`, { instance: String(i) }),
      node(`NODE_PA_${i}_JUNCTION`, { power: 53, instance: String(i) }),
      node(`NODE_PA_${i}_TIM`, { instance: String(i) }),
    ]);
    const network = net(nodes, [
      ['NODE_PA_1_JUNCTION', 'NODE_PA_1_CASE'],
      ['NODE_PA_1_CASE', 'NODE_PA_1_TIM'],
      ['NODE_PA_2_JUNCTION', 'NODE_PA_2_CASE'],
      ['NODE_PA_2_CASE', 'NODE_PA_2_TIM'],
    ]);

    expect(sorted(network, nodes.map((n) => n.id))).toEqual([
      'NODE_PA_1_JUNCTION',
      'NODE_PA_1_CASE',
      'NODE_PA_1_TIM',
      'NODE_PA_2_JUNCTION',
      'NODE_PA_2_CASE',
      'NODE_PA_2_TIM',
    ]);
  });

  /** Instance 10 comes after instance 2, which text ordering gets wrong. */
  it('counts instances rather than spelling them', () => {
    const nodes = ['2', '10'].map((i) =>
      node(`NODE_PA_${i}_JUNCTION`, { power: 53, instance: i }),
    );

    expect(sorted(net(nodes, []), nodes.map((n) => n.id))).toEqual([
      'NODE_PA_2_JUNCTION',
      'NODE_PA_10_JUNCTION',
    ]);
  });
});

describe('a group with no source at all', () => {
  /**
   * Shared structure is base → fins → ambient and nothing in it dissipates.
   * Descending temperature IS the direction of flow along a heat path.
   */
  it('falls back to descending temperature', () => {
    const nodes = [node('NODE_AMBIENT'), node('NODE_FIN'), node('NODE_HSK_BASE')];
    const network = net(nodes, [
      ['NODE_HSK_BASE', 'NODE_FIN'],
      ['NODE_FIN', 'NODE_AMBIENT'],
    ]);

    expect(
      sorted(network, nodes.map((n) => n.id), {
        NODE_HSK_BASE: 85.5,
        NODE_FIN: 80.5,
        NODE_AMBIENT: 45,
      }),
    ).toEqual(['NODE_HSK_BASE', 'NODE_FIN', 'NODE_AMBIENT']);
  });

  it('falls back to the id when there are no temperatures either', () => {
    const nodes = [node('NODE_B'), node('NODE_A')];

    expect(sorted(net(nodes, []), ['NODE_B', 'NODE_A'])).toEqual(['NODE_A', 'NODE_B']);
  });
});

describe('a body-sourced part', () => {
  /**
   * A cavity filter dissipates in its own body and reaches its own ambient and
   * the heat-sink base in one step each. Same distance, so the hotter one — the
   * one heat reaches first — is listed first.
   */
  it('breaks a tie at equal distance by temperature', () => {
    const nodes = [
      node('NODE_CF_AMBIENT'),
      node('NODE_CF_CONTACT'),
      node('NODE_CF_METAL_BASE', { power: 24.85 }),
    ];
    const network = net(nodes, [
      ['NODE_CF_METAL_BASE', 'NODE_CF_AMBIENT'],
      ['NODE_CF_METAL_BASE', 'NODE_CF_CONTACT'],
    ]);

    expect(
      sorted(network, nodes.map((n) => n.id), {
        NODE_CF_METAL_BASE: 78.3,
        NODE_CF_CONTACT: 79.4,
        NODE_CF_AMBIENT: 45,
      }),
    ).toEqual(['NODE_CF_METAL_BASE', 'NODE_CF_CONTACT', 'NODE_CF_AMBIENT']);
  });
});

describe('a node the path never reaches', () => {
  it('is listed after everything that is on the path', () => {
    const nodes = [...PA_NODES, node('NODE_PA_1_ORPHAN')];
    const network = net(nodes, PA_LINKS);

    expect(sorted(network, nodes.map((n) => n.id)).at(-1)).toBe('NODE_PA_1_ORPHAN');
  });

  it('is ranked behind an on-path node whatever its id', () => {
    const distance = new Map([['on', 9]]);
    const on = { node: node('on'), temperature_C: null };
    const off = { node: node('aaa'), temperature_C: null };

    expect(compareAlongHeatPath(distance, on, off)).toBeLessThan(0);
    expect(compareAlongHeatPath(distance, off, on)).toBeGreaterThan(0);
  });
});
