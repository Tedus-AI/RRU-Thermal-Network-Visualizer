/**
 * The HSK bus, drawn over the SOLVED graph.
 *
 * Screen 05 collects the dozen component-to-base edges onto one bar rather than
 * letting them draw as a dozen long diagonals converging on a single node, with
 * their labels rotated along them and landing on the boxes. Screen 07 has the
 * same fan-in and more to write on it — a temperature, a power, a heat flow —
 * so it needed the same bar more, not less.
 *
 * The grouping, the branch fan and the geometry all come from Screen 05's
 * module, so the bar sits in the same place on both screens and there is one
 * definition of what a bus is. What differs is only what gets written on it,
 * which is this file's business: Screen 05 reads out a resistance, and here the
 * label follows the result mode the reader has chosen.
 */

import type { ElementDefinition } from 'cytoscape';

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { HSK_BUS_COLOR, labelBox } from '@/ui/graphStyles';
import { temperatureDrop } from './resultViewModel';
import {
  busAxis,
  hskBusGroups,
  storedBusGeometry,
  type HskBusBranch,
} from '@/screens/05-thermal-path-builder/thermalGraphElements';

/** Padding around a parallel-branch label, matching Screen 05's. */
const PARALLEL_LABEL_FLOW_PADDING_PX = 56;

export interface SolvedBusView {
  elements: ElementDefinition[];
  /** Edges the bus owns, by edge id — they route through a junction. */
  routed: Map<string, HskBusBranch>;
  /** Edges sharing a terminal with another, so their branch needs naming. */
  parallelEdgeIds: ReadonlySet<string>;
  axis: 'vertical' | 'horizontal' | null;
}

const EMPTY: SolvedBusView = {
  elements: [],
  routed: new Map(),
  parallelEdgeIds: new Set(),
  axis: null,
};

/**
 * The resistance this screen is SHOWING for one edge.
 *
 * Exactly what the branch label beside it shows, and nothing else — the solved
 * value, or a scenario override, or nothing.
 *
 * Not `activeRth`, the edge's own stored number. Screen 05 must build every
 * spreading edge at Bi → ∞ because the far-face h is scenario data, and Screen
 * 07 re-solves it against the scenario's real boundary, so the two differ —
 * sometimes fivefold. Reading the stored one put the FLOOR into the combination
 * while the branches showed the solved value: 0.322 ∥ 0.065 printed as 0.030,
 * which is 0.057 ∥ 0.065.
 *
 * And falling back to it when nothing is solved has the same fault in a quieter
 * form: the branches read "Rth N/A" while the note underneath them confidently
 * reads 0.042. A combination the reader cannot check against the two numbers
 * beside it is worse than no combination.
 */
function shownRth(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  edgeId: string,
  scenarioId: string,
): number | null {
  const solved = solution?.edge_results?.[edgeId]?.active_rth_C_per_W;
  if (solved != null && Number.isFinite(solved) && solved > 0) return solved;
  const override = scenarioId
    ? network.edges[edgeId]?.scenario_overrides?.[scenarioId]?.R_C_per_W
    : undefined;
  return override != null && Number.isFinite(override) && override > 0 ? override : null;
}

/** Conductances add: the pair is worth less than either branch, never more. */
export function solvedParallelRth(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  edgeIds: readonly string[],
  scenarioId: string,
): number | null {
  let conductance = 0;
  for (const id of edgeIds) {
    const R = shownRth(network, solution, id, scenarioId);
    if (R == null) return null;
    conductance += 1 / R;
  }
  return conductance > 0 ? 1 / conductance : null;
}

/**
 * What the note where the branches rejoin should say, IN THIS MODE.
 *
 * It used to print a resistance whatever the toolbar was showing, so a reader
 * in Temperature mode — with every other number on the graph in °C — met one
 * stray °C/W. A combination is only meaningful for the quantity being drawn:
 * resistances combine in parallel, flows add, and the two branches of a pair
 * share one ΔT by definition (they span the same node pair), which is worth
 * saying rather than leaving to be inferred. Temperature, Node Type and Rth
 * Source have no combinable quantity at all, so they get no note.
 */
export function parallelNote(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  edgeIds: readonly string[],
  mode: string,
  scenarioId: string,
): string {
  if (mode === 'heat_flow') {
    let total = 0;
    for (const id of edgeIds) {
      const result = solution?.edge_results?.[id];
      if (!result || !Number.isFinite(result.heat_flow_W)) return '∥ —';
      total += Math.abs(result.heat_flow_W);
    }
    return `∑ ${total.toFixed(1)} W`;
  }

  if (mode === 'delta_t') {
    // Same two nodes, so one ΔT — printing it once is the point.
    const first = edgeIds[0] ? solution?.edge_results?.[edgeIds[0]] : undefined;
    if (!first || !Number.isFinite(first.delta_T_C)) return '';
    return `shared ${temperatureDrop(first.delta_T_C)}`;
  }

  if (mode !== 'rth') return '';

  const combined = solvedParallelRth(network, solution, edgeIds, scenarioId);
  return `∥ ${combined != null ? `${combined.toFixed(3)} °C/W` : '—'}`;
}

export function solvedBusElements(
  network: ThermalNetwork,
  solution: ThermalSolution | null,
  options: {
    layoutMode: string;
    showLabels: boolean;
    mode: string;
    /** The active scenario, so a per-scenario resistance override is honoured. */
    scenarioId: string;
    /** Node ids the reader has filtered out; their branches leave the bar. */
    hidden?: ReadonlySet<string>;
  },
): SolvedBusView {
  const axis = busAxis(options.layoutMode);
  if (axis == null) return EMPTY;

  const groups = hskBusGroups(network, options.layoutMode, options.hidden ?? new Set<string>());
  if (groups.length === 0) return EMPTY;

  const elements: ElementDefinition[] = [];
  const routed = new Map<string, HskBusBranch>();
  const parallelEdgeIds = new Set<string>();

  for (const group of groups) {
    const geometry = storedBusGeometry(network, group, axis);

    elements.push({
      group: 'nodes',
      data: {
        id: group.id,
        sharedId: group.sharedId,
        outletId: group.outletId,
        // The canvas re-reads this to reposition the bus after a layout runs.
        axis,
        w: geometry.w,
        h: geometry.h,
        fill: HSK_BUS_COLOR,
        border: HSK_BUS_COLOR,
        text: HSK_BUS_COLOR,
        label: '',
      },
      classes: 'view-only hsk-bus',
      position: geometry.position,
      selectable: false,
      grabbable: false,
    });

    for (const branch of group.branches) {
      routed.set(branch.edgeId, branch);
      const source = network.layout.positions[branch.terminalId];
      elements.push({
        group: 'nodes',
        data: {
          id: branch.junctionId,
          busId: group.id,
          sourceId: branch.terminalId,
          edgeId: branch.edgeId,
          crossOffset: branch.crossOffset,
          w: 6,
          h: 6,
          fill: HSK_BUS_COLOR,
          border: HSK_BUS_COLOR,
          text: HSK_BUS_COLOR,
          label: '',
        },
        classes: 'view-only hsk-bus-junction hsk-bus-branch-junction',
        // A junction sits on the bar, level with its own terminal — the bar's
        // coordinate on the flow axis, the terminal's on the cross axis.
        position:
          geometry.along != null && source
            ? axis === 'vertical'
              ? { x: geometry.along, y: source.y + branch.crossOffset }
              : { x: source.x + branch.crossOffset, y: geometry.along }
            : undefined,
        selectable: false,
        grabbable: false,
      });
    }

    for (const set of group.parallelSets) {
      for (const id of set.edgeIds) parallelEdgeIds.add(id);
      const source = network.layout.positions[set.terminalId];
      elements.push({
        group: 'nodes',
        data: {
          id: set.noteId,
          busId: group.id,
          sourceId: set.terminalId,
          w: 1,
          h: 1,
          fill: HSK_BUS_COLOR,
          border: HSK_BUS_COLOR,
          text: HSK_BUS_COLOR,
          label: options.showLabels
            ? parallelNote(network, solution, set.edgeIds, options.mode, options.scenarioId)
            : '',
        },
        classes: 'view-only hsk-bus-parallel-note',
        position:
          geometry.along != null && source
            ? axis === 'vertical'
              ? { x: geometry.along, y: source.y }
              : { x: source.x, y: geometry.along }
            : undefined,
        selectable: false,
        grabbable: false,
      });
    }

    elements.push({
      group: 'nodes',
      data: {
        id: group.outletId,
        busId: group.id,
        sharedId: group.sharedId,
        w: 6,
        h: 6,
        fill: HSK_BUS_COLOR,
        border: HSK_BUS_COLOR,
        text: HSK_BUS_COLOR,
        label: '',
      },
      classes: 'view-only hsk-bus-junction hsk-bus-outlet',
      position: geometry.outletPosition,
      selectable: false,
      grabbable: false,
    });

    elements.push({
      group: 'edges',
      data: {
        id: `${group.id}_TRUNK`,
        source: group.outletId,
        target: group.sharedId,
        color: HSK_BUS_COLOR,
        width: 3,
        lineStyle: 'solid',
        label: '',
      },
      classes: 'view-only hsk-bus-trunk',
      selectable: false,
    });
  }

  return { elements, routed, parallelEdgeIds, axis };
}

/**
 * The off-bar anchor that carries a parallel branch's own label.
 *
 * Two branches from one terminal are fanned apart by a few dozen pixels, which
 * is not enough room for a label between them, so each label is rendered by a
 * zero-size anchor whose text is pushed out to the side of the bar.
 */
export function parallelBranchLabel(
  branch: HskBusBranch,
  label: string,
  axis: 'vertical' | 'horizontal',
  position: { x: number; y: number } | undefined,
  along: number | null,
  showLabels: boolean,
): ElementDefinition {
  const flowAxis = axis === 'horizontal' ? 'vertical' : 'horizontal';
  const box = labelBox(label);
  return {
    group: 'nodes',
    data: {
      id: `${branch.junctionId}_LABEL`,
      busId: branch.busId,
      sourceId: branch.terminalId,
      crossOffset: branch.crossOffset,
      w: 1,
      h: 1,
      fill: '#ffffff',
      border: '#ffffff',
      text: '#475569',
      label,
      // Auto Layout reads this and lengthens only the final terminal-to-bus
      // segment when the label would otherwise not fit.
      requiredFlowRoom: showLabels
        ? (flowAxis === 'horizontal' ? box.w : box.h) + PARALLEL_LABEL_FLOW_PADDING_PX
        : 0,
    },
    classes: `view-only hsk-bus-parallel-label flow-${flowAxis} label-${
      branch.crossOffset < 0 ? 'negative' : 'positive'
    }`,
    position:
      position && along != null
        ? axis === 'vertical'
          ? { x: along, y: position.y + branch.crossOffset }
          : { x: position.x + branch.crossOffset, y: along }
        : undefined,
    selectable: false,
    grabbable: false,
  };
}
