/**
 * New row, same row, or neither.
 *
 * The saved-study flow has been wrong twice in the same place, both times in
 * the gap between "which state am I in" and "which button is live":
 *
 *   - editing a record had an entrance and no exit, so Add stayed grey and the
 *     only way out was to pick a different part;
 *   - then the exit cleared the cuts on its way out, so Add was grey again —
 *     for a second reason, with the reader's adjustment thrown away.
 *
 * The rule is three lines long and reads the same in both directions, which is
 * exactly why it belongs in a table rather than in three `disabled` props.
 */

import { describe, expect, it } from 'vitest';

import type { MarginRank } from '@/thermal/analysis/marginRanking';

import { studyButtons } from './analysisViewModel';
import { partOptions } from './PartPicker';

describe('studyButtons', () => {
  it('offers a new row on a dirty draft, and nothing on a clean one', () => {
    expect(studyButtons({ readOnly: false, editing: false, dirty: true })).toEqual({
      add: true,
      save: false,
      reset: true,
    });
    expect(studyButtons({ readOnly: false, editing: false, dirty: false })).toEqual({
      add: false,
      save: false,
      reset: false,
    });
  });

  it('offers the same row while a study is open, never a new one', () => {
    expect(studyButtons({ readOnly: false, editing: true, dirty: true })).toEqual({
      add: false,
      save: true,
      reset: true,
    });
    // Open but unchanged: there is nothing to write, and nothing to revert to.
    expect(studyButtons({ readOnly: false, editing: true, dirty: false })).toEqual({
      add: false,
      save: false,
      reset: false,
    });
  });

  /**
   * The bug the exit button was reported for: leaving a study has to leave Add
   * live, which it only can if the cuts survive the exit. `editing` goes false
   * and `dirty` stays true — the state right after Exit.
   */
  it('lights Add the moment a study is left with its cuts kept', () => {
    const editingIt = studyButtons({ readOnly: false, editing: true, dirty: true });
    const afterExit = studyButtons({ readOnly: false, editing: false, dirty: true });

    expect(editingIt.add).toBe(false);
    expect(afterExit.add).toBe(true);
    expect(afterExit.save).toBe(false);
  });

  /** Read-only writes nothing, but may still put the sliders back. */
  it('writes nothing at all in a read-only scenario', () => {
    for (const editing of [false, true]) {
      const gate = studyButtons({ readOnly: true, editing, dirty: true });
      expect(gate.add, `editing=${editing}`).toBe(false);
      expect(gate.save, `editing=${editing}`).toBe(false);
      expect(gate.reset, `editing=${editing}`).toBe(true);
    }
  });
});

/**
 * The part dropdown: every limited part, numbered by margin, the tight ones
 * under their own heading. The number is the one the whole-machine graph puts
 * on the part's badge, so it has to be the place in the FULL list.
 */
describe('partOptions', () => {
  const part = (name: string, margin_C: number): MarginRank => ({
    node_id: name,
    name,
    component_id: name,
    temperature_C: 100 - margin_C,
    limit_C: 100,
    limit_type: 'Tj',
    margin_C,
    power_W: 1,
  });

  it('numbers every part and heads the tight ones', () => {
    const options = partOptions([part('PM', 1.4), part('FPGA', 2.9), part('DDR', 6), part('PA', 40.6)]);
    expect(options.map((entry) => entry.value)).toEqual(['PM', 'FPGA', 'DDR', 'PA']);
    expect(options[0].label).toBe('1. PM　餘裕 +1.4 °C');
    expect(options[3].label).toBe('4. PA　餘裕 +40.6 °C');
    expect(options.map((entry) => entry.group)).toEqual([
      '需要注意（餘裕 ≤ 5 °C）',
      '需要注意（餘裕 ≤ 5 °C）',
      '其他元件',
      '其他元件',
    ]);
  });

  it('has no headings when nothing is close, and shows a part over its limit as negative', () => {
    expect(partOptions([part('A', 12), part('B', 40)]).map((entry) => entry.group)).toEqual([
      undefined,
      undefined,
    ]);
    expect(partOptions([part('A', -2.5)])[0].label).toBe('1. A　餘裕 -2.5 °C');
  });
});
