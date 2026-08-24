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
 * Deterministic node box, so nothing depends on asynchronous text measurement.
 * Cytoscape's `width: label` is measured late; a node measured as 0x0 is cached
 * as "takes up no space" and then never painted.
 */
export function labelBox(label: string): { w: number; h: number } {
  const lines = label.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    w: Math.min(180, Math.max(64, Math.round(longest * 5.6) + 18)),
    h: lines.length * 14 + 12,
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
        'font-size': 10,
        'font-weight': 600,
        'text-max-width': '140px',
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
        // The label rides ABOVE the line rather than on it.
        //
        // It used to sit centred on the edge behind an opaque white box, so how
        // much of the connector you could still see depended on how long the
        // text happened to be: "Cond 0.035 °C/W" left the ends showing, while
        // "Contact 0.035 °C/W" covered the line end to end, arrowhead included.
        // Offsetting it perpendicular makes that independent of length — the
        // full line, tail and head, is visible under every label.
        'text-margin-y': -9,
        'min-zoomed-font-size': 7,
      },
    },
    {
      selector: 'edge.routed-port-edge',
      style: {
        'curve-style': 'straight',
        'text-rotation': 'none',
        'text-margin-y': -9,
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
