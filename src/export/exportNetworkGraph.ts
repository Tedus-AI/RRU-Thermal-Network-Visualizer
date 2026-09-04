/**
 * The thermal network as a picture you can actually read.
 *
 * On a 22" screen the whole STARKCORE graph fits at 51 % zoom, and at 51 % the
 * edge labels — 0.871 °C/W, 1.190 °C/W — are a grey smear. The graph is wide
 * because the network is wide; no amount of fitting fixes that, because fitting
 * is the problem. So both exports are rendered at MODEL size, `scale: 1`, and
 * the file is large on purpose: it opens big and you pan around it, which is
 * how a wide schematic has always been read.
 *
 * `full: true` is what makes that possible. It renders the graph's own bounding
 * box rather than whatever the viewport happens to be showing, so the export
 * neither depends on nor disturbs where the engineer had scrolled to.
 *
 * The PDF adds one page per component (see `networkGraphPages`), and each page
 * is sized to its own image in points at 1 px = 1 pt. An A4 page would have
 * undone the whole exercise: the same 3000 px of graph squeezed onto 595 pt is
 * the 51 % problem again, in a file.
 */

import cytoscape, { type ElementDefinition } from 'cytoscape';

import { positionViewBuses } from '@/screens/05-thermal-path-builder/busLayout';
import { layoutOptions } from '@/screens/05-thermal-path-builder/ThermalGraphCanvas';
import {
  edgeLabelsOf,
  layoutSubject,
  solvedStylesheet,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';

export interface GraphImage {
  /** JPEG data URI. */
  dataUrl: string;
  width: number;
  height: number;
}

/** JPEG rather than PNG: a 3000 px graph is ~10x smaller and has no alpha. */
const JPEG_QUALITY = 0.92;

/**
 * The size a bare `cy.jpg({ full: true })` would produce, so a caller can tell
 * whether a render is about to be enormous before it commits to it.
 *
 * Cytoscape caps its own output at `maxWidth`/`maxHeight` when given them, and
 * silently scales down when it hits an internal canvas limit — so this is the
 * REQUESTED size, and the returned image's own dimensions are what count.
 */
export const MAX_EXPORT_EDGE_PX = 16384;

/** Reads a data URI's own pixel size back, which is the only honest source:
 *  Cytoscape silently scales down when a render hits a canvas limit. */
export function measureImage(dataUrl: string): Promise<GraphImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ dataUrl, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('The rendered graph could not be read back.'));
    image.src = dataUrl;
  });
}

/**
 * Renders elements on a Cytoscape instance of their own.
 *
 * Off screen rather than on the live canvas because a per-component page has to
 * lay ONE part out on its own — the positions it holds in the 113-node graph put
 * it in a column three metres from the origin, and cropping to it would export
 * mostly whitespace. A separate instance also means the engineer's own view,
 * zoom and selection are never touched.
 *
 * The container is a real element with a real size: Cytoscape's renderer needs
 * a canvas, so `headless` cannot rasterize. It is positioned out of the document
 * flow and removed in a `finally`, so a throw mid-render cannot leave it behind.
 */
export async function renderGraphImage(
  elements: ElementDefinition[],
  layoutMode: string,
): Promise<GraphImage> {
  const host = document.createElement('div');
  host.setAttribute('data-graph-export', '');
  host.style.cssText =
    'position:fixed;left:-100000px;top:0;width:1600px;height:1000px;pointer-events:none;';
  document.body.appendChild(host);

  const cy = cytoscape({
    container: host,
    style: solvedStylesheet(),
    elements,
    // No interaction on a throwaway instance, and no zoom clamp to fight the
    // scale: 1 render.
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
  });

  try {
    if (cy.nodes().length > 0) {
      await new Promise<void>((resolve) => {
        const layout = layoutSubject(cy).layout(
          layoutOptions(layoutMode, edgeLabelsOf(cy)) as unknown as cytoscape.LayoutOptions,
        );
        // Layout applies positions asynchronously; exporting before `layoutstop`
        // catches every node still stacked on the origin.
        layout.one('layoutstop', () => resolve());
        layout.run();
      });
      // The bus is drawn FROM the settled positions, so it is placed after.
      positionViewBuses(cy, true);
    }

    return await measureImage(
      cy.jpg({
        output: 'base64uri',
        full: true,
        scale: 1,
        quality: JPEG_QUALITY,
        bg: '#ffffff',
        maxWidth: MAX_EXPORT_EDGE_PX,
        maxHeight: MAX_EXPORT_EDGE_PX,
      }),
    );
  } finally {
    cy.destroy();
    host.remove();
  }
}

export interface PdfPageSource {
  title: string;
  subtitle?: string;
  image: GraphImage;
}

/**
 * One PDF page per image, each sized to the image it carries.
 *
 * Points, with the conversion done here rather than by jsPDF's `px` unit. That
 * unit multiplies by 96/72 — a page came out 2197 x 2412 pt for a 1616 x 1733
 * image, exactly 4/3 too large — which spreads the same pixels over a third
 * more paper and leaves a viewer upscaling, and blurring, the graph at 100 %.
 * At the CSS relation of 0.75 pt per px the PDF's natural size is the JPG's
 * natural size on a 96 dpi screen, which is what "the same as the JPG" means.
 *
 * The caption band is added to the page height rather than laid over the graph,
 * so it can never cover a node.
 */
/** One CSS pixel, in points. */
export const PT_PER_PX = 72 / 96;
/** Room above the graph for the caption, pt. */
export const PAGE_CAPTION_PT = 33;
export const PAGE_MARGIN_PT = 12;

export interface PdfPageGeometry {
  /** Page size in points, width then height. */
  page: { width: number; height: number };
  /** Where the graph goes, in points. */
  image: { x: number; y: number; width: number; height: number };
  orientation: 'landscape' | 'portrait';
  /** What jsPDF wants, which is the pair in the order the orientation expects. */
  format: [number, number];
}

/**
 * A page sized to the graph it carries, in points.
 *
 * The conversion is done here rather than by jsPDF's `px` unit, which
 * multiplies by 96/72: a 1616 x 1733 image came out on a 2197 x 2412 pt page,
 * exactly 4/3 too large, which spreads the same pixels over a third more paper
 * and leaves the viewer upscaling — and blurring — the graph at 100 %. At the
 * CSS relation of 0.75 pt per px the PDF's natural size IS the JPG's natural
 * size on a 96 dpi screen, which is what "the same as the JPG" has to mean.
 */
export function pdfPageGeometry(image: { width: number; height: number }): PdfPageGeometry {
  const width = image.width * PT_PER_PX;
  const height = image.height * PT_PER_PX;
  const page = {
    width: width + PAGE_MARGIN_PT * 2,
    height: height + PAGE_CAPTION_PT + PAGE_MARGIN_PT * 2,
  };
  const orientation: 'landscape' | 'portrait' =
    page.width >= page.height ? 'landscape' : 'portrait';

  return {
    page,
    image: { x: PAGE_MARGIN_PT, y: PAGE_MARGIN_PT + PAGE_CAPTION_PT, width, height },
    orientation,
    format:
      orientation === 'landscape' ? [page.height, page.width] : [page.width, page.height],
  };
}

export async function buildGraphPdf(pages: readonly PdfPageSource[]): Promise<Blob> {
  if (pages.length === 0) throw new Error('There is nothing to export.');

  const { jsPDF } = await import('jspdf');
  let pdf: import('jspdf').jsPDF | null = null;

  for (const page of pages) {
    const geometry = pdfPageGeometry(page.image);

    if (!pdf) {
      pdf = new jsPDF({
        unit: 'pt',
        format: geometry.format,
        orientation: geometry.orientation,
        compress: true,
      });
    } else {
      pdf.addPage(geometry.format, geometry.orientation);
    }

    pdf.setFontSize(13);
    pdf.setTextColor('#0f172a');
    // Latin only: jsPDF's built-in fonts have no CJK glyphs and would drop the
    // Chinese half of a bilingual caption without saying so. Everything Chinese
    // in this export lives inside the rendered graph, which is a raster.
    pdf.text(page.title, PAGE_MARGIN_PT, PAGE_MARGIN_PT + 13);
    if (page.subtitle) {
      pdf.setFontSize(9);
      pdf.setTextColor('#64748b');
      pdf.text(page.subtitle, PAGE_MARGIN_PT, PAGE_MARGIN_PT + 26);
    }

    pdf.addImage(
      page.image.dataUrl,
      'JPEG',
      geometry.image.x,
      geometry.image.y,
      geometry.image.width,
      geometry.image.height,
      undefined,
      'FAST',
    );
  }

  return pdf!.output('blob');
}

/** `FR1_RRU_starkcore_network_20260904.pdf` — project, subject, day. */
export function exportFilename(projectName: string, kind: 'jpg' | 'pdf', now = new Date()): string {
  const safe = (projectName || 'project').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${safe || 'project'}_network_${day}.${kind}`;
}
