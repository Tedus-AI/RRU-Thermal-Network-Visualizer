/**
 * Solved thermal graph — 07 §20–§28.
 *
 * The canvas paints ONE result mode at a time and says which. Colour always
 * means the quantity named in the toolbar, never a bottleneck rank: 07 §44
 * keeps ranking, sensitivity and composite scores entirely inside Screen 08.
 *
 * Heat-flow arrows follow the SOLVED direction (07 §22): a negative Q flips the
 * arrow instead of being hidden or flagged as an error.
 *
 * The Cytoscape mechanics repeat what Screens 05 and 06 learned: explicit node
 * sizes rather than `width: label`, positions read only after `layoutstop`, and
 * a fit that waits until the container really has a size.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import cytoscape, { type Core, type ElementDefinition, type StylesheetCSS } from 'cytoscape';
import dagre from 'cytoscape-dagre';

import {
  busStylesheet,
  GROUP_COLORS,
  HSK_BUS_COLOR,
  labelBox,
  NODE_TEXT_STYLE,
  nodeGroup,
} from '@/ui/graphStyles';
import {
  parallelBranchLabel,
  parallelNote,
  solvedBusElements,
} from './solvedBusElements';
import { positionViewBuses } from '@/screens/05-thermal-path-builder/busLayout';
import {
  branchShortName,
  hiddenNodeIds,
} from '@/screens/05-thermal-path-builder/thermalGraphElements';
import {
  marqueeRect,
  WHEEL_ZOOM_STEP,
  wheelNotches,
  zoomRegionViewport,
  type ViewportBox,
} from '@/ui/graphViewport';
import { layoutOptions } from '@/screens/05-thermal-path-builder/ThermalGraphCanvas';
import {
  parallelBraceElement,
  parallelBraceStyle,
  parallelBranchGeometry,
  parallelBranchStyles,
  parallelPairNames,
  parallelPairs,
} from '@/screens/05-thermal-path-builder/parallelPairs';
import type { ThermalNetwork, ThermalNode } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import {
  COMBINED_MODE,
  RTH_SOURCE_BADGE,
  RTH_SOURCE_COLORS,
  buildScale,
  num,
  paintsEdgeDelta,
  paintsNodeTemperature,
  rth as formatRth,
  deltaTLabel,
  type ResultMode,
  type Scale,
} from './resultViewModel';

cytoscape.use(dagre);

/**
 * Whether a value read back from storage is a complete set of display options.
 *
 * Every flag is checked, not just the shape: a partial object would leave one
 * of them `undefined`, which reads as false, so a label the engineer had left
 * ON would come back off with nothing to say why.
 */
export function isDisplayOptions(value: unknown): value is GraphDisplayOptions {
  if (value == null || typeof value !== 'object') return false;
  const options = value as Record<string, unknown>;
  return (['showLabels', 'showPower', 'showLimits', 'showBoundary'] as const).every(
    (flag) => typeof options[flag] === 'boolean',
  );
}

export interface GraphDisplayOptions {
  showLabels: boolean;
  showPower: boolean;
  showLimits: boolean;
  showBoundary: boolean;
  /** Dims everything not attached to the selection — 07 §27 "Focus Path". */
}

export interface SolvedGraphHandle {
  fit: () => void;
  /**
   * The WHOLE graph as a JPEG data URI at model scale, or null before the
   * canvas exists.
   *
   * `full: true` renders the graph's own bounding box, so it neither depends on
   * where the engineer has scrolled nor moves them; `scale: 1` is the point of
   * the export — the fitted view is about 51 % on a 22" screen, and 51 % is
   * where the edge labels stop being readable.
   *
   * Taken from the LIVE instance rather than re-rendered, so the file shows the
   * layout on screen, including any node dragged by hand.
   */
  exportJpg: () => string | null;
  zoomBy: (delta: number) => void;
  relayout: (mode: string) => void;
  center: (elementId: string) => void;
}

/**
 * What the pointer does on this canvas.
 *
 * Screen 05's canvas carries a longer list because it edits topology; here
 * nothing is editable, so the only choice is between panning the view and
 * dragging out a region to zoom into.
 */
export type SolvedCanvasTool = 'select' | 'zoom-box';

/**
 * What a layout is allowed to move: the real graph, never the bus.
 *
 * The bar, its junctions and its annotations are a picture OF the positions
 * dagre produces. Handing them to dagre as though they were nodes would have it
 * solve for their placement too, and the bar would end up in a rank of its own.
 */
export function layoutSubject(cy: Core) {
  return cy.elements().filter((element) => {
    if (element.isNode()) return !element.hasClass('view-only');
    return (
      element.hasClass('layout-only') ||
      (!element.hasClass('view-only') && !element.hasClass('routed-port-edge'))
    );
  });
}

export function edgeLabelsOf(cy: Core): string[] {
  const labels: string[] = [];
  layoutSubject(cy)
    .edges()
    .forEach((edge) => {
      const label = edge.data('label');
      if (typeof label === 'string' && label.trim()) labels.push(label);
    });
  return labels;
}

const EDGE_NEUTRAL = '#94a3b8';
/**
 * Both ramps used to open on a tint — `#bbf7d0`, `#e0f2fe` — which is a fine
 * fill colour and a bad LINE colour: a 2 px stroke of it on white is close to
 * invisible, so the cheapest edges in the graph were the ones you could not
 * see. These start at a saturated green instead and keep the same
 * green → amber → red reading.
 */
const DELTA_RAMP = ['#0284c7', '#0ea5e9', '#d97706', '#ea580c', '#dc2626'] as const;
const RTH_RAMP = ['#15803d', '#65a30d', '#ca8a04', '#ea580c', '#dc2626'] as const;

/** Exported so a test can hold it to the metrics `labelBox` measures against. */
export function solvedStylesheet(): StylesheetCSS[] {
  return [
    // The bus is the same picture as on Screen 05, so it is the same rules.
    ...busStylesheet(),
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
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
        // Exactly what `labelBox` measured this node's box against.
        ...NODE_TEXT_STYLE,
      },
    },
    { selector: 'node.fixed', style: { 'border-style': 'dashed', 'border-width': 2.5 } },
    { selector: 'node.over-limit', style: { 'border-color': '#dc2626', 'border-width': 3 } },
    { selector: 'node:selected', style: { 'border-color': '#1d4ed8', 'border-width': 3.5 } },
    { selector: '.dimmed', style: { opacity: 0.18 } },
    {
      // A branch runs straight from its terminal to the bar, so its label
      // reads better upright than rotated along it — as on Screen 05.
      selector: 'edge.routed-port-edge',
      style: { 'curve-style': 'straight', 'text-rotation': 'none', 'text-margin-y': -11 },
    },
    {
      // Present for Dagre's ranking only; the engineer sees the routed branch.
      selector: 'edge.layout-only',
      style: { visibility: 'hidden', events: 'no', label: '' },
    },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': 'data(color)',
        'line-style': 'data(lineStyle)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'data(tgtArrow)',
        'source-arrow-shape': 'data(srcArrow)',
        'target-arrow-color': 'data(color)',
        'source-arrow-color': 'data(color)',
        'arrow-scale': 0.85,
        label: 'data(label)',
        'font-size': 9,
        'font-weight': 600,
        color: '#334155',
        'text-background-color': '#ffffff',
        // Opaque, and above the bus: the bar and its junctions paint at
        // z-index 1 and 8, so a branch label landing near where they meet was
        // read through them.
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
        // Beside the line, not on it. An opaque label centred on the edge
        // erases the stretch of line it names — and on this screen the line's
        // own colour and thickness ARE the result, so hiding it hides data.
        // 11px clears the label's half-height (a 9px font in a ~15px box with
        // its padding) with a few pixels to spare.
        'text-margin-y': -11,
        'z-index': 10,
      },
    },
    /*
       The marker over a segment being tuned.

       A view-only node rather than a second edge label, because Cytoscape gives
       one element ONE text background: the edge's own label already owns it and
       already sits above the line. A node can be a real badge — a filled circle
       with a number in it — and can be placed at the midpoint of the segment it
       belongs to, which is the only position that is unambiguous when four
       segments in a row are marked.
    */
    {
      selector: 'node.tuned-badge',
      style: {
        width: 20,
        height: 20,
        shape: 'ellipse',
        'background-color': '#94a3b8',
        'border-width': 2,
        'border-color': '#ffffff',
        label: 'data(label)',
        color: '#ffffff',
        'font-size': 11,
        'font-weight': 700,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-background-opacity': 0,
        events: 'no',
        'z-index': 30,
      },
    },
    {
      // Actually cut, as opposed to merely offered: this is the one the reader
      // is asking "which segment am I moving?" about.
      selector: 'node.tuned-badge.tuned-active',
      style: { 'background-color': '#ea580c', 'overlay-color': '#f97316' },
    },
    {
      /*
         The over-temperature alarm: the same dot, in danger red, with nothing
         written in it. Smaller than a rank badge because it carries no digit,
         and the only one of the three that takes events — the degrees it is
         over are a sentence on hover, not a glyph on the picture.
      */
      selector: 'node.alert-badge',
      style: {
        width: 16,
        height: 16,
        shape: 'ellipse',
        'background-color': '#dc2626',
        'border-width': 2,
        'border-color': '#ffffff',
        label: '',
        'text-background-opacity': 0,
        'overlay-color': '#ef4444',
        events: 'yes',
        'z-index': 31,
      },
    },
    {
      // Round, to match the badge: the overlay defaults to a rounded rectangle,
      // which around a 20 px circle reads as a square smudge rather than a halo.
      selector: 'node.pulse-badge',
      style: { 'overlay-shape': 'ellipse', 'overlay-padding': 3, 'overlay-opacity': 0.25 },
    },
    {
      // The pulse. Cytoscape has no keyframes, so the canvas toggles this class
      // on a timer; a halo that grows and shrinks reads at a glance where a
      // static colour on a 20px circle does not.
      //
      // 3 → 6 px. The first pass breathed 6 → 12, where the widest step was a
      // 44 px disc around a 20 px badge — big enough to reach the elements
      // either side of it. The step that used to be the SMALLEST is now the
      // largest, so the marker still moves without spreading over its
      // neighbours; the opacity carries the rest of the beat.
      selector: 'node.pulse-badge.tuned-pulse',
      style: { 'overlay-shape': 'ellipse', 'overlay-padding': 6, 'overlay-opacity': 0.5 },
    },
    ...parallelBranchStyles(),
    parallelBraceStyle(HSK_BUS_COLOR),
    {
      selector: 'edge:selected',
      style: { 'line-color': '#1d4ed8', 'target-arrow-color': '#1d4ed8', 'source-arrow-color': '#1d4ed8' },
    },
  ] as unknown as StylesheetCSS[];
}

/**
 * Put every tuned badge over the middle of the segment it marks.
 *
 * Above the line by a badge's height, so it never lands on the edge's own
 * label — that one is already `text-margin-y: -11` and centred, and two things
 * fighting for the same 20 px is how a marker becomes noise. Called from the
 * same snapshot the buses are placed in, which is after the layout has settled.
 */
function positionTunedBadges(cy: Core): void {
  cy.nodes('.tuned-badge, .alert-badge').forEach((badge) => {
    const anchorId = badge.data('anchorNodeId') as string | undefined;
    if (anchorId) {
      const node = cy.getElementById(anchorId);
      if (!node || node.length === 0) return;
      const at = node.position();
      if (!Number.isFinite(at.x)) return;
      // Outside the node's own box, so it never sits on the name inside it.
      badge.position({ x: at.x - node.width() / 2 - BADGE_GAP_PX, y: at.y });
      return;
    }
    const edge = cy.getElementById(badge.data('edgeId') as string);
    if (!edge || edge.length === 0) return;
    const from = edge.source().position();
    const to = edge.target().position();
    if (!Number.isFinite(from.x) || !Number.isFinite(to.x)) return;
    badge.position({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - BADGE_LIFT_PX });
  });
}

/**
 * Clear of the edge's own label, which sits 11 px above the line.
 *
 * 11 for the label's offset, half of its ~15 px box, half of the badge's 20,
 * and the 6 px halo an active one wears — under about 34 the halo lands on the
 * ΔT text and the two read as one smudged glyph.
 */
const BADGE_LIFT_PX = 36;

/**
 * How far left of a part its rank badge sits.
 *
 * Half the badge (10) plus its halo (6) plus a little air, measured from the
 * node's own edge — closer and the halo bleeds over the node's border.
 */
const BADGE_GAP_PX = 20;

/** How fast the halo on a cut segment breathes. */
const PULSE_MS = 620;

/** Line width from |Q|, 1.5–9 px. Thickness is magnitude only (07 §22). */
function widthForFlow(magnitude: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(magnitude)) return 2;
  return 1.5 + (Math.min(magnitude, max) / max) * 7.5;
}

/**
 * The colour ramps every element is painted against.
 *
 * Exported because an export renders its own Cytoscape instance and has to
 * build elements the same way — and it has to use the ramps of the WHOLE
 * network, not of the one component a page draws. Rescaled per page, an
 * isolated part would be painted from its own hottest node down, so every page
 * would show a red node and mean something different by it.
 */
export function resultScales(solution: ThermalSolution | null): {
  temperature: Scale;
  delta: Scale;
  rth: Scale;
  maxFlow: number;
} {
  const temperatures = Object.values(solution?.node_temperatures_C ?? {});
  const results = Object.values(solution?.edge_results ?? {});
  return {
    temperature: buildScale(temperatures),
    delta: buildScale(results.map((entry) => Math.abs(entry.delta_T_C)), DELTA_RAMP),
    rth: buildScale(results.map((entry) => entry.active_rth_C_per_W), RTH_RAMP),
    maxFlow: results.reduce((max, entry) => Math.max(max, Math.abs(entry.heat_flow_W)), 0),
  };
}

export function buildElements(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  mode: ResultMode,
  display: GraphDisplayOptions,
  scenarioId: string,
  layoutMode: string,
  scales: { temperature: Scale; delta: Scale; rth: Scale; maxFlow: number },
  hiddenComponentIds: ReadonlySet<string>,
  /**
   * Node ids to leave out beyond the hidden components — how the PDF exporter
   * draws ONE instance of a ×4 part. It joins the same set the bus and the
   * parallel-pair braces are built from, so a dropped instance takes its bus
   * junction and its brace with it instead of leaving them pointing at nothing.
   */
  extraHiddenNodeIds?: ReadonlySet<string>,
  nodeLabelOverrides?: ReadonlyMap<string, string>,
  /**
   * Segments Screen 08 is offering, by edge id: which number the reader sees
   * beside them in its list, and whether that one is actually cut right now.
   */
  tunedEdges?: ReadonlyMap<string, { rank: number; active: boolean }>,
  /**
   * Parts Screen 08 has ranked by margin, by node id, for the whole-machine
   * view: the same 1 / 2 / 3 the deck shows, put back on the picture. Without
   * it the switch to the whole machine drops the reader into 113 nodes with no
   * indication of which three the screen is about.
   */
  rankedNodes?: ReadonlyMap<string, { rank: number }>,
  /**
   * Mark every node solved past its limit with a pulsing dot. Screen 07 asks
   * for it; Screen 08 does not, because its own badges already own that side
   * of a node and two markers on one anchor is a smudge, not an alarm.
   */
  alertOverLimit?: boolean,
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const solved =
    mode === 'heat_flow' || paintsNodeTemperature(mode) || paintsEdgeDelta(mode);
  // A view filter only: the solution was computed over the whole network and
  // every KPI still reports it. Shared structure has no component behind it, so
  // the base and the fins never vanish.
  const byComponent = hiddenNodeIds(network, hiddenComponentIds);
  const hidden =
    extraHiddenNodeIds && extraHiddenNodeIds.size > 0
      ? new Set([...byComponent, ...extraHiddenNodeIds])
      : byComponent;

  /** Nodes solved past their own limit, for the alert badges below. */
  const overLimit: { node: ThermalNode; over_C: number; temperature_C: number }[] = [];

  for (const node of Object.values(network.nodes)) {
    if (node.disabled || hidden.has(node.id)) continue;

    const group = nodeGroup(node);
    const role = GROUP_COLORS[group];
    const temperature = solution?.node_temperatures_C[node.id] ?? null;
    const fixed = node.boundary_type === 'fixed_temperature' || node.boundary_role === 'placeholder';

    if (fixed && !display.showBoundary) continue;

    const lines = [nodeLabelOverrides?.get(node.id) ?? node.name];
    if (paintsNodeTemperature(mode) && temperature != null) {
      lines.push(`${temperature.toFixed(1)} °C`);
    }
    if (display.showPower && node.power_W > 0) lines.push(`${num(node.power_W, 2, 'W')}`);
    if (display.showLimits && node.limit_C != null) {
      const margin = temperature != null ? node.limit_C - temperature : null;
      lines.push(
        margin != null
          ? `limit ${node.limit_C.toFixed(0)} °C · margin ${margin.toFixed(1)}`
          : `limit ${node.limit_C.toFixed(0)} °C`,
      );
    }
    if (fixed && !paintsNodeTemperature(mode)) lines.push('Boundary');

    const label = display.showLabels ? lines.join('\n') : '';
    const box = labelBox(label || node.name);

    // Only the Temperature mode colours a node by a result (07 §21, §22).
    const fill =
      paintsNodeTemperature(mode) && temperature != null
        ? scales.temperature.colorOf(temperature)
        : role.fill;
    const text = paintsNodeTemperature(mode) && temperature != null ? '#ffffff' : role.text;

    const classes: string[] = [];
    if (fixed) classes.push('fixed');
    if (node.limit_C != null && temperature != null && temperature > node.limit_C) {
      classes.push('over-limit');
      overLimit.push({ node, over_C: temperature - node.limit_C, temperature_C: temperature });
    }

    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill,
        border: role.border,
        text,
      },
      classes: classes.join(' '),
    });
  }

  const presentNodes = new Set(elements.map((element) => element.data.id as string));

  // The bus: the dozen component-to-base edges collect onto one bar instead of
  // drawing as a dozen long diagonals with their labels rotated along them.
  const bus = solvedBusElements(network, solution, {
    layoutMode,
    showLabels: display.showLabels,
    mode,
    scenarioId,
    hidden,
  });
  elements.push(...bus.elements);
  for (const element of bus.elements) presentNodes.add(element.data.id as string);

  // Pairs the bar is not drawing. Computed here rather than after the edges,
  // because a branch of a pair has to be NAMED as well as braced: two lines
  // between the same boxes are otherwise told apart only by their numbers, and
  // "which of these is the pipe?" is the question a reader actually has.
  const pairs = parallelPairs(network, hidden, bus.routed);
  // Index within its own pair, so the two labels are pushed apart rather than
  // both landing in the gap between the same two boxes.
  const pairedEdgeIds = new Map(
    pairs.flatMap((pair) =>
      pair.edgeIds.map(
        (id, index) => [id, parallelBranchGeometry(index, pair.edgeIds.length)] as const,
      ),
    ),
  );

  for (const edge of Object.values(network.edges)) {
    if (!presentNodes.has(edge.from) || !presentNodes.has(edge.to)) continue;

    const result = solution?.edge_results[edge.id] ?? null;
    const override = edge.scenario_overrides?.[scenarioId];
    const R = result?.active_rth_C_per_W ?? override?.R_C_per_W ?? null;
    const enabled = edge.enabled && override?.enabled !== false;

    let color = EDGE_NEUTRAL;
    let width = 2;
    let label = '';

    /*
       The arrow points where the heat actually goes, in EVERY mode.

       07 §22 has always said so, and this file's header quotes it, but only
       Heat Flow implemented it: the other modes drew the arrow along the
       stored from→to whatever the solve found. An arrow is the one part of
       the picture a reader takes on trust, so it has to be right wherever it
       is drawn — and once it is, the numbers beside it no longer have to
       carry a direction of their own.
    */
    const reverse = result?.actual_direction === 'reverse';

    switch (mode) {
      case 'temperature':
        // Edges stay neutral; the optional Q label is the only result shown.
        if (display.showLabels && result) label = `${num(result.heat_flow_W, 1, 'W')}`;
        break;

      case 'heat_flow':
        if (result) {
          color = '#ea580c';
          width = widthForFlow(Math.abs(result.heat_flow_W), scales.maxFlow);
          if (display.showLabels) label = `${Math.abs(result.heat_flow_W).toFixed(1)} W`;
        }
        break;

      case COMBINED_MODE.id:
      case 'delta_t':
        if (result) {
          color = scales.delta.colorOf(Math.abs(result.delta_T_C));
          width = 3;
          if (display.showLabels) label = deltaTLabel(result.delta_T_C);
        }
        break;

      case 'rth':
        if (R != null) {
          color = scales.rth.colorOf(R);
          width = 3;
          if (display.showLabels) label = `${formatRth(R)} °C/W`;
        } else if (display.showLabels) {
          label = 'Rth N/A';
        }
        break;

      case 'rth_source': {
        const badge = RTH_SOURCE_BADGE[edge.rth.active_source];
        const boundaryDerived = result?.rth_origin === 'boundary_scenario';
        color = boundaryDerived ? '#2563eb' : (RTH_SOURCE_COLORS[badge?.short ?? 'A'] ?? EDGE_NEUTRAL);
        width = 3;
        if (display.showLabels) {
          label = R == null ? 'Unresolved' : boundaryDerived ? 'Boundary (06)' : (badge?.label ?? 'Unresolved');
        }
        break;
      }

      case 'node_type':
      default:
        break;
    }

    const branch = bus.routed.get(edge.id);
    if (branch && bus.axis) {
      // Routed through the bus: terminal → junction, and the trunk carries it
      // the rest of the way. Two branches off one terminal are fanned apart and
      // too close together for a label between them, so a parallel branch hands
      // its text to an anchor beside the bar.
      const parallel = bus.parallelEdgeIds.has(edge.id);
      if (parallel && label) {
        elements.push(
          parallelBranchLabel(
            branch,
            // Name above number, as on Screen 05: two lines converging on one
            // bar are otherwise indistinguishable, and which route the heat
            // prefers is the whole reason the pair is drawn.
            `${branchShortName(edge)}\n${label}`,
            bus.axis,
            network.layout.positions[branch.terminalId],
            null,
            display.showLabels,
          ),
        );
      }
      const terminalIsSource = edge.from === branch.terminalId;
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: terminalIsSource ? edge.from : branch.junctionId,
          target: terminalIsSource ? branch.junctionId : edge.to,
          label: parallel ? '' : label,
          color,
          width,
          srcArrow: reverse ? 'triangle' : 'none',
          tgtArrow: reverse ? 'none' : 'triangle',
          lineStyle: !enabled ? 'dotted' : R == null && solved ? 'dashed' : 'solid',
        },
        classes: 'routed-port-edge',
      });
      // Dagre never sees the routed branch, so without this the base has no
      // edge tying it to the components at all: it drops out of their ranking
      // and every chain lays itself out as though it were a graph of its own.
      // Invisible, and excluded from the picture the engineer reads.
      elements.push({
        group: 'edges',
        data: {
          id: `${branch.junctionId}_LAYOUT`,
          source: edge.from,
          target: edge.to,
          color: '#000000',
          width: 1,
          label: '',
          lineStyle: 'solid',
        },
        classes: 'layout-only',
        selectable: false,
      });
      continue;
    }

    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        // Named, because one of a pair is only identifiable by its name — here
        // they read as two bare numbers with nothing to say which was the pipe.
        // On ONE line, unlike the bar's two: the bar has a whole branch length
        // to write along, while a pair between two boxes has only the gap
        // between them, and two stacked lines each side of it collided in the
        // middle. One line each, pushed apart by the stylesheet, fits.
        label: label && pairedEdgeIds.has(edge.id) ? `${branchShortName(edge)} ${label}` : label,
        color,
        width,
        // A negative Q means the heat really flows the other way (07 §15, §22).
        srcArrow: reverse ? 'triangle' : 'none',
        tgtArrow: reverse ? 'none' : 'triangle',
        lineStyle: !enabled ? 'dotted' : R == null && solved ? 'dashed' : 'solid',
        ...pairedEdgeIds.get(edge.id),
      },
      classes: pairedEdgeIds.has(edge.id) ? 'parallel-pair-branch' : undefined,
    });
  }

  /*
     The combination, for a pair the BUS did not draw.

     A bar only forms at four branches or more, so filtering the graph down to
     one component dissolves it — and with it the note saying what that
     component's two routes were worth together. The pair is a property of the
     network, not of the bar drawn over it, and reading one part's chain is
     exactly when the combination matters most.

     Drawn as a brace: an arc over the pair carrying the value, and naming the
     two branches it came from. The free-standing note this replaces had to be
     repositioned after every layout and still read as a caption floating near
     two curves rather than as a statement about them.
  */
  if (display.showLabels) {
    for (const pair of pairs) {
      if (!presentNodes.has(pair.from) || !presentNodes.has(pair.to)) continue;
      const value = parallelNote(network, solution, pair.edgeIds, mode, scenarioId);
      if (!value) continue;
      const names = parallelPairNames(
        network,
        pair.edgeIds,
        mode === 'heat_flow' ? 'heat_flow' : paintsEdgeDelta(mode) ? 'delta_t' : 'rth',
      );
      elements.push(
        parallelBraceElement(pair, names ? `${names}\n${value}` : value, HSK_BUS_COLOR),
      );
    }
  }

  /*
     One badge per marked segment, as a view-only node.

     `layout-only`-style nodes are excluded from dagre and positioned by hand
     after it settles — see `positionTunedBadges` — so a badge never pushes the
     graph around, it only sits on it.
  */
  if (tunedEdges && tunedEdges.size > 0) {
    for (const [edgeId, mark] of tunedEdges) {
      const edge = network.edges[edgeId];
      if (!edge || !edge.enabled) continue;
      if (hidden.has(edge.from) || hidden.has(edge.to)) continue;
      elements.push({
        group: 'nodes',
        data: {
          id: `${edgeId}__TUNED_BADGE`,
          edgeId,
          label: String(mark.rank),
        },
        classes: `view-only tuned-badge${mark.active ? ' tuned-active pulse-badge' : ''}`,
        selectable: false,
        grabbable: false,
      });
    }
  }

  /*
     The same badge, anchored to a part instead of a segment.

     On the whole machine there is no chain to number, so the three the deck
     ranks are marked where they sit — to the LEFT of the node, which is the one
     side nothing else uses: the label is inside the node, the ΔT of the edge
     above it sits over the line, and the bus braces come in from the right.
     Always lit, because unlike a segment there is no "offered but not cut"
     state for a part: these three ARE the answer the screen is giving.
  */
  /*
     The over-temperature alarm.

     A node past its limit already wears a red border, which is correct and
     easy to miss on a picture of 113 boxes — the reader has to be looking at
     the node to see that it is in trouble. The dot is the same round pulse
     Screen 08 marks a cut segment with, in danger red and with nothing written
     in it: there is only one thing it can mean, and a number inside would
     invite reading it as a rank. How far over it is belongs on hover, where
     it can be a sentence instead of a glyph.
  */
  if (alertOverLimit) {
    for (const entry of overLimit) {
      elements.push({
        group: 'nodes',
        data: {
          id: `${entry.node.id}__ALERT_BADGE`,
          anchorNodeId: entry.node.id,
          label: '',
          over_C: entry.over_C,
          alertName: entry.node.name,
          alertTemperature_C: entry.temperature_C,
          alertLimit_C: entry.node.limit_C,
        },
        classes: 'view-only alert-badge pulse-badge',
        selectable: false,
        grabbable: false,
      });
    }
  }

  if (rankedNodes && rankedNodes.size > 0) {
    for (const [nodeId, mark] of rankedNodes) {
      const node = network.nodes[nodeId];
      if (!node || node.disabled || hidden.has(nodeId)) continue;
      elements.push({
        group: 'nodes',
        data: {
          id: `${nodeId}__RANK_BADGE`,
          anchorNodeId: nodeId,
          label: String(mark.rank),
        },
        classes: 'view-only tuned-badge tuned-active pulse-badge',
        selectable: false,
        grabbable: false,
      });
    }
  }

  return elements;
}

export const SolvedGraphCanvas = forwardRef<
  SolvedGraphHandle,
  {
    network: ThermalNetwork;
    solution: ThermalSolution | null;
    mode: ResultMode;
    /** Screen 08's marked segments; absent on 07, which marks nothing. */
    tunedEdges?: ReadonlyMap<string, { rank: number; active: boolean }>;
    /** Screen 08's ranked parts, marked on the whole machine. */
    rankedNodes?: ReadonlyMap<string, { rank: number }>;
    /** Mark every node solved past its limit with a pulsing red dot (07). */
    alertOverLimit?: boolean;
    display: GraphDisplayOptions;
    scenarioId: string;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    tool: SolvedCanvasTool;
    layoutMode: string;
    hiddenComponentIds: ReadonlySet<string>;
    extraHiddenNodeIds?: ReadonlySet<string>;
    focusKey?: string;
    nodeLabelOverrides?: ReadonlyMap<string, string>;
    onSelectNode: (nodeId: string | null) => void;
    onSelectEdge: (edgeId: string | null) => void;
    onZoomChange: (zoom: number) => void;
  }
>(function SolvedGraphCanvas(
  {
    network,
    solution,
    mode,
    tunedEdges,
    rankedNodes,
    alertOverLimit,
    display,
    scenarioId,
    selectedNodeId,
    selectedEdgeId,
    tool,
    layoutMode,
    hiddenComponentIds,
    extraHiddenNodeIds,
    focusKey,
    nodeLabelOverrides,
    onSelectNode,
    onSelectEdge,
    onZoomChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const fittedRef = useRef(false);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const fullPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const previousFocusRef = useRef(focusKey);
  const focusRef = useRef(focusKey);
  focusRef.current = focusKey;
  const signatureRef = useRef('');

  // Marquee zoom, in container pixels. `null` while no drag is in progress.
  const [marquee, setMarquee] = useState<ViewportBox | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);

  /** What the hovered alarm dot says, and where to say it. Container pixels. */
  const [alertTip, setAlertTip] = useState<{
    x: number;
    y: number;
    name: string;
    over_C: number;
    temperature_C: number;
    limit_C: number;
  } | null>(null);

  const handlers = useRef({ onSelectNode, onSelectEdge, onZoomChange });
  handlers.current = { onSelectNode, onSelectEdge, onZoomChange };

  const scales = useMemo(() => resultScales(solution), [solution]);

  const elements = useMemo(
    () =>
      buildElements(
        network,
        solution,
        mode,
        display,
        scenarioId,
        layoutMode,
        scales,
        hiddenComponentIds,
        extraHiddenNodeIds,
        nodeLabelOverrides,
        tunedEdges,
        rankedNodes,
        alertOverLimit,
      ),
    [network, solution, mode, display, scenarioId, layoutMode, scales, hiddenComponentIds, extraHiddenNodeIds, nodeLabelOverrides, tunedEdges, rankedNodes, alertOverLimit],
  );

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: solvedStylesheet(),
      // Low enough that `fit` can actually show the whole machine. The floor
      // used to be 0.15, which is above what 113 nodes need in a panel this
      // size: `fit` clamped there and the graph spilled out of the top and
      // bottom of its own canvas, which reads as the graph having vanished.
      minZoom: 0.04,
      maxZoom: 3,
      boxSelectionEnabled: false,
      // Cytoscape's own wheel zoom is off so the hand-rolled one below is the
      // only thing acting on a notch. Left on, the two stacked and a single
      // notch moved this canvas 7.9% against Screen 05's 3.0%.
      userZoomingEnabled: false,
    });
    cyRef.current = cy;

    /**
     * The wheel, by hand, so a notch is worth the same here as on Screens 05
     * and 06. Cytoscape's `wheelSensitivity` scales the raw delta instead, and
     * the raw delta depends on the mouse and the operating system — the same
     * flick moved this canvas noticeably further than the other two.
     */
    const container = containerRef.current;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const notches = wheelNotches(event);
      if (notches === 0) return;
      const bounds = container.getBoundingClientRect();
      cy.zoom({
        // Wheel down is a positive delta and means zoom out.
        level: cy.zoom() * WHEEL_ZOOM_STEP ** -notches,
        // The point under the cursor stays under the cursor.
        renderedPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });

    cy.on('tap', 'node', (event) => {
      handlers.current.onSelectNode(event.target.id() as string);
      handlers.current.onSelectEdge(null);
    });
    cy.on('tap', 'edge', (event) => {
      handlers.current.onSelectEdge(event.target.id() as string);
      handlers.current.onSelectNode(null);
    });
    cy.on('tap', (event) => {
      if (event.target !== cy) return;
      handlers.current.onSelectNode(null);
      handlers.current.onSelectEdge(null);
    });

    /*
       The alarm dot says how far over on hover.

       Rendered position rather than model position, so the bubble tracks the
       dot through a pan and a zoom instead of drifting off it. Pan, zoom and
       a re-layout all dismiss it: at that point the cursor is no longer over
       the thing the bubble is about.
    */
    cy.on('mouseover', 'node.alert-badge', (event) => {
      const badge = event.target;
      const at = badge.renderedPosition();
      setAlertTip({
        x: at.x,
        y: at.y,
        name: String(badge.data('alertName') ?? ''),
        over_C: Number(badge.data('over_C') ?? 0),
        temperature_C: Number(badge.data('alertTemperature_C') ?? 0),
        limit_C: Number(badge.data('alertLimit_C') ?? 0),
      });
    });
    cy.on('mouseout', 'node.alert-badge', () => setAlertTip(null));
    cy.on('pan zoom', () => setAlertTip(null));

    // The toolbar shows the zoom level, so every route that changes it — the
    // wheel included — has to report, not just the buttons.
    cy.on('zoom', () => handlers.current.onZoomChange(cy.zoom()));

    /**
     * Cytoscape observes this container itself, on a 100 ms debounce, and every
     * `resize` re-sizes its canvas layers. So this observer must not fire on a
     * resize that changed nothing: two resize paths chasing each other across a
     * one-pixel rounding difference is how a canvas ends up blank between
     * frames. Only a real change in size does any work.
     */
    let lastSize = '';
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      if (size === lastSize) return;
      lastSize = size;
      cy.resize();
      if ((!fittedRef.current || focusRef.current) && cy.nodes().length > 0) {
        cy.fit(undefined, 40);
        fittedRef.current = true;
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      container.removeEventListener('wheel', onWheel);
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const pan = { ...cy.pan() };
    const zoom = cy.zoom();
    const hadElements = cy.elements().length > 0;

    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });

    const signature = elements
      .map((element) => element.data.id)
      .sort()
      .join('|');
    const structureChanged = signature !== signatureRef.current;
    signatureRef.current = signature;

    // The bus is drawn FROM the domain positions, so it is never laid out and
    // never counted as missing one — it is placed by `positionViewBuses` once
    // the nodes it spans have settled.
    if (previousFocusRef.current !== focusKey) {
      if (!previousFocusRef.current) fullPositionsRef.current = { ...positionsRef.current };
      positionsRef.current = focusKey ? {} : { ...fullPositionsRef.current };
      previousFocusRef.current = focusKey;
    }
    const missing: string[] = [];
    cy.nodes().forEach((node) => {
      if (node.hasClass('view-only')) return;
      const known = positionsRef.current[node.id() as string];
      if (known) node.position({ ...known });
      else missing.push(node.id() as string);
    });

    const snapshot = () => {
      positionsRef.current = {};
      cy.nodes().forEach((node) => {
        if (node.hasClass('view-only')) return;
        const position = node.position();
        positionsRef.current[node.id() as string] = { x: position.x, y: position.y };
      });
      positionViewBuses(cy);
      positionTunedBadges(cy);
    };

    const refit = () => {
      cy.resize();
      const box = cy.container()?.getBoundingClientRect();
      const sized = Boolean(box && box.width > 0 && box.height > 0);
      if (sized) cy.fit(undefined, 40);
      fittedRef.current = sized && cy.nodes().length > 0;
    };

    if (missing.length > 0 && cy.nodes().length > 0) {
      // Layout applies positions asynchronously; reading them before
      // `layoutstop` yields zeros and stacks the whole graph on one point.
      const layout = layoutSubject(cy).layout(
        layoutOptions(layoutMode, edgeLabelsOf(cy)) as unknown as cytoscape.LayoutOptions,
      );
      layout.one('layoutstop', () => {
        snapshot();
        refit();
      });
      layout.run();
      return;
    }

    snapshot();
    if (hadElements && !structureChanged) cy.viewport({ zoom, pan });
    else refit();
  }, [elements, layoutMode, focusKey]);

  /**
   * The halo on a cut segment breathes.
   *
   * Cytoscape has no keyframes, so the class is toggled on a timer. It runs only
   * while something IS cut — an interval that ticks over an empty selector on
   * every screen that mounts this canvas would be a cost paid for nothing — and
   * a reader who has asked not to see motion gets the static halo the stylesheet
   * already gives `.tuned-active`.
   */
  const tunedActive = useMemo(
    () => elements.some((element) => String(element.classes ?? '').includes('pulse-badge')),
    [elements],
  );

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !tunedActive) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let on = false;
    const timer = window.setInterval(() => {
      on = !on;
      cy.nodes('.pulse-badge').toggleClass('tuned-pulse', on);
    }, PULSE_MS);
    return () => {
      window.clearInterval(timer);
      cyRef.current?.nodes('.pulse-badge').removeClass('tuned-pulse');
    };
  }, [tunedActive, elements]);

  // --- selection + focus ---------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().unselect();
    cy.elements().removeClass('dimmed');

    const selected = selectedNodeId
      ? cy.getElementById(selectedNodeId)
      : selectedEdgeId
        ? cy.getElementById(selectedEdgeId)
        : null;

    if (!selected || selected.length === 0) return;
    selected.select();

  }, [selectedNodeId, selectedEdgeId, elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // While a region is being drawn the overlay owns the pointer, so panning
    // would fight it. Leaving the tool also drops any half-drawn rectangle.
    cy.userPanningEnabled(tool !== 'zoom-box');
    if (tool !== 'zoom-box') {
      marqueeStart.current = null;
      setMarquee(null);
    }
  }, [tool]);

  /** Zoom the viewport onto a region the engineer drew, in container pixels. */
  const zoomToRegion = (box: ViewportBox) => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = zoomRegionViewport({
      box,
      current: { zoom: cy.zoom(), pan: cy.pan() },
      viewWidth: cy.width(),
      viewHeight: cy.height(),
      minZoom: cy.minZoom(),
      maxZoom: cy.maxZoom(),
    });
    if (!next) return;
    cy.viewport(next);
    handlers.current.onZoomChange(cy.zoom());
  };

  useImperativeHandle(
    ref,
    (): SolvedGraphHandle => ({
      // `resize` first: a caller fitting right after the container changed size
      // — the fullscreen toggle — would otherwise fit to the old dimensions,
      // because Cytoscape caches them until it is told to re-measure.
      fit: () => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.resize();
        cy.fit(undefined, 40);
        handlers.current.onZoomChange(cy.zoom());
      },
      exportJpg: () => {
        const cy = cyRef.current;
        if (!cy || cy.nodes().length === 0) return null;
        return cy.jpg({
          output: 'base64uri',
          full: true,
          scale: 1,
          quality: 0.92,
          bg: '#ffffff',
          maxWidth: 16384,
          maxHeight: 16384,
        });
      },
      zoomBy: (delta) => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.zoom({ level: cy.zoom() + delta, renderedPosition: { x: 0, y: 0 } });
        cy.center();
      },
      relayout: (mode) => {
        const cy = cyRef.current;
        if (!cy || cy.nodes().length === 0) return;
        // The same options Screen 05 uses, so a mode means the same thing on
        // both — including the rank separation widening to fit the longest
        // edge label, which is what keeps a label off the boxes either side.
        const labels = edgeLabelsOf(cy);
        const layout = layoutSubject(cy).layout(
          layoutOptions(mode, labels) as unknown as cytoscape.LayoutOptions,
        );
        layout.one('layoutstop', () => {
          positionsRef.current = {};
          cy.nodes().forEach((node) => {
            if (node.hasClass('view-only')) return;
            const position = node.position();
            positionsRef.current[node.id() as string] = { x: position.x, y: position.y };
          });
          positionViewBuses(cy, true);
          positionTunedBadges(cy);
          cy.fit(undefined, 40);
        });
        layout.run();
      },
      center: (elementId) => {
        const cy = cyRef.current;
        const element = cy?.getElementById(elementId);
        if (cy && element && element.length > 0) {
          cy.animate({ center: { eles: element }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 200 });
        }
      },
    }),
    [],
  );

  const rect = marqueeRect(marquee);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" data-testid="solved-graph-canvas" />
      {alertTip && (
        <div
          data-testid="solved-over-limit-tip"
          role="status"
          className="pointer-events-none absolute z-30 w-max max-w-[19rem] -translate-x-1/2 -translate-y-full rounded-md bg-danger-600 px-2 py-1.5 text-[11px] leading-tight font-semibold text-white shadow-lg"
          style={{ left: alertTip.x, top: alertTip.y - 14 }}
        >
          <span className="block">
            Over limit by {alertTip.over_C.toFixed(1)} °C
            <span className="ml-1 font-normal">／超出上限 {alertTip.over_C.toFixed(1)} °C</span>
          </span>
          <span className="mt-0.5 block font-normal text-white/85">
            {alertTip.temperature_C.toFixed(1)} °C vs {alertTip.limit_C.toFixed(0)} °C ·{' '}
            {alertTip.name}
          </span>
        </div>
      )}
      {tool === 'zoom-box' && (
        <div
          data-testid="solved-zoom-marquee-layer"
          className="absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
            marqueeStart.current = point;
            setMarquee({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = marqueeStart.current;
            if (!start) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setMarquee({
              x1: start.x,
              y1: start.y,
              x2: event.clientX - bounds.left,
              y2: event.clientY - bounds.top,
            });
          }}
          onPointerUp={(event) => {
            const start = marqueeStart.current;
            marqueeStart.current = null;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (start) {
              zoomToRegion({
                x1: start.x,
                y1: start.y,
                x2: event.clientX - bounds.left,
                y2: event.clientY - bounds.top,
              });
            }
            setMarquee(null);
          }}
          onPointerCancel={() => {
            marqueeStart.current = null;
            setMarquee(null);
          }}
        >
          {rect && (
            <div
              aria-hidden
              className="absolute border-2 border-accent-600 bg-accent-500/15"
              style={rect}
            />
          )}
        </div>
      )}
    </div>
  );
});

/** Legend rows for the active mode — 07 §21, §22 both require one. */
export function legendFor(
  mode: ResultMode,
  solution: ThermalSolution | null,
): Array<{ color: string; label: string; zh: string }> {
  const results = Object.values(solution?.edge_results ?? {});

  switch (mode) {
    case 'temperature': {
      const scale = buildScale(Object.values(solution?.node_temperatures_C ?? {}));
      if (scale.max === scale.min) {
        return [{ color: scale.colorOf(scale.min), label: `${scale.min.toFixed(1)} °C`, zh: '節點溫度' }];
      }
      return scale.stops.map((stop) => ({
        color: stop.color,
        label: `${stop.from.toFixed(0)} – ${stop.to.toFixed(0)} °C`,
        zh: '節點溫度',
      }));
    }

    case 'heat_flow': {
      const max = results.reduce((value, entry) => Math.max(value, Math.abs(entry.heat_flow_W)), 0);
      return [
        { color: '#ea580c', label: `Thickest = ${max.toFixed(1)} W`, zh: '線寬代表熱流大小' },
        { color: '#ea580c', label: 'Arrow = solved direction', zh: '箭頭為實際求解方向' },
        { color: EDGE_NEUTRAL, label: 'Reverse flow flips the arrow', zh: '負值代表逆向流動' },
      ];
    }

    case COMBINED_MODE.id:
    case 'delta_t': {
      const scale = buildScale(results.map((entry) => Math.abs(entry.delta_T_C)), DELTA_RAMP);
      const nodes =
        mode === COMBINED_MODE.id
          ? (() => {
              // The combined view colours BOTH, so the legend has to name both
              // or the reader reads the edge ramp as the node one.
              const temps = buildScale(Object.values(solution?.node_temperatures_C ?? {}));
              return temps.max === temps.min
                ? [{ color: temps.colorOf(temps.min), label: `Node ${temps.min.toFixed(1)} °C`, zh: '節點溫度' }]
                : temps.stops.map((stop) => ({
                    color: stop.color,
                    label: `Node ${stop.from.toFixed(0)} – ${stop.to.toFixed(0)} °C`,
                    zh: '節點溫度',
                  }));
            })()
          : [];
      return [
        ...nodes,
        ...scale.stops.map((stop) => ({
          color: stop.color,
          label: `${stop.from.toFixed(1)} – ${stop.to.toFixed(1)} °C`,
          zh: '連線溫差（沿箭頭方向的溫度落差）',
        })),
        // The number is unsigned, so the arrow is what says which end is hot.
        { color: EDGE_NEUTRAL, label: 'Arrow = hotter end first', zh: '箭頭為實際熱流方向' },
      ];
    }

    case 'rth': {
      const scale = buildScale(results.map((entry) => entry.active_rth_C_per_W), RTH_RAMP);
      return scale.stops.map((stop) => ({
        color: stop.color,
        label: `${formatRth(stop.from)} – ${formatRth(stop.to)} °C/W`,
        zh: '作用中熱阻',
      }));
    }

    case 'rth_source':
      return [
        { color: RTH_SOURCE_COLORS.A, label: 'A · Analytical', zh: '解析計算' },
        { color: RTH_SOURCE_COLORS.U, label: 'U · Manual', zh: '手動輸入' },
        { color: RTH_SOURCE_COLORS.M, label: 'M · Measurement', zh: '量測' },
        { color: RTH_SOURCE_COLORS.F, label: 'F · FloTHERM (reserved)', zh: 'FloTHERM（03 尚未實作）' },
        { color: '#2563eb', label: 'Boundary derived (06)', zh: '由 06 邊界條件推導' },
      ];

    case 'node_type':
    default:
      return [
        { color: GROUP_COLORS.source.border, label: 'Heat Source', zh: '熱源' },
        { color: GROUP_COLORS.spreader.border, label: 'Case / Spreader', zh: '外殼 / 擴散' },
        { color: GROUP_COLORS.interface.border, label: 'Interface', zh: '介面' },
        { color: GROUP_COLORS.zone.border, label: 'Base / Structure', zh: '基座 / 結構' },
        { color: GROUP_COLORS.heatsink.border, label: 'Heat Sink', zh: '散熱器' },
        { color: GROUP_COLORS.boundary.border, label: 'Boundary', zh: '邊界' },
      ];
  }
}
