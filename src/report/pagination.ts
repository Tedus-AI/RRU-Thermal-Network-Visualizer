/**
 * Page estimation — 11 §10, §11, §40, §42.
 *
 * The preview is an HTML/CSS report renderer, not a PDF engine (§10), so the
 * page count is an ESTIMATE derived from how much room each included section
 * needs. It is deterministic — the same config always produces the same
 * pagination — and it is labelled as an estimate everywhere it is shown, because
 * the authoritative page count comes from whatever Screen 12 renders with.
 *
 * The unit is one page of body area. A section declares a base height plus a
 * per-row height in the registry; nothing here reads a thermal value.
 */

import type { MeasuredHeights } from './measuredHeights';
import { measuredTotal } from './measuredHeights';
import type { ReportPage, ReportSectionConfig, SectionId } from './reportTypes';
import { sectionDefinition } from './sectionRegistry';

export interface RowCounts {
  critical: number;
  /** Board chains in Thermal Network Summary. */
  network_figures?: number;
  /** Part chains in Bottleneck Thermal Network. */
  bottleneck_figures?: number;
}

/**
 * How many items a section is drawing — table rows, figures — or null when it
 * is not made of items and therefore cannot be split.
 */
function itemCount(section: ReportSectionConfig, rows: RowCounts): number | null {
  const definition = sectionDefinition(section.id);
  if (!definition.splittable || !definition.row_height) return null;
  if (section.id === 'network') return rows.network_figures ?? 0;
  if (section.id === 'bottleneck') return rows.bottleneck_figures ?? 0;
  // 0 means "All" (11 §15), and is the default.
  const limit = section.content.row_count ?? 0;
  return limit === 0 ? rows.critical : Math.min(limit, rows.critical);
}

/** How much of a page a section is expected to occupy, in page units. */
export function sectionHeight(
  section: ReportSectionConfig,
  rows: RowCounts,
  measured?: MeasuredHeights,
): number {
  const definition = sectionDefinition(section.id);
  const entry = measured?.[section.id];

  // A measured section is not an estimate at all, and the compact-spacing
  // factor below would be double-counting: the offscreen copy is rendered with
  // the same display options, so whatever compact spacing does is already in
  // the number.
  if (entry) return measuredTotal(entry);

  let height = definition.base_height;

  if (definition.row_height) {
    const count = itemCount(section, rows) ?? 0;
    height += definition.row_height * Math.max(count, 0);
  }

  // 11 §25 — compact spacing trims the section, it does not restructure it.
  if (section.display.compact_spacing) height *= 0.82;

  return height;
}

/**
 * Assign included sections to pages.
 *
 * Rules, in the order they apply:
 *   - the cover always owns page 1 (11 §7);
 *   - `page_break_before` starts a new page (11 §25);
 *   - a NON-splittable section that does not fit in what is left of the page
 *     moves whole to the next one, because it would otherwise be clipped;
 *   - a splittable section starts wherever there is room and carries on
 *     overleaf, which is what makes a page fill to its foot;
 *   - a SPLITTABLE section taller than a whole page spans several pages, and
 *     each page records which part it carries.
 *
 * A section that is not splittable never gets a continuation page. It used to:
 * the height here is an estimate and the page box clips, so an overflowing
 * section was drawn WHOLE on the next page as well — the reader saw the same
 * clipped content twice and what fell off the first page nowhere. A section
 * that cannot say "rows 11 onward" is better drawn once and clipped once.
 */
export function paginate(
  sections: ReportSectionConfig[],
  rows: RowCounts,
  /** Real heights read off the rendered page; the registry is the fallback. */
  measured?: MeasuredHeights,
): ReportPage[] {
  const included = sections.filter((section) => section.included);
  if (included.length === 0) return [];

  const pages: ReportPage[] = [];
  let current: ReportPage | null = null;
  let used = 0;

  // Returns the opened page rather than assigning `current` itself: assigning a
  // narrowed local from inside a closure would defeat the null-narrowing below.
  const open = (section: ReportSectionConfig, continued = false): ReportPage => {
    const definition = sectionDefinition(section.id);
    const title = section.display.title_override || definition.title;
    const page: ReportPage = {
      page_number: pages.length + 1,
      title: continued ? `${title} (cont.)` : title,
      title_zh: continued ? `${definition.zh}（續）` : definition.zh,
      section_ids: [section.id],
    };
    pages.push(page);
    used = 0;
    return page;
  };

  for (const section of included) {
    const definition = sectionDefinition(section.id);
    const entry = measured?.[section.id];
    const height = sectionHeight(section, rows, measured);

    const breaksFrom = (page: ReportPage) =>
      section.id === 'cover' ||
      section.display.page_break_before ||
      // The cover never shares its page with the section that follows it.
      page.section_ids.includes('cover') ||
      // A section that does not fit in what is left of the page.
      //
      // Only a section that CANNOT be split is moved whole. A splittable one
      // starts here and carries on overleaf, which is the entire point of its
      // being splittable — "Keep Table Together" used to move it too, and
      // since it defaults to on, every section refused to share a page unless
      // it fitted entirely. That is what left a third of each page blank on a
      // report with no page breaks set at all.
      (!definition.splittable && used + height > 1);

    if (current == null || breaksFrom(current)) {
      current = open(section);
    } else {
      current.section_ids.push(section.id);
    }

    const items = itemCount(section, rows);
    if (items == null) {
      used += height;
      // Clamped: whatever it is, it is one page's worth as far as the layout is
      // concerned, and the next section starts on a fresh page. A section that
      // cannot say "rows 11 onward" is better drawn once and clipped once than
      // drawn WHOLE on a continuation page the reader then sees twice.
      if (used > 1) used = 1;
      continue;
    }

    // --- an item-based section, filled page by page ------------------------
    //
    // Each page takes as many items as the room LEFT ON IT allows, so a section
    // that starts two-thirds down a page puts a few rows there and the bulk on
    // the next, rather than splitting evenly and leaving the first page's foot
    // blank.
    //
    // Item by item rather than by a capacity count, because measured items are
    // not all the same height: two network figures on one page can differ
    // threefold, and dividing the free space by an average would either clip
    // the tall one or waste the page on the short one.
    const overhead = entry ? entry.base : definition.base_height;
    const fallbackPer = definition.row_height ?? 0.03;
    const heightOf = (index: number) => entry?.items[index] ?? fallbackPer;

    const ranges: Array<{ page: ReportPage; from: number; to: number }> = [];
    let from = 0;

    while (from < items) {
      const fresh = used === 0;
      let free = 1 - used - overhead;
      let to = from;

      while (to < items) {
        const itemHeight = heightOf(to);
        // The first item on an EMPTY page is taken whether it fits or not: one
        // that is taller than a whole page fits nowhere, and refusing it would
        // loop forever. Everywhere else a poor fit moves to the next page.
        if (itemHeight <= free || (to === from && fresh)) {
          free -= itemHeight;
          to += 1;
        } else break;
      }

      if (to === from) {
        // Nothing fits in what is left of a page already carrying something
        // else. Start a fresh one and try again rather than emitting an empty
        // range — `fresh` is true next time round, so this cannot spin.
        current = open(section, from > 0);
        continue;
      }

      ranges.push({ page: current, from, to });
      // `free` is what is left of the page after this section's heading and the
      // items just taken, so the page is exactly that much short of full.
      used = 1 - free;
      from = to;
      if (from < items) current = open(section, true);
    }

    if (ranges.length > 0) {
      ranges.forEach((range, index) => {
        range.page.slices = {
          ...range.page.slices,
          [section.id]: {
            from: range.from,
            to: range.to,
            part: index,
            parts: ranges.length,
          },
        };
      });
    }
  }

  return pages.map((page, index) => ({ ...page, page_number: index + 1 }));
}

/** Which page a section starts on, for "click outline entry → focus preview". */
export function pageOfSection(pages: ReportPage[], id: SectionId): number | null {
  const page = pages.find((entry) => entry.section_ids.includes(id));
  return page ? page.page_number : null;
}
