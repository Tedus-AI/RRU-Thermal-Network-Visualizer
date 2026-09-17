import { describe, expect, it } from 'vitest';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { demoNetwork } from '@/mock/demoGoldenFlow';
import { focusHiddenNodes, focusLabels, graphOwner, graphPaths } from './graphExplorerModel';
import { demoComponents } from '@/mock/demoProject';
import { buildElements } from '@/screens/05-thermal-path-builder/thermalGraphElements';
import {
  buildElements as solvedElements,
  resultScales,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';

describe('view-only graph explorer', () => {
  it('shortens only generated passive labels, preserving source names and original model names', () => {
    const components = demoComponents();
    const network = demoNetwork(components);
    const before = JSON.stringify(network);
    const path = graphPaths(network)[0];
    const name = components.find(c => c.id === path.componentId)!.name;
    const labels = focusLabels(network, path, name);
    expect(labels.size).toBeGreaterThan(0);
    for (const id of path.nodeIds) {
      if (network.nodes[id].power_W !== 0) expect(labels.has(id)).toBe(false);
    }
    expect(JSON.stringify(network)).toBe(before);
  });

  it('retains extra parallel connections without averaging their resistance', () => {
    const network = demoNetwork();
    const path = graphPaths(network)[0];
    const original = Object.values(network.edges).find(edge => path.nodeIds.includes(edge.from) && path.nodeIds.includes(edge.to))!;
    network.edges.parallel_test = { ...original, id: 'parallel_test', method: 'direct_rth' };
    const before = JSON.stringify(network);
    const hidden = focusHiddenNodes(network, path);
    const elements = buildElements(network, { showLabels: true, showPorts: true, layoutMode: 'Auto', extraHiddenNodeIds: hidden });
    expect(elements.some(e => e.data.id === original.id)).toBe(true);
    expect(elements.some(e => e.data.id === 'parallel_test')).toBe(true);
    expect(JSON.stringify(network)).toBe(before);
  });
  it('groups existing component instances without changing node powers, topology or positions', () => {
    const network = demoNetwork();
    const before = JSON.stringify(network);
    const paths = graphPaths(network);
    expect(paths.length).toBeGreaterThan(4);
    expect(paths.reduce((sum, path) => sum + path.power, 0)).toBeCloseTo(
      Object.values(network.nodes)
        .filter(graphOwner)
        .reduce((sum, node) => sum + node.power_W, 0),
    );
    for (const path of paths) focusHiddenNodes(network, path);
    expect(JSON.stringify(network)).toBe(before);
  });

  it('does not traverse the common heatsink back into another component or instance', () => {
    const network = demoNetwork();
    for (const path of graphPaths(network)) {
      const hidden = focusHiddenNodes(network, path);
      for (const node of Object.values(network.nodes)) {
        if (graphOwner(node) && !path.nodeIds.includes(node.id))
          expect(hidden.has(node.id), node.name).toBe(true);
      }
      for (const id of path.nodeIds) expect(hidden.has(id)).toBe(false);
      expect(
        Object.values(network.nodes).some((node) => !graphOwner(node) && !hidden.has(node.id)),
      ).toBe(true);
    }
  });

  it('keeps both ends of every local branch and parallel edge in both canvas builders', () => {
    const network = demoNetwork();
    const before = JSON.stringify(network);
    for (const path of graphPaths(network)) {
      const hidden = focusHiddenNodes(network, path);
      const elements = buildElements(network, {
        showPorts: true,
        showLabels: true,
        layoutMode: 'Auto',
        extraHiddenNodeIds: hidden,
      });
      const solved = solvedElements(
        network,
        null,
        'rth',
        { showLabels: true, showPower: true, showLimits: false, showBoundary: true },
        '',
        'Auto',
        resultScales(null),
        new Set(),
        hidden,
      );
      for (const list of [elements, solved]) {
        const ids = new Set(list.filter((e) => e.group === 'nodes').map((e) => e.data.id));
        for (const id of path.nodeIds) expect(ids.has(id)).toBe(true);
        for (const id of hidden) expect(ids.has(id)).toBe(false);
        for (const e of list.filter((e) => e.group === 'edges')) {
          expect(ids.has(e.data.source)).toBe(true);
          expect(ids.has(e.data.target)).toBe(true);
        }
      }
    }
    expect(JSON.stringify(network)).toBe(before);
  });

  it('keeps badge ordering stable after object insertion order changes', () => {
    const network = demoNetwork();
    const keys = graphPaths(network).map((path) => path.key);
    network.nodes = Object.fromEntries(Object.entries(network.nodes).reverse());
    expect(graphPaths(network).map((path) => path.key)).toEqual(keys);
  });

  it('stops at ambient, including when another independent sink uses that same reference', () => {
    const network = demoNetwork();
    const path = graphPaths(network)[0];
    const ambient = Object.values(network.nodes).find((node) => node.type === 'ambient')!;
    const edge = Object.values(network.edges)[0];
    network.nodes.isolated_sink = {
      ...ambient,
      id: 'isolated_sink',
      type: 'heat_sink_base',
      boundary_type: null,
    };
    network.edges.isolated_link = {
      ...edge,
      id: 'isolated_link',
      from: ambient.id,
      to: 'isolated_sink',
    };
    expect(focusHiddenNodes(network, path).has('isolated_sink')).toBe(true);
  });
});

/**
 * The STARKCORE cavity filter, reduced to its shape.
 *
 * The heatsink base runs hotter than the filter body, so the contact carries
 * heat INTO the filter and the filter sheds it through its own convection to
 * ambient. The fins are downstream of the base, not of the filter — the same
 * finding the report's group figures already act on.
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
      ].map(([id, extra]) => [id, { id, name: id, power_W: 0, ...(extra as object) }]),
    ),
    edges: {
      E_out: { id: 'E_out', from: 'N_body', to: 'N_filter_amb', enabled: true },
      E_in: { id: 'E_in', from: 'N_contact', to: 'N_body', enabled: true },
      E_hsk: { id: 'E_hsk', from: 'N_hsk', to: 'N_contact', enabled: true },
      E_fin: { id: 'E_fin', from: 'N_hsk', to: 'N_fin', enabled: true },
      E_amb: { id: 'E_amb', from: 'N_fin', to: 'N_amb', enabled: true },
    },
    templates: {},
  }) as unknown as ThermalNetwork;

const forward = (ids: string[]): ThermalSolution =>
  ({
    edge_results: Object.fromEntries(
      ids.map((id) => [id, { edge_id: id, actual_direction: 'forward' }]),
    ),
  }) as unknown as ThermalSolution;

describe('a focused path follows the solved heat, not the wiring', () => {
  const path = () => graphPaths(filterNetwork())[0];

  it('stops at the node feeding heat back into the part', () => {
    const hidden = focusHiddenNodes(
      filterNetwork(),
      path(),
      forward(['E_out', 'E_in', 'E_hsk', 'E_fin', 'E_amb']),
    );

    // The part's own nodes, and where its heat actually goes.
    for (const id of ['N_body', 'N_contact', 'N_filter_amb']) {
      expect(hidden.has(id), id).toBe(false);
    }
    // The base is kept: "this heat arrives from the heatsink" is the finding.
    expect(hidden.has('N_hsk')).toBe(false);
    // What lies beyond it is the rest of the machine's path, not this part's,
    // and drawing it said the filter was cooled by fins it never reaches.
    expect(hidden.has('N_fin')).toBe(true);
    expect(hidden.has('N_amb')).toBe(true);
  });

  it('keeps the whole tail when the heat really does run out through it', () => {
    // Every other board: heat leaves the part, crosses into the base and out of
    // the fins, so the tail IS the part's own path.
    const hidden = focusHiddenNodes(filterNetwork(), path(), {
      edge_results: {
        E_out: { edge_id: 'E_out', actual_direction: 'forward' },
        E_in: { edge_id: 'E_in', actual_direction: 'reverse' },
        E_hsk: { edge_id: 'E_hsk', actual_direction: 'reverse' },
        E_fin: { edge_id: 'E_fin', actual_direction: 'forward' },
        E_amb: { edge_id: 'E_amb', actual_direction: 'forward' },
      },
    } as unknown as ThermalSolution);
    for (const id of ['N_contact', 'N_hsk', 'N_fin', 'N_amb']) {
      expect(hidden.has(id), id).toBe(false);
    }
  });

  it('trims nothing when there is no solve to read directions from', () => {
    // Screens 05 and 06 focus the same graph before anything has been solved.
    const hidden = focusHiddenNodes(filterNetwork(), path());
    for (const id of ['N_filter_amb', 'N_hsk', 'N_fin', 'N_amb']) {
      expect(hidden.has(id), id).toBe(false);
    }
  });
});
