import { describe, expect, it } from 'vitest';

import type { NetworkFigure } from '@/report/networkFigures';

import {
  defaultSnapshotSelection,
  hasRepeats,
  hiddenNodesFor,
  reconcileSnapshotSelection,
  snapshotCount,
  snapshotFilename,
  snapshotPairs,
  snapshotSubjects,
} from './snapshotSelection';

function figure(overrides: Partial<NetworkFigure> & { key: string }): NetworkFigure {
  return {
    title: overrides.key,
    title_zh: overrides.key,
    note: '',
    note_zh: '',
    hidden_component_ids: new Set<string>(),
    hidden_node_ids: new Set<string>(),
    instance_node_ids: new Set<string>(),
    ...overrides,
  };
}

const FIGURES: NetworkFigure[] = [
  figure({
    key: 'group-rf',
    title: 'RF Chain',
    title_zh: '射頻鏈路',
    hidden_component_ids: new Set(['C_fpga']),
    // Two instances dropped, plus one node the heat never reaches.
    hidden_node_ids: new Set(['N_pa2_j', 'N_pa3_j', 'N_far']),
    instance_node_ids: new Set(['N_pa2_j', 'N_pa3_j']),
  }),
  figure({
    key: 'group-pw',
    title: 'PW Chain',
    title_zh: '電源鏈路',
    hidden_component_ids: new Set(['C_pa']),
  }),
  figure({
    key: 'part-N_pm_case',
    title: 'Power Module',
    title_zh: 'Power Module',
  }),
];

describe('snapshotSubjects', () => {
  it('puts the whole network first and keeps the figures in order', () => {
    const subjects = snapshotSubjects(FIGURES);
    expect(subjects.map((subject) => subject.key)).toEqual([
      'whole',
      'group-rf',
      'group-pw',
      'part-N_pm_case',
    ]);
    expect(subjects[0].kind).toBe('whole');
    expect(subjects[1].kind).toBe('group');
    expect(subjects[3].kind).toBe('part');
  });

  it('hides nothing on the whole-network row', () => {
    const [whole] = snapshotSubjects(FIGURES);
    expect(whole.hidden_component_ids.size).toBe(0);
    expect(whole.hidden_node_ids.size).toBe(0);
  });

  it('marks a bottleneck row as one, in both languages', () => {
    const part = snapshotSubjects(FIGURES)[3];
    expect(part.label).toBe('Bottleneck · Power Module');
    expect(part.label_zh).toBe('瓶頸 · Power Module');
  });

  it('offers the instance choice only where something repeats', () => {
    const [whole, rf, pw] = snapshotSubjects(FIGURES);
    expect(hasRepeats(rf)).toBe(true);
    expect(hasRepeats(pw)).toBe(false);
    expect(hasRepeats(whole)).toBe(false);
  });
});

describe('hiddenNodesFor', () => {
  const rf = snapshotSubjects(FIGURES)[1];

  it('hides the other instances by default', () => {
    expect([...hiddenNodesFor(rf, 'representative')].sort()).toEqual([
      'N_far',
      'N_pa2_j',
      'N_pa3_j',
    ]);
  });

  it('puts the instances back for "all", and only the instances', () => {
    // The node the heat never reaches is not an instance and stays hidden --
    // "all chains" is not "the whole network again".
    expect([...hiddenNodesFor(rf, 'all')]).toEqual(['N_far']);
  });
});

describe('snapshotPairs', () => {
  const subjects = snapshotSubjects(FIGURES);

  it('reads row by row, and within a row in column order', () => {
    const pairs = snapshotPairs(subjects, {
      modes: { 'group-rf': ['delta_t', 'temperature'], whole: ['temperature'] },
      instances: {},
    });
    expect(pairs.map((pair) => `${pair.subject.key}/${pair.mode}`)).toEqual([
      'whole/temperature',
      'group-rf/temperature',
      'group-rf/delta_t',
    ]);
  });

  it('carries the row policy, defaulting to one chain', () => {
    const pairs = snapshotPairs(subjects, {
      modes: { 'group-rf': ['rth'], 'group-pw': ['rth'] },
      instances: { 'group-rf': 'all' },
    });
    expect(pairs.map((pair) => pair.policy)).toEqual(['all', 'representative']);
  });

  it('counts what the matrix says it will produce', () => {
    expect(
      snapshotCount(subjects, {
        modes: { whole: ['temperature', 'rth'], 'part-N_pm_case': ['delta_t'] },
        instances: {},
      }),
    ).toBe(3);
    expect(snapshotCount(subjects, { modes: {}, instances: {} })).toBe(0);
  });
});

describe('snapshotFilename', () => {
  const subjects = snapshotSubjects(FIGURES);

  it('names the subject and the view', () => {
    expect(snapshotFilename(subjects[0], 'temperature', 'representative')).toBe(
      'whole_network__temperature.png',
    );
    expect(snapshotFilename(subjects[3], 'rth', 'representative')).toBe(
      'part_n_pm_case__rth.png',
    );
  });

  it('separates the all-chains render from the one-chain render', () => {
    // Otherwise the second silently replaces the first in the folder.
    expect(snapshotFilename(subjects[1], 'delta_t', 'all')).toBe('rf__delta_t__all.png');
    // A row with nothing repeated has no second version to distinguish.
    expect(snapshotFilename(subjects[2], 'delta_t', 'all')).toBe('pw__delta_t.png');
  });
});

describe('reconcileSnapshotSelection', () => {
  const subjects = snapshotSubjects(FIGURES);

  it('keeps a stored selection that still matches', () => {
    expect(
      reconcileSnapshotSelection(
        { modes: { whole: ['temperature'] }, instances: { 'group-rf': 'all' } },
        subjects,
      ),
    ).toEqual({ modes: { whole: ['temperature'] }, instances: { 'group-rf': 'all' } });
  });

  it('drops rows this network no longer has', () => {
    expect(
      reconcileSnapshotSelection(
        { modes: { 'group-digital': ['temperature'], whole: ['rth'] }, instances: {} },
        subjects,
      ),
    ).toEqual({ modes: { whole: ['rth'] }, instances: {} });
  });

  it('drops view ids nothing can draw', () => {
    expect(
      reconcileSnapshotSelection({ modes: { whole: ['temperature', 'wat'] } }, subjects),
    ).toEqual({ modes: { whole: ['temperature'] }, instances: {} });
  });

  it('keeps every row when no subjects are given', () => {
    // How the store restores: the figures have not been derived at load time,
    // so a tick dropped there would be dropped for good.
    expect(
      reconcileSnapshotSelection({ modes: { 'group-digital': ['temperature'] } }),
    ).toEqual({ modes: { 'group-digital': ['temperature'] }, instances: {} });
  });

  it('refuses anything that is not a selection', () => {
    expect(reconcileSnapshotSelection(null)).toBeNull();
    expect(reconcileSnapshotSelection({ modes: 'all' })).toBeNull();
  });
});

describe('defaultSnapshotSelection', () => {
  it('starts with one picture, not none and not forty', () => {
    const subjects = snapshotSubjects(FIGURES);
    expect(snapshotCount(subjects, defaultSnapshotSelection())).toBe(1);
  });
});
