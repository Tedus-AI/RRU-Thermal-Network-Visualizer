/**
 * The Total Power card opens into this, so the rows have to add up to it.
 *
 * The headline is what the solve injected. If a slice were dropped — a node
 * whose component has since been deleted, the solar load, a part in a category
 * nobody thought about — the breakdown would quietly disagree with the number
 * above it, which is worse than not offering a breakdown at all.
 */

import { describe, expect, it } from 'vitest';

import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '../types';

import { powerByCategory } from './powerByCategory';

function net(nodes: { id: string; power?: number; ref?: string; disabled?: boolean }[]) {
  return {
    nodes: Object.fromEntries(
      nodes.map((entry) => [
        entry.id,
        {
          id: entry.id,
          name: entry.id,
          type: 'custom',
          power_W: entry.power ?? 0,
          component_ref: entry.ref ?? null,
          disabled: entry.disabled ?? false,
        },
      ]),
    ),
    edges: {},
    templates: {},
    layout: { positions: {} },
  } as unknown as ThermalNetwork;
}

const component = (id: string, category: Component['category']) =>
  ({ id, name: id, category }) as Component;

describe('powerByCategory', () => {
  const components = [
    component('PA', 'RF'),
    component('FPGA', 'Digital'),
    component('VRM', 'Power'),
  ];

  it('groups by category, largest first, and the shares are of the total', () => {
    const { slices, total_W } = powerByCategory({
      network: net([
        { id: 'a', power: 30, ref: 'PA' },
        { id: 'b', power: 22, ref: 'PA' },
        { id: 'c', power: 35, ref: 'FPGA' },
        { id: 'd', power: 13, ref: 'VRM' },
      ]),
      components,
      powerScale: 1,
    });

    expect(total_W).toBe(100);
    expect(slices.map((slice) => [slice.label, slice.watts])).toEqual([
      ['RF', 52],
      ['Digital', 35],
      ['Power', 13],
    ]);
    expect(slices.map((slice) => slice.share_pct)).toEqual([52, 35, 13]);
  });

  it('scales with the scenario, exactly as the solver does', () => {
    const { total_W, slices } = powerByCategory({
      network: net([{ id: 'a', power: 40, ref: 'PA' }]),
      components,
      powerScale: 0.5,
    });

    expect(total_W).toBe(20);
    expect(slices[0].watts).toBe(20);
  });

  /** Heat in the solve that belongs to no category still has to be counted. */
  it('puts an orphaned or unattributed node in Other', () => {
    const { slices, total_W } = powerByCategory({
      network: net([
        { id: 'a', power: 10, ref: 'PA' },
        { id: 'loose', power: 4 },
        { id: 'ghost', power: 6, ref: 'DELETED' },
      ]),
      components,
      powerScale: 1,
    });

    expect(total_W).toBe(20);
    expect(slices.find((slice) => slice.label === 'Other')?.watts).toBe(10);
  });

  it('gives solar its own row rather than crediting it to a part', () => {
    const { slices, total_W } = powerByCategory({
      network: net([{ id: 'a', power: 90, ref: 'PA' }]),
      components,
      powerScale: 1,
      solar_W: 10,
    });

    expect(total_W).toBe(100);
    expect(slices.map((slice) => slice.label)).toEqual(['RF', 'Solar']);
    expect(slices[1].share_pct).toBe(10);
  });

  it('leaves out what does not burn: a disabled node, a zero, no solar', () => {
    const { slices, total_W } = powerByCategory({
      network: net([
        { id: 'a', power: 10, ref: 'PA' },
        { id: 'off', power: 999, ref: 'FPGA', disabled: true },
        { id: 'cold', power: 0, ref: 'VRM' },
      ]),
      components,
      powerScale: 1,
      solar_W: 0,
    });

    expect(total_W).toBe(10);
    expect(slices.map((slice) => slice.label)).toEqual(['RF']);
  });

  it('answers with nothing rather than a zero row when nothing burns', () => {
    expect(powerByCategory({ network: net([]), components, powerScale: 1 })).toEqual({
      slices: [],
      total_W: 0,
    });
  });
});
