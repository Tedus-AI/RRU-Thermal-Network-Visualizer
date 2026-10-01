/**
 * The snapshot matrix, driven through its own controls.
 *
 * The panel is handed the rows the screen can derive, and hands back a whole
 * selection. With a stale solve that is the whole-machine row alone, and what
 * it hands back says nothing about the boards and parts it was never shown.
 * These tests press its real handlers and save the result the way the screen
 * does, so a tick made while stale is shown not to cost the hidden rows theirs.
 */

import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { NetworkFigure } from '@/report/networkFigures';
import {
  mergeVisibleSelection,
  snapshotSubjects,
  type SnapshotSelection,
} from '@/export/snapshotSelection';

import { SnapshotMatrixPanel } from './SnapshotMatrixPanel';

type Props = Record<string, unknown> & { children?: ReactNode };

/** Every intrinsic element in a tree that has no hooks of its own to run. */
function elements(node: ReactNode): ReactElement<Props>[] {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<Props>;
  if (typeof element.type === 'function') {
    return elements((element.type as (props: Props) => ReactNode)(element.props));
  }
  return [element, ...elements(element.props.children)];
}

const figure = (key: string, title: string): NetworkFigure => ({
  key,
  title,
  title_zh: title,
  note: '',
  note_zh: '',
  hidden_component_ids: new Set<string>(),
  hidden_node_ids: new Set<string>(),
  instance_node_ids: key === 'group-rf' ? new Set(['N_pa2']) : new Set<string>(),
});

const STORED: SnapshotSelection = {
  modes: { whole: ['temperature_delta'], 'group-rf': ['heat_flow', 'rth'], 'group-pw': ['rth'] },
  instances: { 'group-rf': 'all' },
};

/** Render the panel over `subjects`, press one control, and save as the screen does. */
function edit(
  subjects: ReturnType<typeof snapshotSubjects>,
  complete: boolean,
  press: (all: ReactElement<Props>[]) => void,
): SnapshotSelection {
  let saved: SnapshotSelection | null = null;
  const tree = SnapshotMatrixPanel({
    subjects,
    // The screen shows the stored selection reconciled to the rows it has.
    selection: {
      modes: Object.fromEntries(
        Object.entries(STORED.modes).filter(([key]) => subjects.some((s) => s.key === key)),
      ),
      instances: Object.fromEntries(
        Object.entries(STORED.instances).filter(([key]) => subjects.some((s) => s.key === key)),
      ),
    },
    disabled: false,
    onChange: (next) => {
      saved = mergeVisibleSelection(STORED, next, subjects, complete);
    },
  });
  press(elements(tree));
  if (!saved) throw new Error('the control did not report a change');
  return saved;
}

describe('a matrix edit while the solve is stale', () => {
  const wholeOnly = snapshotSubjects([]);

  it('keeps every hidden row when a cell is ticked', () => {
    const saved = edit(wholeOnly, false, (all) => {
      const cell = all.find((el) => el.props['aria-label'] === 'Whole Thermal Network · Heat Flow');
      (cell?.props.onChange as () => void)();
    });
    expect(saved).toEqual({
      modes: {
        whole: ['temperature_delta', 'heat_flow'],
        'group-rf': ['heat_flow', 'rth'],
        'group-pw': ['rth'],
      },
      instances: { 'group-rf': 'all' },
    });
  });

  it('keeps every hidden row when Clear All is pressed', () => {
    const saved = edit(wholeOnly, false, (all) => {
      const clear = all.find(
        (el) => typeof el.props.onClick === 'function' && /Clear All/.test(String(el.props.children)),
      );
      (clear?.props.onClick as () => void)();
    });
    expect(saved.modes).toEqual({ 'group-rf': ['heat_flow', 'rth'], 'group-pw': ['rth'] });
  });
});

describe('a matrix edit with every row on screen', () => {
  const full = snapshotSubjects([figure('group-rf', 'RF Chain'), figure('group-pw', 'PW Chain')]);

  it('saves exactly what the grid shows', () => {
    const saved = edit(full, true, (all) => {
      const policy = all.find((el) => el.props['aria-label'] === 'Repeated parts in RF Chain');
      (policy?.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: 'representative' },
      });
    });
    expect(saved).toEqual({ modes: STORED.modes, instances: {} });
  });
});
