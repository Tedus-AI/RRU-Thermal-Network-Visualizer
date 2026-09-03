/**
 * Screen 07's component filter.
 *
 * It is a way of reading a crowded graph and nothing more: the solution was
 * computed over the whole network before anything was hidden, and the KPI bar,
 * the energy balance and the results table all still report it. So the test
 * that matters is that hiding a component takes its branch off the bus without
 * touching the network it was read from.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ComponentVisibilityPanel } from '@/ui/ComponentVisibilityPanel';
import { createComponent, type Component } from '@/domain/component';
import { hiddenNodeIds } from '@/screens/05-thermal-path-builder/thermalGraphElements';
import type { ThermalNetwork } from '@/thermal/types';

import { ResultModeToolbar } from './ResultModeToolbar';
import { solvedBusElements } from './solvedBusElements';

function component(id: string, name: string): Component {
  return createComponent({
    id,
    name,
    category: 'RF',
    qty: 2,
    power_W: 10,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-09-02T00:00:00.000Z',
    },
  });
}

const toolbarProps = {
  mode: 'rth' as const,
  hasResult: true,
  display: { showLabels: true, showPower: true, showLimits: false, showBoundary: true },
  tool: 'select' as const,
  zoom: 1,
  layoutMode: 'Auto',
  fullscreen: false,
  onMode: vi.fn(),
  onDisplay: vi.fn(),
  onTool: vi.fn(),
  onZoom: vi.fn(),
  onLayoutMode: vi.fn(),
  onRelayout: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onToggleComponentVisibility: vi.fn(),
};

describe('Screen 07 component visibility', () => {
  it('offers the filter from the toolbar, with the hidden count on it', () => {
    const html = renderToStaticMarkup(
      <ResultModeToolbar
        {...toolbarProps}
        componentVisibilityOpen={false}
        hiddenComponentCount={2}
      />,
    );

    expect(html).toContain('Component Visibility / 元件顯示');
    expect(html).toContain('>2</span>');
  });

  /** Screen 07's top-left corner is the legend's, so the panel opens opposite. */
  it('opens bottom-left, clear of the legend', () => {
    const html = renderToStaticMarkup(
      <ComponentVisibilityPanel
        components={[component('CMP_PA', 'Final PA')]}
        hiddenIds={new Set()}
        onToggleVisible={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
        onClose={vi.fn()}
        placement="bottom-left"
      />,
    );

    expect(html).toContain('bottom-3');
    expect(html).not.toContain('top-3');
  });

  it('still opens top-left where nothing else holds that corner', () => {
    const html = renderToStaticMarkup(
      <ComponentVisibilityPanel
        components={[component('CMP_PA', 'Final PA')]}
        hiddenIds={new Set()}
        onToggleVisible={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('top-3');
  });

  /**
   * One button, two directions. A disabled "Show all" was dead half the time
   * and left no way to clear the canvas down to one chain, which is the thing
   * the panel exists for. The label has to name the NEXT click, so it can be
   * read without the count beside it.
   */
  it('offers Hide all with nothing hidden, and Show all once something is', () => {
    const parts = [component('CMP_PA', 'Final PA'), component('CMP_FPGA', 'FPGA')];
    const panel = (hiddenIds: ReadonlySet<string>) =>
      renderToStaticMarkup(
        <ComponentVisibilityPanel
          components={parts}
          hiddenIds={hiddenIds}
          onToggleVisible={vi.fn()}
          onShowAll={vi.fn()}
          onHideAll={vi.fn()}
          onClose={vi.fn()}
        />,
      );

    const empty = panel(new Set());
    expect(empty).toContain('Hide all / 全部取消');
    expect(empty).not.toContain('Show all / 全部顯示');

    const some = panel(new Set(['CMP_FPGA']));
    expect(some).toContain('Show all / 全部顯示');
    expect(some).not.toContain('Hide all / 全部取消');
  });

  it('takes a hidden component off the bus, and leaves the network alone', () => {
    const network = busNetwork();
    const before = JSON.stringify(network);

    const all = solvedBusElements(network, null, {
      layoutMode: 'LeftRight',
      showLabels: true,
      mode: 'rth',
      scenarioId: 'SCN_001',
    });
    const hidden = hiddenNodeIds(network, new Set(['CMP_B']));
    const filtered = solvedBusElements(network, null, {
      layoutMode: 'LeftRight',
      showLabels: true,
      mode: 'rth',
      scenarioId: 'SCN_001',
      hidden,
    });

    expect(all.routed.size).toBe(5);
    expect(filtered.routed.size).toBe(4);
    expect([...filtered.routed.keys()]).not.toContain('EDGE_PORT_B');
    // Shared structure has no component behind it, so the base never vanishes.
    expect(hidden.has('HSK_BASE')).toBe(false);
    expect(JSON.stringify(network)).toBe(before);
  });
});

/**
 * Five components on one shared base.
 *
 * Five and not two because a bus only forms at four branches or more: with two
 * the graph draws them as ordinary edges and there is no bus to take anything
 * off. Five means hiding one still leaves a bus to check.
 */
function busNetwork(): ThermalNetwork {
  const ids = ['A', 'B', 'C', 'D', 'E'];
  const node = (id: string, componentRef: string | null, type: string) => ({
    id,
    name: id,
    type,
    power_W: 0,
    limit_C: null,
    component_ref: componentRef,
    disabled: false,
  });

  const nodes: Record<string, unknown> = {
    HSK_BASE: node('HSK_BASE', null, 'heat_sink_base'),
  };
  const edges: Record<string, unknown> = {};
  const positions: Record<string, { x: number; y: number }> = {
    HSK_BASE: { x: 300, y: 240 },
  };
  const templates: Record<string, unknown> = {};

  ids.forEach((letter, index) => {
    const nodeId = `${letter}_HEAT_OUT`;
    nodes[nodeId] = node(nodeId, `CMP_${letter}`, 'custom');
    // Only `EDGE_PORT_` edges are bus candidates — the prefix is the contract.
    edges[`EDGE_PORT_${letter}`] = {
      id: `EDGE_PORT_${letter}`,
      from: nodeId,
      to: 'HSK_BASE',
      enabled: true,
      rth: { active_source: 'A' as const },
    };
    positions[nodeId] = { x: 0, y: index * 120 };
    templates[`CMP_${letter}`] = {};
  });

  return { nodes, edges, templates, layout: { positions } } as unknown as ThermalNetwork;
}
