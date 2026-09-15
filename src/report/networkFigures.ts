/**
 * Which pictures the Thermal Network Summary section carries.
 *
 * One whole-network figure per board group, then one per part that needs
 * attention. A 113-node graph printed at A4 width is a grey mat; the same graph
 * filtered to the RF chain is readable, and the part figures are what a reader
 * turns to this section to look at.
 *
 * The filtering is Screen 07's own — the component-visibility set the graph
 * already understands — so a figure here is the same picture that screen draws,
 * with the other boards put away.
 */

import type { Component, ComponentCategory } from '@/domain/component';
import type { ThermalNetwork, ThermalNode } from '@/thermal/types';
import type { MarginRank } from '@/thermal/analysis/marginRanking';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { SegmentLevers } from '@/thermal/analysis/tunableParameters';
import { componentOf, instanceOf } from '@/export/networkGraphPages';

export interface NetworkFigure {
  key: string;
  title: string;
  title_zh: string;
  /** What the figure is of, under the caption. */
  note: string;
  note_zh: string;
  hidden_component_ids: ReadonlySet<string>;
  /**
   * The duplicate instances of the components this figure keeps.
   *
   * A ×4 part draws four identical chains, and four of them side by side is
   * what made the RF figure a grey mat. One chain per part says the same thing
   * and can be read; the caption says how many it stands for.
   */
  hidden_node_ids: ReadonlySet<string>;
  /**
   * The segments a saved study cuts, numbered as the list beneath the figure
   * numbers them, so the reader can match "② Fin Surface → Ambient" in the
   * list to the ② on the chain.
   */
  tuned_edges?: ReadonlyMap<string, { rank: number; active: boolean }>;
  /** Set on a part figure: how far inside its limit it is. */
  part?: MarginRank;
  status?: 'warn' | 'over';
  /**
   * What Screen 08's saved study says could be changed.
   *
   * `null` means no study was saved for this part; an empty array means a study
   * exists but its segments have nothing adjustable on them. The report says
   * different things about the two, because "nobody has looked at this" and
   * "somebody looked and there is no knob" are different findings.
   */
  levers?: SegmentLevers[] | null;
}

/**
 * The groups, and what falls into each.
 *
 * The cavity filter has a figure of its own. It was folded into RF on the
 * grounds that it sits in the RF chain, but it is a different part with a
 * different boundary and a different limit, and putting it with the PAs made
 * the RF figure longer without making it say more.
 */
export const FIGURE_GROUPS: Array<{
  key: string;
  title: string;
  title_zh: string;
  categories: ComponentCategory[];
}> = [
  { key: 'rf', title: 'RF', title_zh: '射頻', categories: ['RF'] },
  { key: 'digital', title: 'Digital', title_zh: '數位', categories: ['Digital'] },
  { key: 'pw', title: 'PW', title_zh: '電源', categories: ['Power'] },
  { key: 'filter', title: 'Filter', title_zh: '濾波', categories: ['Filter'] },
  { key: 'other', title: 'Other', title_zh: '其他', categories: ['Other'] },
];

/**
 * One instance per component: the nodes of every OTHER instance.
 *
 * A ×4 PA is four identical chains. Drawing all four is what a picture of the
 * whole machine is for; a figure meant to show what the RF path LOOKS like
 * wants one of them, which is the same choice `componentGraphPages` makes for
 * the PDF's per-component pages.
 */
export function duplicateInstanceNodes(
  network: ThermalNetwork,
  keep: ReadonlySet<string>,
): { hidden: Set<string>; instances: Map<string, number> } {
  const byComponent = new Map<string, ThermalNode[]>();
  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    const id = componentOf(node);
    if (!id || !keep.has(id)) continue;
    const list = byComponent.get(id);
    if (list) list.push(node);
    else byComponent.set(id, [node]);
  }

  const hidden = new Set<string>();
  const instances = new Map<string, number>();
  for (const [componentId, nodes] of byComponent) {
    const keys = [...new Set(nodes.map(instanceOf))].sort((a, b) =>
      (a ?? '').localeCompare(b ?? '', undefined, { numeric: true }),
    );
    instances.set(componentId, keys.length);
    if (keys.length <= 1) continue;
    const [kept] = keys;
    for (const node of nodes) {
      if (instanceOf(node) !== kept) hidden.add(node.id);
    }
  }
  return { hidden, instances };
}

/** Components this network actually draws — the only ones worth hiding. */
export function modelledComponentIds(network: ThermalNetwork): Set<string> {
  const ids = new Set<string>();
  for (const node of Object.values(network.nodes)) {
    if (node.disabled) continue;
    const id = componentOf(node);
    if (id) ids.add(id);
  }
  return ids;
}


/**
 * Everything downstream of a group, plus the one hop that feeds it.
 *
 * A group figure is captioned as one board's heat path, and it used to draw
 * every shared node the component filter did not remove — the heatsink base,
 * the fin surface, ambient. For the RF, digital and power boards that is right:
 * their heat runs through the base and out of the fins, so the tail IS their
 * path.
 *
 * It is wrong for the cavity filter. The base runs hotter than the filter body,
 * so heat crosses that contact INTO the filter and leaves again through the
 * filter's own convection to ambient. Drawing `HSK Base → Fin Surface →
 * Ambient` after it invited the reader to conclude the filter is cooled by the
 * fins, when the arrow beside it says the opposite.
 *
 * So the figure follows the heat instead of the wiring: out from the group's
 * own nodes along each edge in the direction the solver actually found, and
 * everything reached that way is the group's path. A node on the OTHER side of
 * an edge that flows inward is kept as well, because "this heat arrives from
 * the heatsink base" is the finding, but the walk stops there — what happens
 * beyond a node that is feeding this group is some other group's story.
 *
 * Without a solution there are no directions to follow, so nothing is trimmed
 * and the figure stays as it was.
 */
function downstreamOfGroup(
  network: ThermalNetwork,
  solution: ThermalSolution | null | undefined,
  own: ReadonlySet<string>,
  alreadyHidden: ReadonlySet<string>,
): Set<string> {
  const keep = new Set(own);
  if (!solution) {
    for (const node of Object.values(network.nodes)) {
      if (!node.disabled && !alreadyHidden.has(node.id)) keep.add(node.id);
    }
    return keep;
  }

  const edges = Object.values(network.edges).filter(
    (edge) => edge.enabled && !alreadyHidden.has(edge.from) && !alreadyHidden.has(edge.to),
  );

  const frontier = [...own];
  const walked = new Set(own);
  while (frontier.length > 0) {
    const current = frontier.pop() as string;
    for (const edge of edges) {
      if (edge.from !== current && edge.to !== current) continue;
      const other = edge.from === current ? edge.to : edge.from;
      const result = solution.edge_results[edge.id];
      // No result, or none flowing: the node is adjacent structure worth
      // showing, but there is no heat to follow past it.
      const reversed = result?.actual_direction === 'reverse';
      const upstreamEnd = result ? (reversed ? edge.to : edge.from) : null;
      const flowsOutward = upstreamEnd === current && result?.actual_direction !== 'zero';

      keep.add(other);
      if (flowsOutward && !walked.has(other)) {
        walked.add(other);
        frontier.push(other);
      }
    }
  }
  return keep;
}

export function networkFigures(input: {
  network: ThermalNetwork;
  components: readonly Component[];
  /** Parts at or inside their limit, worst first. */
  ranked: readonly MarginRank[];
  /** The levers for each ranked part, in the same order; absent entries mean no study. */
  leversByNode: ReadonlyMap<string, SegmentLevers[] | null>;
  /** The solve whose flow directions say where each group's heat actually goes. */
  solution?: ThermalSolution | null;
}): NetworkFigure[] {
  const modelled = modelledComponentIds(input.network);
  const drawn = input.components.filter(
    (component) => component.enabled && modelled.has(component.id),
  );

  const figures: NetworkFigure[] = [];

  for (const group of FIGURE_GROUPS) {
    const inGroup = drawn.filter((component) => group.categories.includes(component.category));
    // A board the design does not have is not an empty figure.
    if (inGroup.length === 0) continue;
    const keep = new Set(inGroup.map((component) => component.id));
    const { hidden, instances } = duplicateInstanceNodes(input.network, keep);
    const repeated = [...instances.values()].filter((count) => count > 1).length;

    // The group's own nodes, then everything its heat reaches — see
    // `downstreamOfGroup`. Whatever is left over is tail belonging to some
    // other group's path and is hidden with the duplicate instances.
    const own = new Set(
      Object.values(input.network.nodes)
        .filter((node) => !node.disabled && !hidden.has(node.id))
        .filter((node) => {
          const id = componentOf(node);
          return Boolean(id && keep.has(id));
        })
        .map((node) => node.id),
    );
    const onPath = downstreamOfGroup(input.network, input.solution, own, hidden);
    const trimmed = new Set(hidden);
    for (const node of Object.values(input.network.nodes)) {
      if (node.disabled || trimmed.has(node.id)) continue;
      if (!onPath.has(node.id)) trimmed.add(node.id);
    }
    figures.push({
      key: `group-${group.key}`,
      title: `${group.title} Chain`,
      title_zh: `${group.title_zh}鏈路`,
      note:
        repeated > 0
          ? `${inGroup.length} component(s) · one chain each`
          : `${inGroup.length} component(s)`,
      note_zh:
        repeated > 0
          ? `${inGroup.length} 個元件，重複者各取一條`
          : `${inGroup.length} 個元件`,
      hidden_component_ids: new Set([...modelled].filter((id) => !keep.has(id))),
      hidden_node_ids: trimmed,
    });
  }

  for (const part of input.ranked) {
    // The part's own chain, alone. `component_id` is absent on a bare node — a
    // boundary or a shared base — which has no component to filter to, so the
    // figure falls back to everything rather than to nothing.
    const keep = part.component_id ? new Set([part.component_id]) : modelled;
    const { hidden } = duplicateInstanceNodes(input.network, keep);
    figures.push({
      key: `part-${part.node_id}`,
      title: part.name,
      title_zh: part.name,
      note: 'Heat path to ambient',
      note_zh: '至環境的散熱路徑',
      hidden_component_ids: new Set([...modelled].filter((id) => !keep.has(id))),
      hidden_node_ids: hidden,
      tuned_edges: new Map(
        (input.leversByNode.get(part.node_id) ?? []).map((segment) => [
          segment.edge_id,
          { rank: segment.rank, active: true },
        ]),
      ),
      part,
      status: part.margin_C < 0 ? 'over' : 'warn',
      levers: input.leversByNode.get(part.node_id) ?? null,
    });
  }

  return figures;
}
