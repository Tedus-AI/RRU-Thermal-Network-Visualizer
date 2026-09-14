/**
 * What each section ACTUALLY occupies, measured off the rendered page.
 *
 * The registry's `base_height` / `row_height` are guesses, and a guess has to
 * be generous: the page box clips, so an underestimate loses content. Every
 * constant was therefore set high, and the report paid for it on every page —
 * a section that really wanted a third of a page was told to expect a whole
 * one, so the paginator broke early and left the foot of each page blank.
 *
 * A figure is the case no constant can cover. Its height is its image's aspect
 * ratio at the page's content width, and a chain that is wide and shallow is a
 * third the height of one that branches — 0.09 of a page against 0.16, on the
 * same report. One number cannot be right for both, and the safe number is
 * wrong for both.
 *
 * So the heights are measured instead. Screen 11 renders every included
 * section once, offscreen, at the real page width, and reads back what the
 * browser laid out; the paginator uses those numbers and falls back to the
 * registry only for what has not been measured yet (the first paint, and any
 * section whose figures are still drawing).
 *
 * The unit stays what it was: one page of BODY area, so 0.5 is half the space
 * a page has for content, headers and footers excluded.
 */

import type { SectionId } from './reportTypes';

export interface MeasuredSection {
  /**
   * Everything that is not a repeating item — the heading, a table's own
   * header row, a footnote. Page units.
   */
  base: number;
  /** Each splittable item's own height, in order. Empty for a whole section. */
  items: number[];
}

export type MeasuredHeights = Partial<Record<SectionId, MeasuredSection>>;

/**
 * A section's total height, for the non-splittable case and for validation.
 */
export function measuredTotal(entry: MeasuredSection): number {
  return entry.base + entry.items.reduce((sum, item) => sum + item, 0);
}

/**
 * Read the offscreen measuring pass back into page units.
 *
 * `root` is the hidden container; `bodyHeightPx` is one page's body area, which
 * is what a "page unit" means. Anything of zero height is skipped rather than
 * recorded as 0 — a section still waiting on its figures would otherwise be
 * measured as free, and the paginator would put the whole report on one page.
 */
export function readMeasuredHeights(
  root: HTMLElement,
  bodyHeightPx: number,
  /** The `gap-3` between two sections sharing a page. */
  gapPx: number,
): MeasuredHeights {
  if (bodyHeightPx <= 0) return {};
  const measured: MeasuredHeights = {};

  for (const host of root.querySelectorAll<HTMLElement>('[data-measure-section]')) {
    const id = host.getAttribute('data-measure-section') as SectionId | null;
    if (!id) continue;

    const total = host.getBoundingClientRect().height;
    if (total <= 0) continue;

    const items: number[] = [];
    // `:scope` keeps a nested section's items out of this one's list. Nothing
    // nests today, but a section rendering another would silently steal them.
    for (const item of host.querySelectorAll<HTMLElement>('[data-measure-item]')) {
      items.push(item.getBoundingClientRect().height / bodyHeightPx);
    }

    const itemSum = items.reduce((sum, item) => sum + item, 0);
    // The gap belongs to whichever section follows another on a page. Charging
    // it to every section over-counts the first one on each page by about one
    // per cent, which is the safe direction to be wrong in.
    const base = Math.max(total / bodyHeightPx - itemSum, 0) + gapPx / bodyHeightPx;

    measured[id] = { base, items };
  }

  return measured;
}
