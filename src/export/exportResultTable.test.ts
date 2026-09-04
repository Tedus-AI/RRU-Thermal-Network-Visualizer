/**
 * Where the result table's PDF is cut.
 *
 * Slicing by pixel height alone puts a page break through the middle of a row,
 * which is the single thing that makes a generated PDF look generated. Cutting
 * between the component blocks instead keeps a part's whole chain — its nodes
 * and every edge under them — on one page wherever it fits.
 *
 * Only the arithmetic is tested here. Everything else in that module is DOM
 * plumbing: mounting the tree offscreen, measuring it and rasterizing it all
 * need a browser, which this suite has no DOM for.
 */

import { describe, expect, it } from 'vitest';

import { paginateRows } from './exportResultTable';

/** Blocks laid end to end, each `height` tall, as the real table renders. */
function stacked(...heights: number[]): Array<{ top: number; bottom: number }> {
  let cursor = 0;
  return heights.map((height) => {
    const row = { top: cursor, bottom: cursor + height };
    cursor += height;
    return row;
  });
}

describe('cutting the table into pages', () => {
  it('fills a page before starting the next', () => {
    expect(paginateRows(stacked(100, 100, 100, 100), 250)).toEqual([[0, 1], [2, 3]]);
  });

  it('keeps everything on one page when it fits', () => {
    expect(paginateRows(stacked(50, 50, 50), 500)).toEqual([[0, 1, 2]]);
  });

  /** The point of the exercise: a block is never split across the break. */
  it('never splits a block', () => {
    const pages = paginateRows(stacked(90, 90, 90, 90, 90), 200);

    expect(pages).toEqual([[0, 1], [2, 3], [4]]);
    // Every index appears exactly once, in order.
    expect(pages.flat()).toEqual([0, 1, 2, 3, 4]);
  });

  /**
   * A component with many nodes can be taller than a page on its own. It gets
   * a page to itself and overflows it — visible and honest — rather than being
   * silently dropped between two pages.
   */
  it('gives an oversized block its own page rather than losing it', () => {
    const pages = paginateRows(stacked(50, 900, 50), 300);

    expect(pages).toEqual([[0], [1], [2]]);
    expect(pages.flat()).toHaveLength(3);
  });

  it('measures each page from its own first block, not from the top', () => {
    // Without re-basing, page two would be measured from 0 and cut early.
    const pages = paginateRows(stacked(200, 200, 200, 200), 400);

    expect(pages).toEqual([[0, 1], [2, 3]]);
  });

  it('returns nothing for an empty table rather than one blank page', () => {
    expect(paginateRows([], 500)).toEqual([]);
  });

  /** Blocks are not always flush: a border or margin leaves a gap. */
  it('accounts for gaps between blocks', () => {
    const spaced = [
      { top: 0, bottom: 100 },
      { top: 110, bottom: 210 },
      { top: 220, bottom: 320 },
    ];

    expect(paginateRows(spaced, 215)).toEqual([[0, 1], [2]]);
  });
});
