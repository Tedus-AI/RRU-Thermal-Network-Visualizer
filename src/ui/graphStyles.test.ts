import { describe, expect, it } from 'vitest';

import type { ThermalNode } from '@/thermal/types';
import {
  GROUP_COLORS,
  HSK_BUS_COLOR,
  LEGEND,
  UNCONNECTED_PORT_COLOR,
  cytoscapeStylesheet,
  labelBox,
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

describe('orthogonal thermal-resistance routes', () => {
  it('uses square horizontal/vertical taxi segments for Screen 05 edges', () => {
    const style = styleFor('edge.orthogonal-edge');
    expect(style['curve-style']).toBe('taxi');
    expect(style['taxi-direction']).toBe('auto');
    expect(styleFor('edge.orthogonal-edge[taxiDirection]')['taxi-direction']).toBe(
      'data(taxiDirection)',
    );
    expect(style['taxi-radius']).toBe(0);
    expect(style['text-rotation']).toBe('none');
  });

  it('does not change the shared graph style used by result screens', () => {
    expect(styleFor('edge')['curve-style']).toBe('bezier');
    expect(styleFor('edge')['text-rotation']).toBe('autorotate');
  });

  it('renders bus-branch text on its own off-line annotation anchor', () => {
    expect(styleFor('edge.routed-port-edge').label).toBe('');
    expect(styleFor('edge.routed-port-edge')['curve-style']).toBe('taxi');
    expect(styleFor('node.hsk-bus-branch-label').label).toBe('data(label)');
    expect(
      styleFor('node.hsk-bus-branch-label.flow-horizontal')['text-margin-y'],
    ).toBeLessThan(0);
  });

  it('still keeps the arrowhead, which is what the offset exists to protect', () => {
    expect(styleFor('edge')['target-arrow-shape']).toBe('triangle');
  });
});

/**
 * The box has to be sized for the label Cytoscape actually PAINTS, which is the
 * label after wrapping — not the string as it was handed over. Counting only
 * the explicit newlines is how "Power Module(H48SA50030NRDH)" came to hang out
 * of the top and bottom of its own border.
 *
 * The exact glyph widths depend on whether a canvas is available to measure in,
 * so nothing here asserts a pixel: each case states a relationship that has to
 * hold in either mode.
 */
describe('labelBox', () => {
  const lines = (label: string) => (labelBox(label).h - 12) / 14;

  it('gives a short single-line label one line', () => {
    expect(lines('FPGA Lid')).toBe(1);
  });

  it('counts the lines the caller asked for', () => {
    expect(lines('FPGA Lid\n35.0 W')).toBe(2);
  });

  it('counts the lines Cytoscape adds by wrapping', () => {
    // Far past the wrap column however the glyphs are measured.
    expect(lines('Power Module(H48SA50030NRDH) Body Metal Base 29.0 W')).toBeGreaterThan(1);
  });

  it('adds the wrapped lines of every explicit line, not just the newlines', () => {
    const label = 'Power Module(H48SA50030NRDH)\nBody / Metal Base with a long tail · 29.0 W';
    expect(lines(label)).toBeGreaterThan(label.split('\n').length);
  });

  it('leaves a single unbreakable run on one line, and widens the box for it', () => {
    // `text-overflow-wrap` is `whitespace`, so a word with no space in it is
    // never broken: it overhangs the column, and the box has to follow it.
    const run = 'A'.repeat(60);
    expect(lines(run)).toBe(1);
    expect(labelBox(run).w).toBeGreaterThan(labelBox('A'.repeat(10)).w);
  });

  it('keeps a floor so a one-character node is still a box', () => {
    expect(labelBox('A').w).toBeGreaterThanOrEqual(64);
  });

  it('is wider for wide glyphs than for narrow ones when it can measure them', () => {
    // In a browser this is a real difference; with no canvas both fall back to
    // the same character count, so equality is the honest assertion there.
    expect(labelBox('WWWWWWWW').w).toBeGreaterThanOrEqual(labelBox('iiiiiiii').w);
  });
});
