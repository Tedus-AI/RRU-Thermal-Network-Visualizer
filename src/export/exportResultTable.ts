/**
 * The result table as a PDF.
 *
 * Rasterized, like `exportPdfReport` and for the same reason: the table is
 * bilingual — "共用結構", "手動節點", every Chinese unit and role — and jsPDF's
 * built-in fonts carry no CJK glyphs, so a text PDF would drop half of every
 * label without saying so. Rasterizing the browser's own layout keeps every
 * glyph the engineer saw on screen.
 *
 * The table is rendered offscreen and FULLY EXPANDED, because a PDF of a report
 * that only carried the rows someone happened to have open is not a report. It
 * is the same `ResultTree` component the panel draws, mounted a second time
 * with `forceExpanded` — a print-only copy of a table drifts from the real one,
 * and the drift is only ever noticed after it has shipped in a document.
 *
 * Pagination measures the rendered rows and cuts between them. Slicing by pixel
 * height alone puts a page break through the middle of a row, which is exactly
 * the thing that makes a generated PDF look generated.
 */

import type { ReactElement } from 'react';

/** A4 landscape at 96 dpi, which is what the offscreen table is laid out to. */
const PAGE_W_PX = 1123;
const PAGE_H_PX = 794;
const MARGIN_PX = 28;
const HEADER_PX = 54;

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
 * itself and overflows it, which is visible and honest, rather than silently
 * vanishing between two pages.
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

    const table = host.firstElementChild as HTMLElement | null;
    if (!table) throw new Error('The result table did not render.');

    // Every direct child of the tree: the sticky header, then one block per
    // component. Cutting between components rather than between rows keeps a
    // part's chain on one page wherever it fits.
    const blocks = [...table.children] as HTMLElement[];
    const header = blocks[0];
    const body = blocks.slice(1);
    const tableTop = table.getBoundingClientRect().top;
    const measured = body.map((block) => {
      const box = block.getBoundingClientRect();
      return { top: box.top - tableTop, bottom: box.bottom - tableTop };
    });

    const pages = paginateRows(measured, CONTENT_H - header.getBoundingClientRect().height);
    if (pages.length === 0) throw new Error('The result table has no rows to export.');

    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W_PX, PAGE_H_PX], orientation: 'landscape', compress: true });

    for (const [index, blockIndexes] of pages.entries()) {
      // Show only this page's blocks, so html2canvas rasterizes exactly them.
      body.forEach((block, position) => {
        block.style.display = blockIndexes.includes(position) ? '' : 'none';
      });

      const canvas = await html2canvas(table, {
        scale: 2,
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
      pdf.text(
        `${index + 1} / ${pages.length}`,
        PAGE_W_PX - MARGIN_PX,
        MARGIN_PX + 27,
        { align: 'right' },
      );

      // Width is fixed; height follows the aspect so rows are never squashed.
      const drawnH = (canvas.height / canvas.width) * CONTENT_W;
      pdf.addImage(
        image,
        'JPEG',
        MARGIN_PX,
        MARGIN_PX + HEADER_PX,
        CONTENT_W,
        drawnH,
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
