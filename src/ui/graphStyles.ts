/**
 * Canvas visual language — 05 §31, §32.
 *
 * Screen 05 has NOT solved anything, so nothing here may be coloured by
 * temperature. Nodes are coloured by their thermal role, edges by type and
 * resolution status:
 *
 *   solid  = Rth resolved
 *   dashed = unresolved / boundary-dependent
 *   dotted = disabled / tentative
 */

import type { StylesheetCSS } from 'cytoscape';
import type { NodeType, ThermalEdge, ThermalNode } from '@/thermal/types';

export type NodeVisualGroup =
  | 'source'
  | 'interface'
  | 'spreader'
  | 'zone'
  | 'heatsink'
  | 'boundary'
  | 'custom';

/** Role, not temperature (05 §31). */
export function nodeGroup(node: ThermalNode): NodeVisualGroup {
  if (node.boundary_role === 'placeholder' || node.type === 'ambient') {
    return 'boundary';
  }
  if (node.power_W > 0 || node.type === 'junction' || node.type === 'die') {
    return 'source';
  }

  const interfaces: NodeType[] = ['tim_interface', 'solder_interface', 'thermal_via'];
  if (interfaces.includes(node.type)) return 'interface';

  const spreaders: NodeType[] = ['case', 'lid', 'epad', 'pcb', 'copper_coin', 'pedestal'];
  if (spreaders.includes(node.type)) return 'spreader';

  const zones: NodeType[] = ['small_base', 'base_zone', 'housing'];
  if (zones.includes(node.type)) return 'zone';

  const sinks: NodeType[] = [
    'heat_sink_base',
    'fin_surface',
    'heat_pipe_evaporator',
    'heat_pipe_condenser',
  ];
  if (sinks.includes(node.type)) return 'heatsink';

  return 'custom';
}

export const GROUP_COLORS: Record<NodeVisualGroup, { fill: string; border: string; text: string }> = {
  source: { fill: '#fee2e2', border: '#dc2626', text: '#7f1d1d' },
  spreader: { fill: '#fef3c7', border: '#d97706', text: '#78350f' },
  interface: { fill: '#fef9c3', border: '#ca8a04', text: '#713f12' },
  zone: { fill: '#dcfce7', border: '#16a34a', text: '#14532d' },
  heatsink: { fill: '#ccfbf1', border: '#0d9488', text: '#134e4a' },
  boundary: { fill: '#dbeafe', border: '#2563eb', text: '#1e3a8a' },
  custom: { fill: '#e2e8f0', border: '#64748b', text: '#1e293b' },
};

/**
 * Amber ring on a node that still has an unconnected port, and the teal of the
 * view-only HSK bus. Neither is a `nodeGroup` colour — they are painted by
 * `node.unconnected-port` and `node.hsk-bus` in the stylesheet — so they are
 * named here to keep the legend and the stylesheet reading from one place.
 */
export const UNCONNECTED_PORT_COLOR = '#f59e0b';
export const HSK_BUS_COLOR = '#0d9488';

export interface LegendEntry {
  label: string;
  zh: string;
  kind: 'node' | 'line' | 'state';
  style: string;
  /**
   * Line colour, for entries whose swatch is a line rather than a chip. The
   * three resolution styles are drawn grey because they say nothing about
   * colour; the HSK bus is a specific teal line on the canvas, so its swatch
   * has to be that same teal or it is not the thing being pointed at.
   */
  color?: string;
  /** Rendered as a section heading above this entry. */
  section?: string;
  sectionZh?: string;
}

/**
 * Every colour and line style the canvas actually paints, in the order it
 * paints them.
 *
 * Derived from `GROUP_COLORS` rather than restated, so a palette change cannot
 * leave the legend describing colours that are no longer on screen. Two entries
 * used to be wrong in exactly that way: the amber swatch was labelled
 * "Interface / Case" while it is the SPREADER group (case, lid, E-PAD, PCB,
 * copper coin, pedestal), and `custom` — what every node that matches none of
 * the type lists falls back to — had no entry at all, so a slate-grey node on
 * the canvas could not be looked up.
 */
export const LEGEND: LegendEntry[] = [
  {
    label: 'Heat Source / Junction',
    zh: '熱源 / 接面',
    kind: 'node',
    style: GROUP_COLORS.source.border,
    section: 'Nodes',
    sectionZh: '節點',
  },
  {
    label: 'Case / Spreader',
    zh: '外殼 / 擴散件',
    kind: 'node',
    style: GROUP_COLORS.spreader.border,
  },
  {
    label: 'Interface / TIM',
    zh: '介面 / 熱介面材料',
    kind: 'node',
    style: GROUP_COLORS.interface.border,
  },
  { label: 'Base / Shared Zone', zh: '基座 / 共用區', kind: 'node', style: GROUP_COLORS.zone.border },
  { label: 'HSK / Structure', zh: '散熱器 / 結構', kind: 'node', style: GROUP_COLORS.heatsink.border },
  {
    label: 'Boundary / Ambient',
    zh: '邊界 / 環境',
    kind: 'node',
    style: GROUP_COLORS.boundary.border,
  },
  { label: 'Other / Custom', zh: '其他 / 自訂', kind: 'node', style: GROUP_COLORS.custom.border },

  {
    label: 'Resolved Rth',
    zh: '已解析熱阻',
    kind: 'line',
    style: 'solid',
    section: 'Connections',
    sectionZh: '連線',
  },
  { label: 'Unresolved Rth', zh: '未解析熱阻', kind: 'line', style: 'dashed' },
  { label: 'Disabled / Tentative', zh: '停用 / 暫定', kind: 'line', style: 'dotted' },

  {
    label: 'Open port',
    zh: '尚有未連接的埠',
    kind: 'state',
    style: UNCONNECTED_PORT_COLOR,
    section: 'States',
    sectionZh: '狀態',
  },
  // A line on the canvas, not a ring on a node — so it is drawn as one.
  {
    label: 'Shared HSK bus',
    zh: '共用散熱器匯流',
    kind: 'line',
    style: 'solid',
    color: HSK_BUS_COLOR,
  },
];

/** Edge line style follows resolution, never a solved heat flow (05 §31). */
export function edgeLineStyle(edge: ThermalEdge): 'solid' | 'dashed' | 'dotted' {
  if (!edge.enabled) return 'dotted';
  return edge.resolution === 'resolved' ? 'solid' : 'dashed';
}

const EDGE_COLORS: Partial<Record<ThermalEdge['type'], string>> = {
  package_rjc: '#dc2626',
  conduction: '#d97706',
  solder: '#ea580c',
  tim: '#ca8a04',
  thermal_via: '#0891b2',
  contact: '#7c3aed',
  spreading: '#16a34a',
  heat_pipe: '#0d9488',
  convection: '#2563eb',
  radiation: '#4f46e5',
};

export function edgeColor(edge: ThermalEdge): string {
  if (!edge.enabled) return '#94a3b8';
  return EDGE_COLORS[edge.type] ?? '#64748b';
}

/**
 * Text metrics the node box and the stylesheet BOTH depend on.
 *
 * `NODE_TEXT_MAX_W` has to match `text-max-width`, and `NODE_FONT` has to match
 * `font-weight`, `font-size` and `font-family`, all set on the node rule below.
 * The box is sized by measuring the label in that exact font and wrapping it at
 * that exact column, so anything that drifts apart here shows up as text
 * hanging out of a border.
 */
const NODE_FONT_SIZE = 10;
const NODE_FONT_FAMILY = 'system-ui, sans-serif';
const NODE_FONT = `600 ${NODE_FONT_SIZE}px ${NODE_FONT_FAMILY}`;
const NODE_LINE_H = 14;
const NODE_TEXT_MAX_W = 140;
const NODE_PADDING = 18;
/** Fallback average glyph width, for environments with no canvas to measure in. */
const NODE_CHAR_W = 5.6;

/**
 * A 2D context kept only to measure text in the node font.
 *
 * `undefined` means "not tried yet", `null` means "there is none" — a test
 * runner outside a browser, or a canvas implementation that hands back no
 * context. Either way the character estimate takes over, which is rough but
 * never throws.
 */
let measurer: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string): number {
  if (measurer === undefined) {
    try {
      const context = document.createElement('canvas').getContext('2d');
      if (context) context.font = NODE_FONT;
      measurer = context ?? null;
    } catch {
      measurer = null;
    }
  }
  return measurer ? measurer.measureText(text).width : text.length * NODE_CHAR_W;
}

/**
 * How many lines a label occupies once Cytoscape has wrapped it, and how wide
 * the widest of them is.
 *
 * `text-wrap: wrap` breaks on spaces, so this is the same greedy fill: take
 * words until the next one would not fit, then break. A single word wider than
 * the column has nowhere to break and overhangs it, so it counts as one line at
 * its full width — which is why the box is allowed to be wider than the column.
 */
function wrapLabel(line: string, maxWidth: number): { lines: number; width: number } {
  if (textWidth(line) <= maxWidth) return { lines: 1, width: textWidth(line) };

  let lines = 1;
  let current = '';
  let widest = 0;
  for (const word of line.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && textWidth(candidate) > maxWidth) {
      widest = Math.max(widest, textWidth(current));
      lines += 1;
      current = word;
      continue;
    }
    current = candidate;
  }
  return { lines, width: Math.max(widest, textWidth(current)) };
}

/**
 * Deterministic node box, so nothing depends on asynchronous text measurement.
 * Cytoscape's `width: label` is measured late; a node measured as 0x0 is cached
 * as "takes up no space" and then never painted.
 *
 * The height used to count only the EXPLICIT lines — the `\n`s the caller put
 * in. Cytoscape then wrapped anything wider than `text-max-width` onto further
 * lines the box knew nothing about, and the text ran out of the top and bottom
 * of the border. A part carrying its manufacturer code in its name — "Power
 * Module(H48SA50030NRDH)" — did it on the very first line.
 *
 * The width was guessed from a character COUNT, which is the same class of
 * error: "WWWW" and "iiii" are not the same width in any proportional font, so
 * the box was too narrow for one and too wide for the other. Both are now
 * measured in the font the canvas actually paints in.
 */
export function labelBox(label: string): { w: number; h: number } {
  const wrapped = label.split('\n').map((line) => wrapLabel(line, NODE_TEXT_MAX_W));
  const rendered = wrapped.reduce((total, line) => total + line.lines, 0);
  const widest = wrapped.reduce((max, line) => Math.max(max, line.width), 0);
  return {
    w: Math.max(64, Math.round(widest) + NODE_PADDING),
    h: rendered * NODE_LINE_H + 12,
  };
}

export function cytoscapeStylesheet(): StylesheetCSS[] {
  return [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        // Explicit sizes, not `width: label`. Label-driven sizing is measured
        // asynchronously, and a node measured as 0x0 is cached as "takes up no
        // space" and never painted (cytoscape `eleTakesUpSpace`).
        width: 'data(w)',
        height: 'data(h)',
        'background-color': 'data(fill)',
        'border-color': 'data(border)',
        'border-width': 1.5,
        label: 'data(label)',
        color: 'data(text)',
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        // These three and `text-max-width` are what `labelBox` measures
        // against. Changing one here without changing it there puts the text
        // back outside the border.
        'font-size': NODE_FONT_SIZE,
        'font-weight': 600,
        'font-family': NODE_FONT_FAMILY,
        'text-max-width': `${NODE_TEXT_MAX_W}px`,
      },
    },
    {
      selector: 'node.boundary',
      style: { 'border-style': 'dashed', 'border-width': 2 },
    },
    {
      selector: 'node.unconnected-port',
      style: { 'border-color': UNCONNECTED_PORT_COLOR, 'border-width': 2.5 },
    },
    {
      selector: 'node.disabled',
      style: { opacity: 0.45, 'border-style': 'dotted' },
    },
    {
      selector: 'node:selected',
      style: { 'border-color': '#1d4ed8', 'border-width': 3 },
    },
    {
      selector: 'node.connect-source',
      style: { 'border-color': '#1d4ed8', 'border-width': 3, 'border-style': 'double' },
    },
    {
      selector: 'node.hsk-bus',
      style: {
        shape: 'rectangle',
        width: 'data(w)',
        height: 'data(h)',
        label: '',
        'background-color': HSK_BUS_COLOR,
        'border-width': 0,
        events: 'no',
        'z-index': 1,
      },
    },
    {
      selector: 'node.hsk-bus-junction',
      style: {
        shape: 'ellipse',
        width: 'data(w)',
        height: 'data(h)',
        label: '',
        'background-color': HSK_BUS_COLOR,
        'border-width': 0,
        events: 'no',
        'z-index': 8,
      },
    },
    /*
      The parallel combination, annotated on the bus where two branches rejoin.

      A 1x1 invisible anchor carrying only a label: it is a note about the
      graph, not a thing in it, so it must not paint a box, must not be
      clickable, and must not be dragged. `text-halign: right` puts the text
      beside the bar rather than on either branch.
    */
    {
      selector: 'node.hsk-bus-parallel-note',
      style: {
        width: 1,
        height: 1,
        shape: 'ellipse',
        'background-opacity': 0,
        'border-width': 0,
        label: 'data(label)',
        color: HSK_BUS_COLOR,
        'font-size': 9,
        'font-weight': 700,
        'text-halign': 'right',
        'text-valign': 'center',
        'text-margin-x': 10,
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.92,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 7,
        events: 'no',
        'z-index': 9,
      },
    },
    /*
      A branch label is a view-only annotation on the long, clear lane of an
      orthogonal route. Keeping it off the edge itself prevents Cytoscape from
      centring an opaque label box on the taxi corner and hiding either leg.
    */
    {
      selector: 'node.hsk-bus-branch-label',
      style: {
        width: 1,
        height: 1,
        shape: 'ellipse',
        'background-opacity': 0,
        'border-width': 0,
        label: 'data(label)',
        color: '#475569',
        'font-size': 9,
        'font-weight': 500,
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.94,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 7,
        events: 'no',
        'z-index': 9,
      },
    },
    {
      selector: 'node.hsk-bus-branch-label.flow-horizontal',
      style: { 'text-margin-y': -11 },
    },
    {
      selector: 'node.hsk-bus-branch-label.flow-horizontal.parallel-label',
      style: { 'text-margin-y': -15 },
    },
    {
      selector: 'node.hsk-bus-branch-label.flow-vertical',
      style: { 'text-halign': 'right', 'text-margin-x': 11 },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': 'data(color)',
        'line-style': 'data(lineStyle)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'data(color)',
        'arrow-scale': 0.8,
        label: 'data(label)',
        'font-size': 9,
        color: '#475569',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.92,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
        'text-margin-y': -9,
        'min-zoomed-font-size': 7,
      },
    },
    {
      selector: 'edge.orthogonal-edge',
      style: {
        'curve-style': 'taxi',
        'taxi-direction': 'auto',
        'taxi-turn': '22%',
        'taxi-turn-min-distance': 14,
        'taxi-radius': 0,
        'text-rotation': 'none',
        // Horizontal routes place labels above their lane; vertical routes
        // place them to the right. The margins are sized by the Screen 05
        // projection so the background never sits on a resistance segment.
        'text-margin-x': 0,
        'text-margin-y': -12,
      },
    },
    {
      selector: 'edge.orthogonal-edge[taxiDirection]',
      style: { 'taxi-direction': 'data(taxiDirection)' },
    },
    {
      selector: 'edge.orthogonal-edge[labelMarginX][labelMarginY]',
      style: {
        'text-margin-x': 'data(labelMarginX)',
        'text-margin-y': 'data(labelMarginY)',
      },
    },
    {
      selector: 'edge.routed-port-edge',
      style: {
        'curve-style': 'taxi',
        'taxi-turn': '18%',
        // A dedicated label anchor owns the text for bus branches.
        label: '',
        'z-index': 5,
      },
    },
    {
      selector: 'edge.hsk-bus-trunk',
      style: {
        width: 2,
        'curve-style': 'straight',
        'line-color': HSK_BUS_COLOR,
        'target-arrow-shape': 'none',
        label: '',
        events: 'no',
        'z-index': 2,
      },
    },
    {
      selector: 'edge.layout-only',
      style: {
        opacity: 0,
        width: 0.1,
        label: '',
        'target-arrow-shape': 'none',
        events: 'no',
      },
    },
    {
      selector: 'edge:selected',
      style: { width: 4, 'line-color': '#1d4ed8', 'target-arrow-color': '#1d4ed8' },
    },
    {
      selector: '.hide-label',
      style: { label: '' },
    },
  ] as unknown as StylesheetCSS[];
}
