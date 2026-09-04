/**
 * The result table as a PDF.
 *
 * Rasterized, like `exportPdfReport` and for the same reason: the table is
 * bilingual — 共用結構, 熱傳導, every Chinese unit and role — and jsPDF's
 * built-in fonts carry no CJK glyphs, so a text PDF would drop half of every
 * label without saying so. Rasterizing the browser's own layout keeps every
 * glyph the engineer saw on screen.
 *
 * The table is rendered offscreen and FULLY EXPANDED, because a PDF of a report
 * that only carried the rows someone happened to have open is not a report. It
 * is the same `ResultTree` the panel draws, mounted a second time with
 * `forceExpanded` — a print-only copy of a table drifts from the real one, and
 * the drift is only ever noticed after it has shipped in a document.
 *
 * ---------------------------------------------------------------------------
 * Pagination is per ROW, not per component
 *
 * The first version cut between component blocks. That is the nicer cut, and it
 * is unusable here: expanded, one component of this project's size is 1200–1500
 * px against a 684 px page, so five pages of eight were a single oversized
 * block drawn straight off the bottom of the sheet with no margin at all.
 *
 * So rows are the unit. When a page starts inside a component, that component's
 * header row is shown again above it — the browser puts it back at the top of
 * its own `<tbody>` for free, so a continued block still says whose rows these
 * are. The drawn image is then clamped to the content box in BOTH directions,
 * which is the belt to the pagination's braces: a page can no longer overflow
 * even if a single row were somehow taller than the sheet.
 */

import type { ReactElement } from 'react';

/** A4 landscape at 96 dpi, which is what the offscreen table is laid out to. */
const PAGE_W_PX = 1123;
const PAGE_H_PX = 794;
const MARGIN_PX = 28;
const HEADER_PX = 54;

/** Device pixels per CSS pixel when rasterizing, for legible small type. */
const RASTER_SCALE = 2;

const CONTENT_W = PAGE_W_PX - MARGIN_PX * 2;
const CONTENT_H = PAGE_H_PX - MARGIN_PX * 2 - HEADER_PX;

export interface ResultTablePdfInput {
  /** `<ResultTree … forceExpanded />`, ready to mount. */
  table: ReactElement;
  title: string;
  subtitle: string;
}

/**
 * Where to cut, given each row's top and bottom within the table.
 *
 * Exported because it is the part with the arithmetic in it: everything else
 * here is DOM plumbing that needs a browser, and this needs only numbers.
 *
 * A row taller than a whole page cannot be cut around — it gets a page to
 * itself and is scaled to fit by the caller, rather than silently vanishing
 * between two pages.
 */
export function paginateRows(
  rows: readonly { top: number; bottom: number }[],
  pageHeight: number,
): number[][] {
  if (rows.length === 0) return [];
  const pages: number[][] = [];
  let current: number[] = [];
  let origin = rows[0].top;

  rows.forEach((row, index) => {
    const wouldOverflow = row.bottom - origin > pageHeight;
    if (wouldOverflow && current.length > 0) {
      pages.push(current);
      current = [];
      origin = row.top;
    }
    current.push(index);
  });

  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Mounts the table offscreen, slices it into pages and rasterizes each.
 *
 * The host is fixed off to the left rather than hidden: `display: none` and
 * `visibility: hidden` both stop the browser laying the table out at all, and
 * every row then measures zero.
 */
export async function exportResultTablePdf(input: ResultTablePdfInput): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }, { createRoot }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
    import('react-dom/client'),
  ]);

  const host = document.createElement('div');
  host.setAttribute('data-result-table-export', '');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${CONTENT_W}px;background:#ffffff;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(input.table);
    // React 18 renders asynchronously; two frames is enough for the commit and
    // the layout that follows it, and measuring before either gives zeros.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const table = host.querySelector('table');
    if (!table) throw new Error('The result table did not render.');

    const head = table.querySelector('thead') as HTMLElement | null;
    const headHeight = head?.getBoundingClientRect().height ?? 0;
    // Body rows only. The column header is `position: sticky` and rides every
    // page for free, so it is not paginated and its height is reserved instead.
    const rows = [...table.querySelectorAll('tbody > tr')] as HTMLTableRowElement[];
    const tableTop = table.getBoundingClientRect().top;
    const measured = rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { top: box.top - tableTop - headHeight, bottom: box.bottom - tableTop - headHeight };
    });

    // Room for the header a continued block puts back. Without reserving it,
    // a page that starts mid-component came out one row taller than the sheet
    // and had to be scaled down to fit — every page then lost a third of its
    // width, and the type with it.
    const repeatReserve = [
      ...table.querySelectorAll('tr[data-result-block-header]'),
    ].reduce((tallest, row) => Math.max(tallest, row.getBoundingClientRect().height), 0);

    const pages = paginateRows(measured, CONTENT_H - headHeight - repeatReserve);
    if (pages.length === 0) throw new Error('The result table has no rows to export.');

    const pdf = new jsPDF({
      unit: 'px',
      format: [PAGE_W_PX, PAGE_H_PX],
      orientation: 'landscape',
      compress: true,
    });

    for (const [index, rowIndexes] of pages.entries()) {
      const shown = new Set(rowIndexes);
      rows.forEach((row, position) => {
        row.style.display = shown.has(position) ? '' : 'none';
      });

      // A page that starts inside a component shows that component's header
      // again, so a continued block still says whose rows these are. It lives
      // in the same `<tbody>`, so un-hiding is all it takes.
      const first = rows[rowIndexes[0]];
      if (first && !first.hasAttribute('data-result-block-header')) {
        const header = first.parentElement?.querySelector(
          ':scope > tr[data-result-block-header]',
        ) as HTMLElement | null;
        if (header) header.style.display = '';
      }

      const canvas = await html2canvas(table, {
        scale: RASTER_SCALE,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      const image = canvas.toDataURL('image/jpeg', 0.94);
      if (index > 0) pdf.addPage([PAGE_W_PX, PAGE_H_PX], 'landscape');

      pdf.setFontSize(13);
      pdf.setTextColor('#0f1b30');
      pdf.text(input.title, MARGIN_PX, MARGIN_PX + 12);
      pdf.setFontSize(9);
      pdf.setTextColor('#5c6981');
      pdf.text(input.subtitle, MARGIN_PX, MARGIN_PX + 27);
      pdf.text(`${index + 1} / ${pages.length}`, PAGE_W_PX - MARGIN_PX, MARGIN_PX + 27, {
        align: 'right',
      });

      // Drawn at CSS size — one rendered pixel to one PDF pixel — and shrunk
      // only if a page still would not fit. The canvas is RASTER_SCALE times
      // the CSS size, and fitting against its raw pixels instead halved every
      // page: each came out at about 71 % of the width it had earned.
      const cssW = canvas.width / RASTER_SCALE;
      const cssH = canvas.height / RASTER_SCALE;
      const fit = Math.min(1, CONTENT_W / cssW, CONTENT_H / cssH);
      pdf.addImage(
        image,
        'JPEG',
        MARGIN_PX,
        MARGIN_PX + HEADER_PX,
        cssW * fit,
        cssH * fit,
        undefined,
        'FAST',
      );
    }

    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}
