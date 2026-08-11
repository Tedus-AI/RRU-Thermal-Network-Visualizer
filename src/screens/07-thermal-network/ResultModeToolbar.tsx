/**
 * Graph toolbar — 07 §20, §27.
 *
 * Before a solve only Node Type, Rth and Rth Source are selectable (07 §20):
 * the result modes have nothing to colour and must not offer an empty picture
 * that reads as "everything is fine".
 *
 * 07 §27 forbids a Bottleneck Ranking control. There is none.
 */

import { Crosshair, LayoutGrid, Maximize, Minus, Plus } from 'lucide-react';

import { biTitle } from '@/ui/FieldLabel';
import { RESULT_MODES, type ResultMode } from './resultViewModel';
import type { GraphDisplayOptions } from './SolvedGraphCanvas';
import { T07 } from './tooltips';

function IconButton({
  label,
  zh,
  active,
  onClick,
  children,
}: {
  label: string;
  zh: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={biTitle(label, zh)}
      aria-label={biTitle(label, zh)}
      aria-pressed={active}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded border text-ink-500 transition-colors ${
        active
          ? 'border-accent-600 bg-accent-100 text-accent-700'
          : 'border-line-strong hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

const TOGGLES: Array<{ key: keyof GraphDisplayOptions; label: string; zh: string }> = [
  { key: 'showLabels', label: 'Labels', zh: '標籤' },
  { key: 'showPower', label: 'Power', zh: '功率' },
  { key: 'showLimits', label: 'Limits', zh: '限制值' },
  { key: 'showBoundary', label: 'Boundary', zh: '邊界節點' },
];

export function ResultModeToolbar({
  mode,
  hasResult,
  display,
  onMode,
  onDisplay,
  onFit,
  onZoom,
  onRelayout,
}: {
  mode: ResultMode;
  hasResult: boolean;
  display: GraphDisplayOptions;
  onMode: (mode: ResultMode) => void;
  onDisplay: (patch: Partial<GraphDisplayOptions>) => void;
  onFit: () => void;
  onZoom: (delta: number) => void;
  onRelayout: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        className="flex items-center gap-0.5 rounded-md border border-line-strong p-0.5"
        role="group"
        aria-label={biTitle('Result mode', T07.field.resultMode)}
      >
        {RESULT_MODES.map((entry) => {
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
              onClick={() => onMode(entry.id)}
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

      <div className="flex items-center gap-1.5">
        {TOGGLES.map((toggle) => (
          <label
            key={toggle.key}
            title={biTitle(`Show ${toggle.label}`, `顯示${toggle.zh}`)}
            className="flex items-center gap-1 text-[11px] font-medium text-ink-500"
          >
            <input
              type="checkbox"
              className="size-3.5 accent-accent-600"
              checked={display[toggle.key] as boolean}
              onChange={(event) => onDisplay({ [toggle.key]: event.target.checked })}
            />
            {toggle.label}
          </label>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <IconButton
          label="Focus selection"
          zh="聚焦所選路徑"
          active={display.focusSelection}
          onClick={() => onDisplay({ focusSelection: !display.focusSelection })}
        >
          <Crosshair size={13} />
        </IconButton>
        <IconButton label="Auto layout" zh="自動排版" onClick={onRelayout}>
          <LayoutGrid size={13} />
        </IconButton>
        <IconButton label="Zoom out" zh="縮小" onClick={() => onZoom(-0.15)}>
          <Minus size={13} />
        </IconButton>
        <IconButton label="Zoom in" zh="放大" onClick={() => onZoom(0.15)}>
          <Plus size={13} />
        </IconButton>
        <IconButton label="Fit graph" zh="全覽" onClick={onFit}>
          <Maximize size={13} />
        </IconButton>
      </div>
    </div>
  );
}
