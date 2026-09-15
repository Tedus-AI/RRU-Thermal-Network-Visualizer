/**
 * Which pictures the Thermal Network Summary carries, and in what order.
 */

import { describe, expect, it } from 'vitest';

import { networkFigures, FIGURE_GROUPS } from './networkFigures';
import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { MarginRank } from '@/thermal/analysis/marginRanking';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

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

/** A ×N part: one node per instance, all under the same component. */
const repeated = (componentId: string, instances: string[]): ThermalNetwork =>
  ({
    nodes: Object.fromEntries(
      instances.map((instance) => [
        `N_${componentId}_${instance}`,
        {
          id: `N_${componentId}_${instance}`,
          name: `${componentId} ${instance}`,
          component_ref: componentId,
          metadata: { instance },
        },
      ]),
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

  it('gives each board its own figure, Filter included', () => {
    const figures = networkFigures({
      network: network(['pa', 'cavity', 'fpga', 'pm']),
      components,
      ranked: [],
      leversByNode: new Map(),
    });

    expect(figures.map((figure) => figure.key)).toEqual([
      'group-rf',
      'group-digital',
      'group-pw',
      'group-filter',
    ]);

    // The RF figure keeps the PA alone; the cavity filter has its own.
    const rf = figures[0];
    expect(rf.hidden_component_ids.has('pa')).toBe(false);
    expect(rf.hidden_component_ids.has('cavity')).toBe(true);
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

  it('draws one chain per repeated part, and says how many it stands for', () => {
    // A ×4 PA is four identical chains. Four of them side by side is what made
    // the RF figure a grey mat.
    const figures = networkFigures({
      network: repeated('pa', ['1', '2', '3', '4']),
      components: [component('pa', 'RF')],
      ranked: [],
      leversByNode: new Map(),
    });

    const rf = figures[0];
    expect(rf.hidden_node_ids.size).toBe(3);
    expect(rf.hidden_node_ids.has('N_pa_1')).toBe(false);
    for (const instance of ['2', '3', '4']) {
      expect(rf.hidden_node_ids.has(`N_pa_${instance}`)).toBe(true);
    }
    expect(rf.note_zh).toContain('各取一條');
  });

  it('hides nothing when a part has one instance', () => {
    const figures = networkFigures({
      network: network(['pa']),
      components: [component('pa', 'RF')],
      ranked: [],
      leversByNode: new Map(),
    });
    expect(figures[0].hidden_node_ids.size).toBe(0);
    expect(figures[0].note_zh).not.toContain('各取一條');
  });

  /**
   * The STARKCORE cavity filter, reduced to its shape.
   *
   * The heatsink base runs hotter than the filter body, so the contact carries
   * heat INTO the filter and the filter sheds it through its own convection to
   * ambient. The fins are downstream of the base, not of the filter.
   */
  const filterNetwork = (): ThermalNetwork =>
    ({
      nodes: Object.fromEntries(
        [
          ['N_body', { component_ref: 'cavity' }],
          ['N_contact', { component_ref: 'cavity' }],
          ['N_filter_amb', {}],
          ['N_hsk', {}],
          ['N_fin', {}],
          ['N_amb', {}],
        ].map(([id, extra]) => [id, { id, name: id, ...(extra as object) }]),
      ),
      edges: {
        // The filter's own path out.
        E_out: { id: 'E_out', from: 'N_body', to: 'N_filter_amb', enabled: true },
        // Heat arriving from the base: drawn from contact to body, and that is
        // the direction the solver found.
        E_in: { id: 'E_in', from: 'N_contact', to: 'N_body', enabled: true },
        E_hsk: { id: 'E_hsk', from: 'N_hsk', to: 'N_contact', enabled: true },
        // The rest of the machine's path, downstream of the base.
        E_fin: { id: 'E_fin', from: 'N_hsk', to: 'N_fin', enabled: true },
        E_amb: { id: 'E_amb', from: 'N_fin', to: 'N_amb', enabled: true },
      },
    }) as unknown as ThermalNetwork;

  const forward = (ids: string[]): ThermalSolution =>
    ({
      edge_results: Object.fromEntries(
        ids.map((id) => [id, { edge_id: id, actual_direction: 'forward' }]),
      ),
    }) as unknown as ThermalSolution;

  it('stops a group figure at the node feeding heat back into it', () => {
    const figures = networkFigures({
      network: filterNetwork(),
      components: [component('cavity', 'Filter')],
      ranked: [],
      leversByNode: new Map(),
      solution: forward(['E_out', 'E_in', 'E_hsk', 'E_fin', 'E_amb']),
    });
    const figure = figures.find((entry) => entry.key === 'group-filter')!;

    // The filter's own nodes and where its heat goes.
    for (const id of ['N_body', 'N_contact', 'N_filter_amb']) {
      expect(figure.hidden_node_ids.has(id)).toBe(false);
    }
    // The base is kept: "this heat arrives from the heatsink" is the finding.
    expect(figure.hidden_node_ids.has('N_hsk')).toBe(false);
    // What lies beyond it is another group's path, and is not drawn here.
    expect(figure.hidden_node_ids.has('N_fin')).toBe(true);
    expect(figure.hidden_node_ids.has('N_amb')).toBe(true);
  });

  it('keeps the whole tail when the heat really does run out through it', () => {
    // The RF, digital and power boards: heat leaves the part, crosses into the
    // base and out of the fins, so every one of those nodes is on the group's
    // own path and the figure draws all of it. Here E_in runs contact → body
    // in the model but the solver found it flowing the other way, which is
    // what "the filter is being cooled by the base" would look like.
    const figures = networkFigures({
      network: filterNetwork(),
      components: [component('cavity', 'Filter')],
      ranked: [],
      leversByNode: new Map(),
      solution: {
        edge_results: {
          E_out: { edge_id: 'E_out', actual_direction: 'forward' },
          E_in: { edge_id: 'E_in', actual_direction: 'reverse' },
          E_hsk: { edge_id: 'E_hsk', actual_direction: 'reverse' },
          E_fin: { edge_id: 'E_fin', actual_direction: 'forward' },
          E_amb: { edge_id: 'E_amb', actual_direction: 'forward' },
        },
      } as unknown as ThermalSolution,
    });
    const figure = figures.find((entry) => entry.key === 'group-filter')!;
    for (const id of ['N_contact', 'N_hsk', 'N_fin', 'N_amb']) {
      expect(figure.hidden_node_ids.has(id)).toBe(false);
    }
  });

  it('trims nothing when there is no solve to read directions from', () => {
    const figures = networkFigures({
      network: filterNetwork(),
      components: [component('cavity', 'Filter')],
      ranked: [],
      leversByNode: new Map(),
    });
    const figure = figures.find((entry) => entry.key === 'group-filter')!;
    expect(figure.hidden_node_ids.size).toBe(0);
  });

  it('numbers a part figure\'s cut segments so the list can match them', () => {
    const figures = networkFigures({
      network: network(['pm']),
      components: [component('pm', 'Power')],
      ranked: [part('N_pm_body', 'pm', 1.4)],
      leversByNode: new Map([
        [
          'N_pm_body',
          [
            // The badge number travels ON the segment now, so the figure and
            // the list beside it cannot drift apart when one of them filters.
            { edge_id: 'E1', rank: 1, label: 'TIM', reduction_pct: 20, levers: [] },
            { edge_id: 'E2', rank: 2, label: 'Fin Surface', reduction_pct: 18, levers: [] },
          ] as never,
        ],
      ]),
    });
    const figure = figures.find((entry) => entry.key === 'part-N_pm_body')!;
    expect([...(figure.tuned_edges ?? [])]).toEqual([
      ['E1', { rank: 1, active: true }],
      ['E2', { rank: 2, active: true }],
    ]);
  });

  it('names the groups the review asked for', () => {
    expect(FIGURE_GROUPS.slice(0, 4).map((group) => group.title)).toEqual([
      'RF',
      'Digital',
      'PW',
      'Filter',
    ]);
  });
});
