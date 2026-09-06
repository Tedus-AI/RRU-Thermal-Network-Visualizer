import { describe, expect, it } from 'vitest';
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
