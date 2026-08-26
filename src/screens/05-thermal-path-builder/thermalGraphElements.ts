/** View-only Cytoscape projection for Screen 05. */

import type { ElementDefinition } from 'cytoscape';

import { activeRth } from '@/thermal/rth';
import type { ThermalNetwork } from '@/thermal/types';
import {
  GROUP_COLORS,
  HSK_BUS_COLOR,
  edgeColor,
  edgeLineStyle,
  labelBox,
  nodeGroup,
} from '@/ui/graphStyles';

const EDGE_SHORT: Record<string, string> = {
  package_rjc: 'Rjc',
  package_rjb: 'Rjb',
  package_rja: 'Rja',
  conduction: 'Cond',
  tim: 'TIM',
  solder: 'Solder',
  thermal_via: 'Via',
  contact: 'Contact',
  spreading: 'Spreading',
  heat_pipe: 'Heat Pipe',
  convection: 'Conv',
  radiation: 'Rad',
  custom: 'Custom',
};

const HSK_BUS_MIN_BRANCHES = 4;
const HSK_BUS_PREFIX = 'VIEW_HSK_BUS_';

/**
 * How far apart two branches leaving the SAME terminal are fanned on the bus.
 *
 * A parallel mount puts two edges between one node pair — an embedded heat pipe
 * is exactly that, the pipe and the aluminium around it — and each is routed to
 * a junction placed level with its own terminal. Level with the same terminal
 * meant the same point: two coincident junctions, two straight lines drawn on
 * top of each other, and two labels in the same place. The second route was
 * invisible, which read as the tool having failed to build it.
 *
 * Wide enough that the two Rth labels clear each other and not just the two
 * lines: they are 9px type riding 9px off their own edge, so a fan that only
 * separates the connectors leaves the numbers overprinted. Still well short of
 * the gap between neighbouring terminals, so a fan never reaches the branch
 * above or below it.
 */
const HSK_BUS_BRANCH_FAN_PX = 36;

interface HskBusBranch {
  edgeId: string;
  terminalId: string;
  sharedId: string;
  junctionId: string;
  /**
   * Offset along the bus from the terminal's own level, so siblings from one
   * terminal land on distinct points. Zero for a terminal with a single branch,
   * which is every mount that is not a parallel one.
   */
  crossOffset: number;
}

/**
 * Two or more branches leaving one terminal for one structure — a parallel
 * pair, and the whole point of the mount axis's pipe mounts.
 *
 * It gets its own annotation because the two numbers on the two branches do not
 * add up to anything a reader can see. `0.130` beside `0.050` is not `0.180`,
 * and the combination is what the rest of the chain actually feels.
 */
interface HskBusParallelSet {
  terminalId: string;
  noteId: string;
  edgeIds: string[];
}

interface HskBusGroup {
  id: string;
  sharedId: string;
  outletId: string;
  branches: HskBusBranch[];
  parallelSets: HskBusParallelSet[];
}

/**
 * Which way the bus runs, or null when this layout gets no bus at all.
 *
 * The bus is a bar drawn ACROSS the flow, so its orientation is the opposite of
 * the layout's rank direction: a left-to-right graph collects its branches on a
 * vertical bar, a top-to-bottom graph on a horizontal one. Top → Bottom used to
 * be excluded outright, which is why a fan-in of a dozen components drew as a
 * dozen long diagonals converging on one node, with the Rth labels rotated
 * along them and landing on top of the boxes.
 *
 * `Free` is a force layout with no rank direction to run across, so it keeps
 * the plain renderer.
 */
export function busAxis(layoutMode: string): 'vertical' | 'horizontal' | null {
  if (layoutMode === 'Auto' || layoutMode === 'LeftRight') return 'vertical';
  if (layoutMode === 'TopBottom') return 'horizontal';
  return null;
}

/**
 * Which nodes belong to a component the engineer has switched off in the
 * palette.
 *
 * This is a VIEW filter and nothing more — the network, the solver input and
 * every KPI are untouched. It exists because a fully wired RRU draws fifty
 * nodes converging on one bus, and reading one part's chain means being able to
 * put the other nine away for a moment.
 *
 * Both `component_ref` and `origin.component_id` are checked: template nodes
 * carry the first, and anything generated on a component's behalf carries the
 * second. Shared structure has neither, so the base and the fins never vanish.
 */
export function hiddenNodeIds(
  network: ThermalNetwork,
  hiddenComponentIds: ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  if (!hiddenComponentIds || hiddenComponentIds.size === 0) return new Set<string>();
  const hidden = new Set<string>();
  for (const node of Object.values(network.nodes)) {
    const ref = node.component_ref ?? node.origin?.component_id;
    if (ref != null && hiddenComponentIds.has(ref)) hidden.add(node.id);
  }
  return hidden;
}

function hskBusGroups(
  network: ThermalNetwork,
  layoutMode: string,
  hidden: ReadonlySet<string>,
): HskBusGroup[] {
  if (busAxis(layoutMode) == null) return [];

  const grouped = new Map<string, Array<Omit<HskBusBranch, 'junctionId' | 'crossOffset'>>>();
  for (const edge of Object.values(network.edges)) {
    if (!edge.id.startsWith('EDGE_PORT_')) continue;
    if (hidden.has(edge.from) || hidden.has(edge.to)) continue;
    const from = network.nodes[edge.from];
    const to = network.nodes[edge.to];
    if (!from || !to) continue;

    const fromIsHsk = from.type === 'heat_sink_base';
    const toIsHsk = to.type === 'heat_sink_base';
    // Exactly one end is the shared base; the other is whatever delivers to it.
    //
    // That used to be narrowed further to "a node with ports", which meant a
    // component's HEAT_OUT and nothing else. Once a mount could stand between
    // the two, the node arriving at the base became a boss root or a heat-pipe
    // condenser — neither of which has ports — so those edges fell out of the
    // bus and drew as long diagonals across the whole graph to the base, which
    // is the crossing mess the bus exists to remove.
    if (fromIsHsk === toIsHsk) continue;
    const terminalId = fromIsHsk ? to.id : from.id;
    const sharedId = fromIsHsk ? from.id : to.id;

    const list = grouped.get(sharedId) ?? [];
    list.push({ edgeId: edge.id, terminalId, sharedId });
    grouped.set(sharedId, list);
  }

  return [...grouped.entries()]
    .filter(([, branches]) => branches.length >= HSK_BUS_MIN_BRANCHES)
    .map(([sharedId, branches]) => {
      const id = `${HSK_BUS_PREFIX}${sharedId}`;
      // Siblings first, so a terminal with two routes can be fanned apart.
      // Ordering by edge id keeps the fan stable across re-renders; it must not
      // depend on iteration order, or the two lines would swap places whenever
      // an unrelated edge was added.
      const siblings = new Map<string, string[]>();
      for (const branch of branches) {
        const list = siblings.get(branch.terminalId) ?? [];
        list.push(branch.edgeId);
        siblings.set(branch.terminalId, list);
      }
      for (const list of siblings.values()) list.sort();

      return {
        id,
        sharedId,
        outletId: `${id}_OUTLET`,
        branches: branches.map((branch) => {
          const list = siblings.get(branch.terminalId) ?? [branch.edgeId];
          const index = list.indexOf(branch.edgeId);
          return {
            ...branch,
            junctionId: `${id}_JUNCTION_${branch.edgeId}`,
            crossOffset: (index - (list.length - 1) / 2) * HSK_BUS_BRANCH_FAN_PX,
          };
        }),
        parallelSets: [...siblings.entries()]
          .filter(([, edgeIds]) => edgeIds.length > 1)
          .map(([terminalId, edgeIds]) => ({
            terminalId,
            noteId: `${id}_PARALLEL_${terminalId}`,
            edgeIds,
          })),
      };
    });
}

/**
 * Resistance of a set of edges hung between the same two nodes, °C/W.
 *
 * Conductances add — that is the whole reason a heat pipe helps — so this is
 * `1 / Σ(1/R)`. Null when ANY of them is unresolved: a total computed from the
 * branches that happen to have numbers would be lower than the truth and would
 * read as if the missing branch carried nothing (05 §61).
 */
export function parallelRth(network: ThermalNetwork, edgeIds: readonly string[]): number | null {
  let conductance = 0;
  for (const id of edgeIds) {
    const edge = network.edges[id];
    if (!edge || !edge.enabled) return null;
    const R = activeRth(edge.rth);
    if (R == null || !Number.isFinite(R) || R <= 0) return null;
    conductance += 1 / R;
  }
  return conductance > 0 ? 1 / conductance : null;
}

export interface BusGeometry {
  /** Centre of the bus bar, or undefined when positions are not known yet. */
  position?: { x: number; y: number };
  outletPosition?: { x: number; y: number };
  /** Bar size. The thin dimension is 2px; the long one spans the branches. */
  w: number;
  h: number;
  /** Coordinate of the bar on the flow axis, for placing the junctions. */
  along: number | null;
}

/**
 * The bar sits between the branch terminals and the shared node, 72% of the way
 * across the gap, and spans far enough to reach every branch.
 *
 * Written once against an axis rather than twice per orientation: this same
 * geometry is recomputed from live Cytoscape positions after a layout runs, and
 * the two answers have to agree or the bus jumps on the first re-render.
 */
export function busGeometry(
  axis: 'vertical' | 'horizontal',
  target: { x: number; y: number } | undefined,
  sources: Array<{ x: number; y: number }>,
  branchCount: number,
  /** Front edge of the source cluster and of the target, when known. */
  fronts?: { sourceFront: number; targetFront: number },
): BusGeometry {
  const fallbackSpan = Math.max(80, branchCount * 54);
  // `flow` is the axis heat travels along; `cross` is the one the bar spans.
  const flow = axis === 'vertical' ? 'x' : 'y';
  const cross = axis === 'vertical' ? 'y' : 'x';
  const sized = (span: number) =>
    axis === 'vertical' ? { w: 2, h: span } : { w: span, h: 2 };

  if (!target || sources.length === 0) {
    return { ...sized(fallbackSpan), along: null };
  }

  const flows = sources.map((position) => position[flow]);
  const mean = flows.reduce((sum, value) => sum + value, 0) / flows.length;
  const targetAfter = target[flow] >= mean;
  const sourceFront =
    fronts?.sourceFront ?? (targetAfter ? Math.max(...flows) : Math.min(...flows));
  const targetFront = fronts?.targetFront ?? target[flow];
  const along = sourceFront + (targetFront - sourceFront) * 0.72;

  const crosses = [...sources.map((position) => position[cross]), target[cross]];
  const min = Math.min(...crosses);
  const max = Math.max(...crosses);
  const centre = (min + max) / 2;

  return {
    ...sized(Math.max(2, max - min)),
    along,
    position: axis === 'vertical' ? { x: along, y: centre } : { x: centre, y: along },
    outletPosition:
      axis === 'vertical' ? { x: along, y: target.y } : { x: target.x, y: along },
  };
}

function storedBusGeometry(
  network: ThermalNetwork,
  group: HskBusGroup,
  axis: 'vertical' | 'horizontal',
): BusGeometry {
  const sources = group.branches
    .map((branch) => network.layout.positions[branch.terminalId])
    .filter((position): position is { x: number; y: number } => Boolean(position));
  return busGeometry(
    axis,
    network.layout.positions[group.sharedId],
    sources,
    group.branches.length,
  );
}

export function buildElements(
  network: ThermalNetwork,
  options: {
    showPorts: boolean;
    showLabels: boolean;
    layoutMode: string;
    /** Components switched off in the palette. A view filter only. */
    hiddenComponentIds?: ReadonlySet<string>;
  },
): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const axis = busAxis(options.layoutMode);
  const hidden = hiddenNodeIds(network, options.hiddenComponentIds);
  const busGroups = hskBusGroups(network, options.layoutMode, hidden);
  const routedBranches = new Map(
    busGroups.flatMap((group) => group.branches.map((branch) => [branch.edgeId, branch] as const)),
  );
  // Edges that share their terminal with another. A lone branch to the base
  // needs no name — there is nothing to tell it apart from — but one of a
  // parallel pair does, and that is exactly when "which of these is the pipe?"
  // is the question being asked.
  const parallelEdgeIds = new Set(
    busGroups.flatMap((group) => group.parallelSets.flatMap((set) => set.edgeIds)),
  );

  for (const node of Object.values(network.nodes)) {
    if (hidden.has(node.id)) continue;
    const group = nodeGroup(node);
    const colors = GROUP_COLORS[group];
    const unconnected = (node.ports ?? []).filter((port) => !port.connected_to);
    const portLine =
      options.showPorts && (node.ports ?? []).length > 0
        ? `\n${(node.ports ?? [])
            .map((port) => (port.connected_to ? `${port.kind} ✓` : port.kind))
            .join(' · ')}`
        : '';
    const classes: string[] = [`role-${group}`];
    if (group === 'boundary') classes.push('boundary');
    if (unconnected.length > 0) classes.push('unconnected-port');
    if (node.disabled) classes.push('disabled');
    if (!options.showLabels) classes.push('hide-label');

    const label = `${node.name}${node.power_W > 0 ? ` · ${node.power_W.toFixed(1)} W` : ''}${portLine}`;
    const box = labelBox(label);
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label,
        w: box.w,
        h: box.h,
        fill: colors.fill,
        border: colors.border,
        text: colors.text,
      },
      classes: classes.join(' '),
      position: network.layout.positions[node.id]
        ? { ...network.layout.positions[node.id] }
        : undefined,
    });
  }

  for (const group of busGroups) {
    const geometry = storedBusGeometry(network, group, axis!);
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
      const sourcePosition = network.layout.positions[branch.terminalId];
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
        // A junction sits on the bar, level with its own terminal — so it
        // takes the bar's coordinate on the flow axis and the terminal's on
        // the cross axis, whichever way round those are.
        position:
          geometry.along != null && sourcePosition
            ? axis === 'vertical'
              ? { x: geometry.along, y: sourcePosition.y + branch.crossOffset }
              : { x: sourcePosition.x + branch.crossOffset, y: geometry.along }
            : undefined,
        selectable: false,
        grabbable: false,
      });
    }

    /*
       The combination, written where the branches rejoin.

       Two numbers side by side on two lines do not tell a reader what the pair
       is worth, and the arithmetic is the one people get wrong: 0.130 beside
       0.050 is 0.036, not 0.180 and not 0.090. It sits on the bar at the
       terminal's own level — centred between the fanned branches — and reads
       out to the side of the bar so it lands on neither of them.
    */
    for (const set of group.parallelSets) {
      const sourcePosition = network.layout.positions[set.terminalId];
      const combined = parallelRth(network, set.edgeIds);
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
            ? `∥ ${combined != null ? `${combined.toFixed(3)} °C/W` : '—'}`
            : '',
        },
        classes: 'view-only hsk-bus-parallel-note',
        position:
          geometry.along != null && sourcePosition
            ? axis === 'vertical'
              ? { x: geometry.along, y: sourcePosition.y }
              : { x: sourcePosition.x, y: geometry.along }
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
        lineStyle: 'solid',
        label: '',
      },
      classes: 'view-only hsk-bus-trunk',
      selectable: false,
    });
  }

  for (const edge of Object.values(network.edges)) {
    if (!network.nodes[edge.from] || !network.nodes[edge.to]) continue;
    if (hidden.has(edge.from) || hidden.has(edge.to)) continue;
    const R = activeRth(edge.rth);
    // A pipe branch carries every pipe at once, so it says how many. Without
    // it the number reads as one pipe's and nobody can check the division.
    const pipes = edge.parameters?.pipes;
    const short =
      (EDGE_SHORT[edge.type] ?? edge.type) +
      (edge.type === 'heat_pipe' && typeof pipes === 'number' && pipes > 1 ? ` ×${pipes}` : '');
    const label = options.showLabels
      ? `${short} ${R != null ? `${R.toFixed(3)} °C/W` : '—'}`
      : '';
    const routed = routedBranches.get(edge.id);

    if (routed) {
      const terminalIsSource = edge.from === routed.terminalId;
      const routedLabel = options.showLabels
        ? R != null
          ? parallelEdgeIds.has(edge.id)
            ? // Name above number: on one line this is wider than the branch.
              `${short}\n${R.toFixed(3)} °C/W`
            : `${R.toFixed(3)} °C/W`
          : `${short} —`
        : '';
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: terminalIsSource ? routed.terminalId : routed.junctionId,
          target: terminalIsSource ? routed.junctionId : routed.terminalId,
          label: routedLabel,
          color: edgeColor(edge),
          lineStyle: edgeLineStyle(edge),
        },
        classes: parallelEdgeIds.has(edge.id)
          ? 'routed-port-edge parallel-branch'
          : 'routed-port-edge',
      });
      // Preserve the authoritative terminal-to-HSK relationship for Dagre;
      // the engineer only sees the routed branch above.
      elements.push({
        group: 'edges',
        data: {
          id: `${routed.junctionId}_LAYOUT`,
          source: edge.from,
          target: edge.to,
          color: '#000000',
          lineStyle: 'solid',
          label: '',
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
        label,
        color: edgeColor(edge),
        lineStyle: edgeLineStyle(edge),
      },
    });
  }

  return elements;
}
