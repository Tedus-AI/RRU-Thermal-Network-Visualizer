/**
 * Where the injected heat comes from, by kind of part.
 *
 * The Total Power card says 353.2 W. That is the right headline — it is what
 * the solve actually put into the network — but it answers "how much" without
 * answering "from what", and on an RRU the split between the PA chain, the
 * digital board and the supply is the first thing anyone asks next. The card
 * opens into this.
 *
 * Grouped by the component's CATEGORY rather than by part, because a dozen
 * named rows is a table and this is a breakdown: five categories fit under a
 * card and the reader can go to Screen 04 for the parts.
 *
 * Solar is its own row when there is any. It is heat the solve injects that no
 * component generates, so folding it into a category would misattribute it and
 * dropping it would stop the rows adding up to the headline.
 */

import type { Component } from '@/domain/component';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/domain/component';
import type { ThermalNetwork } from '../types';

export interface PowerSlice {
  /** A component category, or `Solar` for the external load. */
  label: ComponentCategory | 'Solar';
  zh: string;
  watts: number;
  /** Share of the total, 0–100. */
  share_pct: number;
}

const CATEGORY_ZH: Record<ComponentCategory | 'Solar', string> = {
  RF: '射頻',
  Digital: '數位',
  Power: '電源',
  Filter: '濾波',
  Other: '其他',
  Solar: '日照',
};

/**
 * The solve's heat, split by category and ordered largest first.
 *
 * Node power times the scenario's power scale, which is what the solver
 * injects — the same product Screen 07's rows report, so the two screens
 * cannot disagree about how much heat a part contributes.
 *
 * A node whose component has been deleted, or which carries power without
 * belonging to a component at all, lands in `Other`: it is heat in the solve
 * and the rows have to add up.
 */
export function powerByCategory(input: {
  network: ThermalNetwork;
  components: readonly Component[];
  powerScale: number;
  solar_W?: number;
}): { slices: PowerSlice[]; total_W: number } {
  const categoryOf = new Map(input.components.map((entry) => [entry.id, entry.category]));
  const watts = new Map<ComponentCategory | 'Solar', number>();

  for (const node of Object.values(input.network.nodes)) {
    if (node.disabled) continue;
    const power = (node.power_W || 0) * input.powerScale;
    if (!(power > 0)) continue;
    const category =
      (node.component_ref ? categoryOf.get(node.component_ref) : undefined) ?? 'Other';
    watts.set(category, (watts.get(category) ?? 0) + power);
  }

  const solar = input.solar_W ?? 0;
  if (solar > 0) watts.set('Solar', (watts.get('Solar') ?? 0) + solar);

  const total = [...watts.values()].reduce((sum, value) => sum + value, 0);
  const order: (ComponentCategory | 'Solar')[] = [...COMPONENT_CATEGORIES, 'Solar'];

  const slices = order
    .filter((label) => (watts.get(label) ?? 0) > 0)
    .map((label) => ({
      label,
      zh: CATEGORY_ZH[label],
      watts: watts.get(label) ?? 0,
      share_pct: total > 0 ? ((watts.get(label) ?? 0) / total) * 100 : 0,
    }))
    .sort((a, b) => b.watts - a.watts);

  return { slices, total_W: total };
}
