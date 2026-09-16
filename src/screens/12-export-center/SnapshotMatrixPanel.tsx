/**
 * The snapshot matrix — which picture, in which view.
 *
 * The PNG export used to be one tick that produced two fixed images, so an
 * engineer who wanted the RF chain in ΔT and the power chain in Rth got neither
 * and had to screenshot the tool instead. The subjects and the views are both
 * things this tool already has; the only thing missing was a way to say which
 * combination is wanted.
 *
 * So: subjects down the side, the result views across the top, one PNG per
 * ticked cell. A column header ticks its whole column and a row label ticks its
 * whole row, because "the RF chain in every view" and "everything in Rth" are
 * the two ways an engineer actually asks for a set of pictures.
 *
 * The count under the grid is the point of the whole panel. Ticking a column on
 * a nine-row matrix is nine files, and the number says so before the export
 * runs rather than afterwards in a folder.
 */

import { Button } from '@/ui/primitives';
import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
import type { ResultMode } from '@/screens/07-thermal-network/resultViewModel';
import {
  SNAPSHOT_MODES,
  hasRepeats,
  snapshotCount,
  type InstancePolicy,
  type SnapshotSelection,
  type SnapshotSubject,
} from '@/export/snapshotSelection';

export function SnapshotMatrixPanel({
  subjects,
  selection,
  onChange,
  disabled,
}: {
  subjects: readonly SnapshotSubject[];
  selection: SnapshotSelection;
  onChange: (selection: SnapshotSelection) => void;
  disabled: boolean;
}) {
  if (subjects.length === 0) {
    return (
      <p className="text-[11px] text-ink-500">
        No solved network to snapshot.
        <span className="ml-1 text-ink-400">尚無可快照的求解熱網路。</span>
      </p>
    );
  }

  const ticked = (subject: string, mode: ResultMode) =>
    (selection.modes[subject] ?? []).includes(mode);

  const withModes = (subject: string, modes: ResultMode[]): SnapshotSelection => {
    const next = { ...selection.modes };
    if (modes.length === 0) delete next[subject];
    else next[subject] = modes;
    return { ...selection, modes: next };
  };

  const toggleCell = (subject: string, mode: ResultMode) => {
    const current = selection.modes[subject] ?? [];
    onChange(
      withModes(
        subject,
        current.includes(mode) ? current.filter((entry) => entry !== mode) : [...current, mode],
      ),
    );
  };

  /** A row label sets its row to every view, or clears it — whichever it is not already. */
  const toggleRow = (subject: string) => {
    const full = (selection.modes[subject] ?? []).length === SNAPSHOT_MODES.length;
    onChange(withModes(subject, full ? [] : SNAPSHOT_MODES.map((mode) => mode.id)));
  };

  /** A column header does the same down its column. */
  const toggleColumn = (mode: ResultMode) => {
    const full = subjects.every((subject) => ticked(subject.key, mode));
    const modes = { ...selection.modes };
    for (const subject of subjects) {
      const current = modes[subject.key] ?? [];
      const next = full
        ? current.filter((entry) => entry !== mode)
        : current.includes(mode)
          ? current
          : [...current, mode];
      if (next.length === 0) delete modes[subject.key];
      else modes[subject.key] = next;
    }
    onChange({ ...selection, modes });
  };

  const setPolicy = (subject: string, policy: InstancePolicy) => {
    const instances = { ...selection.instances };
    if (policy === 'representative') delete instances[subject];
    else instances[subject] = policy;
    onChange({ ...selection, instances });
  };

  const total = snapshotCount(subjects, selection);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[10.5px] text-ink-500">
              <th className="py-1.5 pr-2 font-semibold">
                <ColumnLabel label="Subject" zh="快照對象" />
              </th>
              {SNAPSHOT_MODES.map((mode) => {
                const full = subjects.every((subject) => ticked(subject.key, mode.id));
                return (
                  <th key={mode.id} className="w-[7rem] py-1.5 text-center font-semibold">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleColumn(mode.id)}
                      title={biTitle(
                        `${full ? 'Clear' : 'Tick'} the whole ${mode.label} column`,
                        `${full ? '取消' : '勾選'}整欄 ${mode.zh}`,
                      )}
                      className="mx-auto flex flex-col items-center rounded px-1.5 py-0.5 text-center hover:bg-surface-200 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span className="text-ink-700">{mode.label}</span>
                      <span className="text-[10px] text-ink-400">{mode.zh}</span>
                    </button>
                  </th>
                );
              })}
              <th className="py-1.5 pl-2 text-right font-semibold">
                <ColumnLabel label="Repeated Parts" zh="重複元件" />
              </th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => {
              const repeats = hasRepeats(subject);
              const policy = selection.instances[subject.key] ?? 'representative';
              return (
                <tr
                  key={subject.key}
                  data-snapshot-subject={subject.key}
                  className="border-b border-line/60 align-middle text-[11px]"
                >
                  <td className="py-1.5 pr-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleRow(subject.key)}
                      title={biTitle(
                        `Tick or clear every view of ${subject.label}`,
                        `勾選或取消 ${subject.label_zh} 的所有視圖`,
                      )}
                      className="-ml-1 flex flex-col items-start rounded px-1 py-0.5 text-left hover:bg-surface-200 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <span className="font-semibold text-ink-900">{subject.label}</span>
                      <span className="text-[10px] text-ink-400">{subject.label_zh}</span>
                    </button>
                  </td>

                  {SNAPSHOT_MODES.map((mode) => (
                    <td key={mode.id} className="py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-accent-600"
                        checked={ticked(subject.key, mode.id)}
                        disabled={disabled}
                        aria-label={`${subject.label} · ${mode.label}`}
                        onChange={() => toggleCell(subject.key, mode.id)}
                      />
                    </td>
                  ))}

                  <td className="py-1.5 pl-2 text-right">
                    {/* Only where there IS a repeated part. A control that
                        cannot change the picture is worse than no control. */}
                    {repeats ? (
                      <select
                        className="h-6 rounded border border-line bg-surface-0 px-1 text-[10.5px] text-ink-700"
                        value={policy}
                        disabled={disabled}
                        aria-label={`Repeated parts in ${subject.label}`}
                        onChange={(event) =>
                          setPolicy(subject.key, event.target.value as InstancePolicy)
                        }
                      >
                        <option value="representative">One chain / 代表一路</option>
                        <option value="all">All chains / 全部</option>
                      </select>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="!h-7 !px-2 !text-[11px]"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...selection,
              modes: Object.fromEntries(
                subjects.map((subject) => [subject.key, SNAPSHOT_MODES.map((mode) => mode.id)]),
              ),
            })
          }
        >
          Select All / 全選
        </Button>
        <Button
          className="!h-7 !px-2 !text-[11px]"
          disabled={disabled}
          // The ticks, not the instance policies: an engineer who clears the
          // grid to pick again has not changed their mind about whether the RF
          // chain should draw one PA or four.
          onClick={() => onChange({ ...selection, modes: {} })}
        >
          Clear All / 全不選
        </Button>
        <span className="ml-auto text-[11px] font-semibold text-accent-700 tabular">
          {total} PNG{total === 1 ? '' : 's'} will be produced
          <span className="ml-1 font-normal text-ink-400">將產生 {total} 張 PNG</span>
        </span>
      </div>
    </div>
  );
}
