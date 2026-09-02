/**
 * The centring rules the component table's editors have to keep.
 *
 * These exist because a dropdown looked centred and was not: its BOX sat on the
 * column's centre line while its option text hugged the left edge, since a
 * <select> does not inherit `text-align` from the table the way an ordinary
 * cell does. An audit that measured boxes reported fifteen clean columns while
 * four were visibly wrong.
 *
 * So both invariants are pinned here: the control has to centre its own text,
 * and the padding around it has to stay symmetric — `.cell-select` supplies its
 * own arrow and its own equal padding, and a stray `px-*` would silently
 * override the right half of that and push the text back off centre.
 */

import { describe, expect, it } from 'vitest';

import { NUMBER_CELL, SELECT_CELL } from './ComponentTable';

describe('component table cell classes', () => {
  it('centres a dropdown, and lets it draw its own arrow', () => {
    expect(SELECT_CELL).toContain('text-center');
    expect(SELECT_CELL).toContain('cell-select');
  });

  it('leaves the dropdown padding to .cell-select', () => {
    // px-*/pl-*/pr-* here would beat the utility and unbalance the two sides.
    expect(SELECT_CELL).not.toMatch(/\bp[xlr]-/);
  });

  it('centres a number, without the spin-button gutter', () => {
    expect(NUMBER_CELL).toContain('text-center');
    expect(NUMBER_CELL).toContain('cell-number');
  });

  it('keeps every editor the same height, so the rows line up', () => {
    expect(SELECT_CELL).toContain('h-7');
    expect(NUMBER_CELL).toContain('h-7');
  });
});
