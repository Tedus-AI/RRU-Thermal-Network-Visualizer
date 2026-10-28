/**
 * The metric switch — the one control that decides what the graph is a picture
 * of.
 *
 * Extracted from `ResultModeToolbar` so the pills read the same wherever a
 * solved graph is drawn: the rest of that toolbar (exports, layout, component
 * visibility) is 07's workshop, and the pills themselves must not drift between
 * the screens that share them.
 *
 * The face is the Chinese name (07 §59); `label` stays English for filenames
 * and exports.
 */

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
      aria-label="圖面著色"
      title={T07.field.resultMode}
    >
      {modes.map((entry) => {
        const disabled = entry.needsSolution && !hasResult;
        return (
          <button
            key={entry.id}
            type="button"
            disabled={disabled}
            aria-pressed={mode === entry.id}
            title={disabled ? `${entry.zh}：請先求解` : entry.zh}
            onClick={() => onMode(entry.id as ResultMode)}
            className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === entry.id
                ? 'bg-accent-600 text-white'
                : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
            }`}
          >
            {entry.zh}
          </button>
        );
      })}
    </div>
  );
}
