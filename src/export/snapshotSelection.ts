/**
 * What the snapshot matrix is a matrix OF.
 *
 * Screen 11 used to export two fixed pictures: the solved network, and a
 * bottleneck overlay. Both were drawn by code of their own, with their own
 * stylesheet and their own colour ramp, so the file an engineer opened was a
 * near-miss of the screen it claimed to be a snapshot of.
 *
 * What is wanted instead is a grid. Down the side are the SUBJECTS the tool
 * already draws -- the whole machine, each board's chain, each part that needs
 * attention -- and across the top are the result views Screen 07 offers.
 * A tick picks one picture; the export renders exactly the ticked ones.
 *
 * Nothing here decides how a graph looks. A subject is a pair of hidden-sets,
 * which is the same filtering Screen 07's canvas and the report's figures both
 * take, so the PNG is the picture the engineer has already been looking at.
 */

import type { NetworkFigure } from '@/report/networkFigures';
import {
  COMBINED_MODE,
  migrateResultMode,
  RESULT_VIEW_MODES,
  type ResultMode,
} from '@/screens/07-thermal-network/resultViewModel';

/**
 * The columns: the three views that colour by a solved number.
 *
 * Four until Temperature and ΔT became one. The matrix offers exactly what
 * Screens 07, 08 and 10 offer, because a snapshot that draws something no
 * screen draws is not a snapshot.
 */
export const SNAPSHOT_MODES = RESULT_VIEW_MODES;

export type SnapshotSubjectKind = 'whole' | 'group' | 'part';

export interface SnapshotSubject {
  /** `whole`, or the figure key it came from. */
  key: string;
  kind: SnapshotSubjectKind;
  label: string;
  label_zh: string;
  /** The subject's part of the file name. */
  slug: string;
  hidden_component_ids: ReadonlySet<string>;
  /** Everything left out under the default one-chain-per-part policy. */
  hidden_node_ids: ReadonlySet<string>;
  /** The part of the above that is repeated instances, and nothing else. */
  instance_node_ids: ReadonlySet<string>;
  /** Screen 08's numbered segments, where this subject is a part with a study. */
  tuned_edges?: ReadonlyMap<string, { rank: number; active: boolean }>;
}

/**
 * One chain per repeated part, or all of them.
 *
 * Only meaningful where a subject actually has a ×N component in it; a row with
 * nothing repeated shows no control rather than an inert one, because a choice
 * that changes nothing is worse than no choice.
 */
export type InstancePolicy = 'representative' | 'all';

export interface SnapshotSelection {
  /** Subject key → the views ticked on that row. */
  modes: Record<string, ResultMode[]>;
  /** Subject key → its instance policy; absent means `representative`. */
  instances: Record<string, InstancePolicy>;
}

/** True where the one-chain / all-chains choice does anything on this row. */
export function hasRepeats(subject: SnapshotSubject): boolean {
  return subject.instance_node_ids.size > 0;
}

/**
 * The rows, in the order they are read: the whole machine, then the boards,
 * then the parts that need attention.
 *
 * Derived from the report's own figures, so a board that this design does not
 * have is not an empty row, and the parts listed are the parts Screen 10 prints
 * figures for -- one answer to "which subjects are there", not two.
 */
export function snapshotSubjects(figures: readonly NetworkFigure[]): SnapshotSubject[] {
  const subjects: SnapshotSubject[] = [
    {
      key: 'whole',
      kind: 'whole',
      label: 'Whole Thermal Network',
      label_zh: '全域熱網路',
      slug: 'whole_network',
      hidden_component_ids: new Set<string>(),
      hidden_node_ids: new Set<string>(),
      // The whole machine is the one picture that is SUPPOSED to draw all four
      // chains of a ×4 part, so it has no instance choice to offer.
      instance_node_ids: new Set<string>(),
    },
  ];

  for (const figure of figures) {
    const group = figure.key.startsWith('group-');
    subjects.push({
      key: figure.key,
      kind: group ? 'group' : 'part',
      label: group ? figure.title : `Bottleneck · ${figure.title}`,
      label_zh: group ? figure.title_zh : `瓶頸 · ${figure.title_zh}`,
      slug: slugify(figure.key.replace(/^group-/, '').replace(/^part-/, 'part_')),
      hidden_component_ids: figure.hidden_component_ids,
      hidden_node_ids: figure.hidden_node_ids,
      instance_node_ids: figure.instance_node_ids,
      tuned_edges: figure.tuned_edges,
    });
  }

  return subjects;
}

/** What a row actually hides, once its instance policy is applied. */
export function hiddenNodesFor(
  subject: SnapshotSubject,
  policy: InstancePolicy,
): ReadonlySet<string> {
  if (policy !== 'all' || subject.instance_node_ids.size === 0) return subject.hidden_node_ids;
  // `all` puts the repeated chains back and leaves everything else hidden --
  // the nodes the heat never reaches are not instances and stay out.
  const hidden = new Set(subject.hidden_node_ids);
  for (const id of subject.instance_node_ids) hidden.delete(id);
  return hidden;
}

/**
 * The pictures a selection asks for, in reading order.
 *
 * Rows in the order `snapshotSubjects` returns them, and within a row the four
 * views in the order the column headers stand -- so the count under the matrix
 * and the files in the folder agree with what the grid looks like.
 */
export function snapshotPairs(
  subjects: readonly SnapshotSubject[],
  selection: SnapshotSelection,
): Array<{ subject: SnapshotSubject; mode: ResultMode; policy: InstancePolicy }> {
  const pairs: Array<{ subject: SnapshotSubject; mode: ResultMode; policy: InstancePolicy }> = [];
  for (const subject of subjects) {
    const ticked = new Set(selection.modes[subject.key] ?? []);
    if (ticked.size === 0) continue;
    const policy = selection.instances[subject.key] ?? 'representative';
    for (const mode of SNAPSHOT_MODES) {
      if (ticked.has(mode.id)) pairs.push({ subject, mode: mode.id, policy });
    }
  }
  return pairs;
}

export function snapshotCount(
  subjects: readonly SnapshotSubject[],
  selection: SnapshotSelection,
): number {
  return snapshotPairs(subjects, selection).length;
}

/**
 * What a project starts with: the whole machine in temperature.
 *
 * One picture rather than none, because an artifact ticked in the queue that
 * produces nothing is a failed export, and rather than the whole grid, because
 * forty PNGs nobody asked for is what the matrix exists to stop.
 */
export function defaultSnapshotSelection(): SnapshotSelection {
  return { modes: { whole: [COMBINED_MODE.id] }, instances: {} };
}

/** `Whole Thermal Network · Temperature + ΔT` — what the queue calls one image. */
export function snapshotLabel(subject: SnapshotSubject, mode: ResultMode): string {
  const view = SNAPSHOT_MODES.find((entry) => entry.id === mode);
  return `${subject.label} · ${view?.label ?? mode}`;
}

/** `whole_network__temperature.png`, inside `images/`. */
export function snapshotFilename(
  subject: SnapshotSubject,
  mode: ResultMode,
  policy: InstancePolicy,
): string {
  const suffix = policy === 'all' && subject.instance_node_ids.size > 0 ? '__all' : '';
  return `${subject.slug}__${mode}${suffix}.png`;
}

function slugify(value: string): string {
  return (
    value
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'figure'
  );
}

/**
 * Reads a stored selection back, keeping only what is still meaningful.
 *
 * Unknown view ids are dropped, which is what stops a hand-edited .tnv.json
 * from reaching the renderer with a mode nothing can draw. Ids that a previous
 * build offered and this one has merged are translated rather than dropped;
 * see `migrateResultMode`.
 *
 * `subjects` is optional and means "also drop rows this network does not have".
 * A project file can be older than the network it is opened against -- a board
 * removed, a bottleneck cleared -- so the screen passes its current rows and a
 * vanished one is forgotten rather than kept as a tick with nothing behind it.
 * The store restores WITHOUT it, because at load time the figures have not been
 * derived yet and a tick dropped then would be dropped for good.
 */
export function reconcileSnapshotSelection(
  stored: unknown,
  subjects?: readonly SnapshotSubject[],
): SnapshotSelection | null {
  if (stored == null || typeof stored !== 'object') return null;
  const raw = stored as { modes?: unknown; instances?: unknown };
  if (raw.modes == null || typeof raw.modes !== 'object') return null;

  const known = subjects ? new Set(subjects.map((subject) => subject.key)) : null;
  const offered = new Set<string>(SNAPSHOT_MODES.map((mode) => mode.id));

  const modes: Record<string, ResultMode[]> = {};
  for (const [key, value] of Object.entries(raw.modes as Record<string, unknown>)) {
    if ((known && !known.has(key)) || !Array.isArray(value)) continue;
    const kept: ResultMode[] = [];
    for (const entry of value) {
      // A file written before Temperature and ΔT merged has one or both of
      // them ticked. Both mean the view they became, and a row that had both
      // must not come back asking for the same picture twice.
      const mode = migrateResultMode(entry);
      if (mode && offered.has(mode) && !kept.includes(mode)) kept.push(mode);
    }
    if (kept.length > 0) modes[key] = kept;
  }

  const instances: Record<string, InstancePolicy> = {};
  if (raw.instances != null && typeof raw.instances === 'object') {
    for (const [key, value] of Object.entries(raw.instances as Record<string, unknown>)) {
      if (known && !known.has(key)) continue;
      if (value === 'all' || value === 'representative') instances[key] = value;
    }
  }

  return { modes, instances };
}
