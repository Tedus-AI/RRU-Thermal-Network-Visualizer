/**
 * The metric switch — the one control that decides what the graph is a picture
 * of.
 *
 * Extracted from `ResultModeToolbar` because Screen 10's network window carries
 * this and nothing else from that toolbar: the rest of it (exports, layout,
 * component visibility, the Results button) is Screen 07's workshop, and a
 * window opened to look at a conclusion does not need the workshop. The pills
 * themselves must not drift between the two, which is why they live here rather
 * than being written twice.
 */

import { biTitle } from '@/ui/FieldLabel';

import type { ResultMode } from './resultViewModel';
import { T07 } from './tooltips';

export interface ResultModeOption {
  readonly id: string;
  readonly label: string;
  readonly zh: string;
  readonly needsSolution: boolean;
}

export function ResultModePills({
  modes,
  mode,
  hasResult,
  onMode,
}: {
  modes: readonly ResultModeOption[];
  mode: ResultMode;
  hasResult: boolean;
  onMode: (mode: ResultMode) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-line-strong p-0.5"
      role="group"
      aria-label={biTitle('Result mode', T07.field.resultMode)}
    >
      {modes.map((entry) => {
        const disabled = entry.needsSolution && !hasResult;
        return (
          <button
            key={entry.id}
            type="button"
            disabled={disabled}
            aria-pressed={mode === entry.id}
            title={
              disabled
                ? biTitle(`${entry.label} — solve first`, `${entry.zh}：請先求解`)
                : biTitle(entry.label, entry.zh)
            }
            onClick={() => onMode(entry.id as ResultMode)}
            className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === entry.id
                ? 'bg-accent-600 text-white'
                : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
            }`}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
