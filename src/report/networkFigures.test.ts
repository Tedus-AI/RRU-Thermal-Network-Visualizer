/**
 * Which pictures the Thermal Network Summary carries, and in what order.
 */

import { describe, expect, it } from 'vitest';

import { networkFigures, FIGURE_GROUPS } from './networkFigures';
import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { MarginRank } from '@/thermal/analysis/marginRanking';

const component = (id: string, category: Component['category']) =>
  ({ id, name: id, category, enabled: true }) as Component;

/** A network whose nodes name the components above, so all of them count as drawn. */
const network = (ids: string[]): ThermalNetwork =>
  ({
    nodes: Object.fromEntries(
      ids.map((id) => [`N_${id}`, { id: `N_${id}`, name: id, component_ref: id }]),
    ),
    edges: {},
  }) as unknown as ThermalNetwork;

const part = (nodeId: string, componentId: string, margin: number): MarginRank =>
  ({
    node_id: nodeId,
    name: nodeId,
    component_id: componentId,
    margin_C: margin,
    temperature_C: 90,
    limit_C: 90 + margin,
  }) as MarginRank;

describe('networkFigures', () => {
  const components = [
    component('pa', 'RF'),
    component('cavity', 'Filter'),
    component('fpga', 'Digital'),
    component('pm', 'Power'),
  ];

  it('groups the boards, with Filter read as RF', () => {
    const figures = networkFigures({
      network: network(['pa', 'cavity', 'fpga', 'pm']),
      components,
      ranked: [],
      leversByNode: new Map(),
    });

    expect(figures.map((figure) => figure.key)).toEqual(['group-rf', 'group-digital', 'group-pw']);

    // The RF figure keeps the PA and the cavity filter and hides the rest.
    const rf = figures[0];
    expect(rf.hidden_component_ids.has('pa')).toBe(false);
    expect(rf.hidden_component_ids.has('cavity')).toBe(false);
    expect(rf.hidden_component_ids.has('fpga')).toBe(true);
    expect(rf.hidden_component_ids.has('pm')).toBe(true);
  });

  it('skips a board the design does not have', () => {
    const figures = networkFigures({
      network: network(['pa']),
      components: [component('pa', 'RF')],
      ranked: [],
      leversByNode: new Map(),
    });
    expect(figures.map((figure) => figure.key)).toEqual(['group-rf']);
  });

  it('puts the parts that need attention after the groups, worst first', () => {
    const ranked = [part('N_pm_body', 'pm', 1.4), part('N_fpga_j', 'fpga', 3.8)];
    const figures = networkFigures({
      network: network(['pa', 'fpga', 'pm']),
      components,
      ranked,
      leversByNode: new Map([['N_pm_body', []]]),
    });

    expect(figures.map((figure) => figure.key)).toEqual([
      'group-rf',
      'group-digital',
      'group-pw',
      'part-N_pm_body',
      'part-N_fpga_j',
    ]);
    // A part figure keeps only its own component.
    expect(figures[3].hidden_component_ids.has('pm')).toBe(false);
    expect(figures[3].hidden_component_ids.has('fpga')).toBe(true);
  });

  it('tells a part with no study apart from one whose study cuts nothing', () => {
    const ranked = [part('N_pm_body', 'pm', 1.4), part('N_fpga_j', 'fpga', 3.8)];
    const figures = networkFigures({
      network: network(['fpga', 'pm']),
      components,
      ranked,
      // pm has a study with no segments; fpga has no study at all.
      leversByNode: new Map([['N_pm_body', []]]),
    });
    const byKey = new Map(figures.map((figure) => [figure.key, figure]));
    expect(byKey.get('part-N_pm_body')?.levers).toEqual([]);
    expect(byKey.get('part-N_fpga_j')?.levers).toBeNull();
  });

  it('marks an over-limit part differently from one merely close', () => {
    const figures = networkFigures({
      network: network(['pm', 'fpga']),
      components,
      ranked: [part('N_pm_body', 'pm', -2.1), part('N_fpga_j', 'fpga', 3.8)],
      leversByNode: new Map(),
    });
    expect(figures.find((f) => f.key === 'part-N_pm_body')?.status).toBe('over');
    expect(figures.find((f) => f.key === 'part-N_fpga_j')?.status).toBe('warn');
  });

  it('names the three groups the review asked for', () => {
    expect(FIGURE_GROUPS.slice(0, 3).map((group) => group.title)).toEqual([
      'RF',
      'Digital',
      'PW',
    ]);
  });
});
