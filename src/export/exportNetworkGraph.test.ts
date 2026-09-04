/**
 * The geometry that decides whether the export is readable.
 *
 * The whole point of these exports is a graph at 100 %: on a 22" screen the
 * STARKCORE network fits at 51 % — measured 44 % at 1600 x 1000 — and at that
 * zoom the edge labels are a grey smear. `full: true, scale: 1` gets that right
 * for the raster; a PDF page then has to carry it at the same size or the
 * saving is given straight back.
 *
 * `pdfPageGeometry` is what the browser check found a bug in: jsPDF's `px` unit
 * multiplies by 96/72, so the first pages came out exactly 4/3 too large and a
 * viewer at 100 % was upscaling the graph. Rendering is not tested here — it
 * needs a canvas, which this suite has no DOM for — and was verified in the
 * browser against the real project instead.
 */

import { describe, expect, it } from 'vitest';

import { modeFilenamePart, RESULT_MODES } from '@/screens/07-thermal-network/resultViewModel';

import {
  exportFilename,
  PAGE_CAPTION_PT,
  PAGE_MARGIN_PT,
  pdfPageGeometry,
  PT_PER_PX,
} from './exportNetworkGraph';

/** The measured STARKCORE network, model size. */
const WHOLE = { width: 1616, height: 1733 };

describe('a page sized to its graph', () => {
  /**
   * The regression. 1616 x 1733 px must not become 2197 x 2412 pt.
   */
  it('converts pixels at the CSS relation, not at 96/72', () => {
    const { page } = pdfPageGeometry(WHOLE);

    expect(page.width).toBeCloseTo(1616 * 0.75 + 24, 6);
    expect(page.height).toBeCloseTo(1733 * 0.75 + 33 + 24, 6);
    // The shape the bug had: a third too much paper in each direction.
    expect(page.width).not.toBeCloseTo(1616 + 24, 0);
  });

  it('reads back as the pixel size it came from', () => {
    const { image } = pdfPageGeometry(WHOLE);

    expect(image.width / PT_PER_PX).toBeCloseTo(WHOLE.width, 6);
    expect(image.height / PT_PER_PX).toBeCloseTo(WHOLE.height, 6);
  });

  it('leaves the caption its own band, above the graph and never over it', () => {
    const { image, page } = pdfPageGeometry(WHOLE);

    expect(image.y).toBe(PAGE_MARGIN_PT + PAGE_CAPTION_PT);
    expect(image.x).toBe(PAGE_MARGIN_PT);
    // …and the graph still ends inside the sheet.
    expect(image.y + image.height).toBeCloseTo(page.height - PAGE_MARGIN_PT, 6);
    expect(image.x + image.width).toBeCloseTo(page.width - PAGE_MARGIN_PT, 6);
  });
});

describe('which way up the page goes', () => {
  /** A single component chain is a long thin strip — 1601 x 148 px measured. */
  it('turns a component strip landscape', () => {
    const strip = pdfPageGeometry({ width: 1601, height: 148 });

    expect(strip.orientation).toBe('landscape');
    // jsPDF reads the pair against the orientation, so landscape gets [h, w].
    expect(strip.format).toEqual([strip.page.height, strip.page.width]);
  });

  /** The whole STARKCORE graph is taller than it is wide. */
  it('keeps a tall graph portrait', () => {
    const whole = pdfPageGeometry(WHOLE);

    expect(whole.orientation).toBe('portrait');
    expect(whole.format).toEqual([whole.page.width, whole.page.height]);
  });

  /**
   * The caption band makes a square image taller than it is wide, so the
   * boundary is decided on the PAGE and not on the image.
   */
  it('decides on the page, caption included', () => {
    expect(pdfPageGeometry({ width: 800, height: 800 }).orientation).toBe('portrait');
  });
});

describe('what the file is called', () => {
  const now = new Date(2026, 8, 4);

  it('carries the project, the subject and the day', () => {
    expect(exportFilename('FR1 RRU starkcore 12L', 'pdf', { now })).toBe(
      'FR1_RRU_starkcore_12L_network_20260904.pdf',
    );
  });

  /**
   * The mode decides what the picture SHOWS, so it belongs in the name: two
   * exports of one project in Temperature and in Rth are different documents,
   * and without it the second silently replaced the first.
   */
  it('carries the result mode the export was taken in', () => {
    expect(exportFilename('STARK', 'jpg', { mode: 'DeltaT', now })).toBe(
      'STARK_network_DeltaT_20260904.jpg',
    );
    expect(exportFilename('STARK', 'jpg', { mode: 'RthSource', now })).toBe(
      'STARK_network_RthSource_20260904.jpg',
    );
  });

  it('names a different subject differently, so the table is not the graph', () => {
    expect(exportFilename('STARK', 'pdf', { subject: 'results', now })).toBe(
      'STARK_results_20260904.pdf',
    );
  });

  it('pads a single-digit month and day', () => {
    expect(exportFilename('P', 'jpg', { now: new Date(2026, 0, 7) })).toBe(
      'P_network_20260107.jpg',
    );
  });

  /** A project name is free text and lands in a filesystem. */
  it('strips what a filename may not carry', () => {
    expect(exportFilename('A/B:C*?"<>|D', 'jpg', { now })).toBe('A_B_C_D_network_20260904.jpg');
  });

  it('still names the file when the project has no name', () => {
    expect(exportFilename('', 'pdf', { now })).toBe('project_network_20260904.pdf');
    expect(exportFilename('///', 'pdf', { now })).toBe('project_network_20260904.pdf');
  });
});

describe('the mode as a filename fragment', () => {
  /** Every mode has to fold to something a filesystem will take. */
  it('folds every mode to bare ASCII', () => {
    for (const mode of RESULT_MODES) {
      const part = modeFilenamePart(mode.id);
      expect(part, mode.id).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  /** The one that needed folding at all. */
  it('spells the delta out rather than shipping a Greek letter', () => {
    expect(modeFilenamePart('delta_t')).toBe('DeltaT');
  });

  it('says what the toolbar says', () => {
    expect(modeFilenamePart('temperature')).toBe('Temperature');
    expect(modeFilenamePart('heat_flow')).toBe('HeatFlow');
    expect(modeFilenamePart('rth_source')).toBe('RthSource');
  });
});
