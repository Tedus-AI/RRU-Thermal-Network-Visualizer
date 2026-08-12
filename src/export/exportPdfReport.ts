/**
 * PDF and HTML report writers — 12 §9, §16, §38, AC-12-08.
 *
 * Both take the pages Screen 11's own renderer produced (see `reportRenderer`)
 * and only decide how to serialize them. Nothing about the report's layout is
 * decided here, which is what §9's "12 must not change report layout" means in
 * practice.
 *
 * The PDF is rasterized page by page. That choice is deliberate: the report is
 * bilingual, and a vector PDF would need an embedded CJK font subset to render
 * Traditional Chinese at all — without one the Chinese half of every label would
 * silently vanish. Rasterizing the browser's own layout keeps every glyph the
 * engineer saw in the preview.
 */

import { renderReport, type ReportRenderInput } from './reportRenderer';
import type { PngScale } from './exportTypes';

export interface PdfResult {
  blob: Blob;
  page_count: number;
}

/** Device pixels per CSS pixel used when rasterizing. 2x is the §25 default. */
function scaleFactor(scale: PngScale): number {
  return scale === '2x' ? 2 : 1;
}

export async function exportPdfReport(
  input: ReportRenderInput,
  scale: PngScale = '2x',
): Promise<PdfResult> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const rendered = renderReport(input);
  try {
    if (rendered.pages.length === 0) {
      throw new Error('The report has no included sections, so there is nothing to render.');
    }

    const pdf = new jsPDF({
      unit: 'mm',
      format: input.config.page_size === 'Letter' ? 'letter' : 'a4',
      orientation: input.config.orientation === 'landscape' ? 'landscape' : 'portrait',
      compress: true,
    });

    for (const [index, element] of rendered.pages.entries()) {
      const canvas = await html2canvas(element, {
        scale: scaleFactor(scale),
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      const image = canvas.toDataURL('image/jpeg', 0.92);
      if (index > 0) pdf.addPage();
      // The page element is already the exact millimetre size of the sheet, so
      // it maps 1:1 onto the PDF page with no re-fitting.
      pdf.addImage(image, 'JPEG', 0, 0, rendered.width_mm, rendered.height_mm, undefined, 'FAST');
    }

    return { blob: pdf.output('blob'), page_count: rendered.pages.length };
  } finally {
    rendered.dispose();
  }
}

/**
 * 12 §8 — the HTML report, listed as optional and implemented.
 *
 * It is a single self-contained file: the page's own stylesheets are inlined so
 * the report opens correctly with no network access, which is the same promise
 * §35 makes about the export as a whole.
 */
export function exportHtmlReport(input: ReportRenderInput): { html: string; page_count: number } {
  const rendered = renderReport(input);
  try {
    const body = rendered.pages.map((page) => page.outerHTML).join('\n');
    const css = collectStyles();
    const title = input.config.title || 'Thermal Engineering Report';

    const html = `<!doctype html>
<html lang="${input.config.language_mode === 'english' ? 'en' : 'zh-Hant'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
<style>
  body { margin: 0; background: #eef1f6; }
  [data-report-page] { margin: 8mm auto; box-shadow: 0 1px 6px rgba(15, 23, 42, 0.18); }
  @media print {
    body { background: #ffffff; }
    [data-report-page] { margin: 0; box-shadow: none; page-break-after: always; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

    return { html, page_count: rendered.pages.length };
  } finally {
    rendered.dispose();
  }
}

/**
 * Inlines the document's own CSS.
 *
 * A stylesheet the browser refuses to expose (a cross-origin one) is skipped
 * rather than guessed at; in this app every sheet is same-origin, so the
 * guard exists for robustness, not as an expected path.
 */
function collectStyles(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) chunks.push(rule.cssText);
    } catch {
      continue;
    }
  }
  return chunks.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
