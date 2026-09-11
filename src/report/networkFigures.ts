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
import type { SegmentLevers } from '@/thermal/analysis/tunableParameters';

export interface NetworkFigure {
  key: string;
  title: string;
  title_zh: string;
  /** What the figure is of, under the caption. */
  note: string;
  note_zh: string;
  hidden_component_ids: ReadonlySet<string>;
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
 * The three groups, and what falls into each.
 *
 * A cavity filter is an RF part — it sits in the RF chain and is read with it —
 * so `Filter` joins `RF` rather than standing alone.
 */
export const FIGURE_GROUPS: Array<{
  key: string;
  title: string;
  title_zh: string;
  categories: ComponentCategory[];
}> = [
  { key: 'rf', title: 'RF', title_zh: '射頻', categories: ['RF', 'Filter'] },
  { key: 'digital', title: 'Digital', title_zh: '數位', categories: ['Digital'] },
  { key: 'pw', title: 'PW', title_zh: '電源', categories: ['Power'] },
  { key: 'other', title: 'Other', title_zh: '其他', categories: ['Other'] },
];

function componentOf(node: ThermalNode): string | null {
  return node.origin?.component_id ?? node.component_ref ?? null;
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

export function networkFigures(input: {
  network: ThermalNetwork;
  components: readonly Component[];
  /** Parts at or inside their limit, worst first. */
  ranked: readonly MarginRank[];
  /** The levers for each ranked part, in the same order; absent entries mean no study. */
  leversByNode: ReadonlyMap<string, SegmentLevers[] | null>;
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
    figures.push({
      key: `group-${group.key}`,
      title: `${group.title} Chain`,
      title_zh: `${group.title_zh}鏈路`,
      note: `${inGroup.length} component(s) · other boards hidden`,
      note_zh: `${inGroup.length} 個元件，其餘板區已隱藏`,
      hidden_component_ids: new Set([...modelled].filter((id) => !keep.has(id))),
    });
  }

  for (const part of input.ranked) {
    // The part's own chain, alone. `component_id` is absent on a bare node — a
    // boundary or a shared base — which has no component to filter to, so the
    // figure falls back to everything rather than to nothing.
    const keep = part.component_id ? new Set([part.component_id]) : modelled;
    figures.push({
      key: `part-${part.node_id}`,
      title: part.name,
      title_zh: part.name,
      note: 'Heat path to ambient',
      note_zh: '至環境的散熱路徑',
      hidden_component_ids: new Set([...modelled].filter((id) => !keep.has(id))),
      part,
      status: part.margin_C < 0 ? 'over' : 'warn',
      levers: input.leversByNode.get(part.node_id) ?? null,
    });
  }

  return figures;
}
