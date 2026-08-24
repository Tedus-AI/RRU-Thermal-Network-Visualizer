import { describe, expect, it } from 'vitest';

import type { ThermalNode } from '@/thermal/types';
import {
  GROUP_COLORS,
  HSK_BUS_COLOR,
  LEGEND,
  UNCONNECTED_PORT_COLOR,
  cytoscapeStylesheet,
  nodeGroup,
  type NodeVisualGroup,
} from './graphStyles';

function node(patch: Partial<ThermalNode> & Pick<ThermalNode, 'type'>): ThermalNode {
  return {
    id: 'N',
    name: 'N',
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    ports: [],
    ...patch,
  };
}

function styleFor(selector: string): Record<string, unknown> {
  const rule = cytoscapeStylesheet().find(
    (entry) => (entry as unknown as { selector: string }).selector === selector,
  );
  return (rule as unknown as { style: Record<string, unknown> } | undefined)?.style ?? {};
}

/**
 * A legend that names a colour the canvas does not paint — or omits one it does
 * — is worse than none: it is a lookup table that quietly answers wrong. Two
 * entries were exactly that. The amber swatch was labelled "Interface / Case"
 * while it belongs to the SPREADER group, and `custom`, the fallback every node
 * matching none of the type lists lands in, had no entry at all.
 */
describe('the legend describes what the canvas actually paints', () => {
  it('has an entry for every node group, using that group border colour', () => {
    const groups = Object.keys(GROUP_COLORS) as NodeVisualGroup[];
    const swatches = LEGEND.filter((entry) => entry.kind === 'node').map((entry) => entry.style);

    expect(swatches).toHaveLength(groups.length);
    for (const group of groups) {
      expect(swatches, `no legend swatch for the ${group} group`).toContain(
        GROUP_COLORS[group].border,
      );
    }
  });

  it('names no colour that is not a group border or a painted state', () => {
    const known = new Set<string>([
      ...Object.values(GROUP_COLORS).map((colors) => colors.border),
      UNCONNECTED_PORT_COLOR,
      HSK_BUS_COLOR,
    ]);
    for (const entry of LEGEND) {
      if (entry.kind === 'line') continue;
      expect(known, `${entry.label} shows a colour nothing paints`).toContain(entry.style);
    }
  });

  // The resolution styles carry no colour of their own, so their swatches are
  // grey; a coloured line entry is pointing at one specific line on the canvas.
  it('covers the three line styles edgeLineStyle can return', () => {
    const lines = LEGEND.filter((entry) => entry.kind === 'line' && !entry.color).map(
      (entry) => entry.style,
    );
    expect(lines.sort()).toEqual(['dashed', 'dotted', 'solid']);
  });

  it('draws the shared HSK bus as a line in the teal the canvas paints it', () => {
    const bus = LEGEND.find((entry) => entry.color === HSK_BUS_COLOR);
    expect(bus?.kind).toBe('line');
    expect(bus?.style).toBe('solid');
    // Same constant the bus node, its junctions and its trunk edge all use.
    expect(styleFor('node.hsk-bus')['background-color']).toBe(HSK_BUS_COLOR);
    expect(styleFor('edge.hsk-bus-trunk')['line-color']).toBe(HSK_BUS_COLOR);
  });

  it('reads the open-port ring off the same constant the stylesheet uses', () => {
    expect(styleFor('node.unconnected-port')['border-color']).toBe(UNCONNECTED_PORT_COLOR);
    const ring = LEGEND.find((entry) => entry.style === UNCONNECTED_PORT_COLOR);
    expect(ring?.kind).toBe('state');
  });

  it('groups a spreader as a spreader, which is what the amber swatch means', () => {
    for (const type of ['case', 'lid', 'epad', 'pcb', 'copper_coin', 'pedestal'] as const) {
      expect(nodeGroup(node({ type }))).toBe('spreader');
    }
    // And the group the legend used to skip entirely.
    expect(nodeGroup(node({ type: 'unknown' as ThermalNode['type'] }))).toBe('custom');
  });
});

/**
 * How much of a connector stayed visible used to depend on how long its label
 * happened to be: "Cond 0.035 °C/W" left the ends showing while "Contact 0.035
 * °C/W" covered the line end to end, arrowhead included.
 */
describe('edge labels sit off the line, not on it', () => {
  it('offsets the label perpendicular to the edge', () => {
    const style = styleFor('edge');
    expect(style['text-margin-y']).toBeLessThan(0);
    // Perpendicular only holds if the label rotates with the edge.
    expect(style['text-rotation']).toBe('autorotate');
  });

  it('offsets the straight routed branches the same way', () => {
    expect(styleFor('edge.routed-port-edge')['text-margin-y']).toBe(
      styleFor('edge')['text-margin-y'],
    );
  });

  it('still keeps the arrowhead, which is what the offset exists to protect', () => {
    expect(styleFor('edge')['target-arrow-shape']).toBe('triangle');
  });
});
