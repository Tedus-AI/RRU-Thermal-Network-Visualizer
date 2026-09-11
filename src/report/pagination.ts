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

import type { ReportPage, ReportSectionConfig, SectionId } from './reportTypes';
import { sectionDefinition } from './sectionRegistry';

export interface RowCounts {
  critical: number;
  /** How many figures the Thermal Network Summary is drawing. */
  network_figures?: number;
}

/** How much of a page a section is expected to occupy, in page units. */
export function sectionHeight(section: ReportSectionConfig, rows: RowCounts): number {
  const definition = sectionDefinition(section.id);
  let height = definition.base_height;

  if (definition.row_height) {
    const count =
      section.id === 'network'
        ? (rows.network_figures ?? 0)
        : // 0 means "All" (11 §15).
          section.content.row_count === 0
          ? rows.critical
          : Math.min(section.content.row_count ?? 5, rows.critical);
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
 *   - a section that does not fit in what is left of the page moves to the next
 *     one when `keep_table_together` is set, and otherwise flows across;
 *   - a SPLITTABLE section taller than a whole page spans several pages, and
 *     each page records which part it carries.
 *
 * A section that is not splittable never gets a continuation page. It used to:
 * the height here is an estimate and the page box clips, so an overflowing
 * section was drawn WHOLE on the next page as well — the reader saw the same
 * clipped content twice and what fell off the first page nowhere. A section
 * that cannot say "rows 11 onward" is better drawn once and clipped once.
 */
export function paginate(sections: ReportSectionConfig[], rows: RowCounts): ReportPage[] {
  const included = sections.filter((section) => section.included);
  if (included.length === 0) return [];

  const pages: ReportPage[] = [];
  let current: ReportPage | null = null;
  let used = 0;

  // Returns the opened page rather than assigning `current` itself: assigning a
  // narrowed local from inside a closure would defeat the null-narrowing below.
  const open = (section: ReportSectionConfig): ReportPage => {
    const definition = sectionDefinition(section.id);
    const page: ReportPage = {
      page_number: pages.length + 1,
      title: section.display.title_override || definition.title,
      title_zh: definition.zh,
      section_ids: [section.id],
    };
    pages.push(page);
    used = 0;
    return page;
  };

  for (const section of included) {
    const definition = sectionDefinition(section.id);
    const height = sectionHeight(section, rows);

    const breaksFrom = (page: ReportPage) =>
      section.id === 'cover' ||
      section.display.page_break_before ||
      // The cover never shares its page with the section that follows it.
      page.section_ids.includes('cover') ||
      (section.display.keep_table_together && used + height > 1);

    if (current == null || breaksFrom(current)) {
      current = open(section);
    } else {
      current.section_ids.push(section.id);
    }

    used += height;

    if (!definition.splittable) {
      // Clamped: whatever it is, it is one page's worth as far as the layout
      // is concerned, and the next section starts on a fresh page.
      if (used > 1) used = 1;
      continue;
    }

    // A splittable section too tall for one page continues onto further pages.
    // Those pages carry the same title so the thumbnail reads sensibly, and a
    // part index so the renderer can show what did not fit.
    const continuations: ReportPage[] = [];
    let remaining = used;
    while (remaining > 1) {
      remaining -= 1;
      const page: ReportPage = {
        page_number: pages.length + 1,
        title: `${section.display.title_override || definition.title} (cont.)`,
        title_zh: `${definition.zh}（續）`,
        section_ids: [section.id],
      };
      pages.push(page);
      continuations.push(page);
      current = page;
    }
    used = remaining;

    if (continuations.length > 0) {
      const parts = continuations.length + 1;
      const first = pages.find((page) => page.section_ids.includes(section.id));
      if (first) first.parts = { ...first.parts, [section.id]: { part: 0, parts } };
      continuations.forEach((page, index) => {
        page.parts = { ...page.parts, [section.id]: { part: index + 1, parts } };
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
