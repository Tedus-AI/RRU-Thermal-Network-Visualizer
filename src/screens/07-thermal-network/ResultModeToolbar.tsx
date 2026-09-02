/**
 * Graph toolbar — 07 §20, §27.
 *
 * Before a solve only Node Type, Rth and Rth Source are selectable (07 §20):
 * the result modes have nothing to colour and must not offer an empty picture
 * that reads as "everything is fine".
 *
 * 07 §27 forbids a Bottleneck Ranking control. There is none.
 */

import { Eye, Maximize2, Minimize2, Minus, Plus, Scan, Workflow } from 'lucide-react';

import { Select } from '@/ui/primitives';
import { LAYOUT_MODES } from '@/screens/05-thermal-path-builder/GraphToolbar';

import { biTitle } from '@/ui/FieldLabel';
import { RESULT_MODES, type ResultMode } from './resultViewModel';
import type { GraphDisplayOptions, SolvedCanvasTool } from './SolvedGraphCanvas';
import { T07 } from './tooltips';

function IconButton({
  label,
  zh,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  zh: string;
  active?: boolean;
  /** A count worth seeing without opening the control — as on Screen 05. */
  badge?: number;
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
      className={`relative flex size-7 items-center justify-center rounded border text-ink-500 transition-colors ${
        active
          ? 'border-accent-600 bg-accent-100 text-accent-700'
          : 'border-line-strong hover:bg-surface-muted'
      }`}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-accent-600 px-1 text-center text-[9px] leading-4 font-bold text-white shadow-sm">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
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
  tool,
  zoom,
  layoutMode,
  fullscreen,
  componentVisibilityOpen,
  hiddenComponentCount,
  onToggleComponentVisibility,
  onMode,
  onDisplay,
  onTool,
  onZoom,
  onLayoutMode,
  onRelayout,
  onToggleFullscreen,
}: {
  mode: ResultMode;
  hasResult: boolean;
  display: GraphDisplayOptions;
  tool: SolvedCanvasTool;
  zoom: number;
  layoutMode: string;
  fullscreen: boolean;
  componentVisibilityOpen: boolean;
  hiddenComponentCount: number;
  onToggleComponentVisibility: () => void;
  onMode: (mode: ResultMode) => void;
  onDisplay: (patch: Partial<GraphDisplayOptions>) => void;
  onTool: (tool: SolvedCanvasTool) => void;
  onZoom: (delta: number) => void;
  onLayoutMode: (mode: string) => void;
  onRelayout: () => void;
  onToggleFullscreen: () => void;
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
        {/* Auto Layout and its mode, as on Screen 05: the button re-runs the
            layout, the select says which one. Both fit afterwards, which is
            why there is no separate Fit button here. */}
        <IconButton label="Auto Layout" zh="自動排列" onClick={onRelayout}>
          <Workflow size={13} />
        </IconButton>
        <div className="w-[5.75rem] shrink-0">
          <Select
            aria-label="Layout mode / 版面模式"
            className="h-7 !text-[11px]"
            value={layoutMode}
            items={LAYOUT_MODES}
            onChange={(event) => onLayoutMode(event.target.value)}
          />
        </div>
        <IconButton
          label="Zoom to Region"
          zh="框選放大"
          active={tool === 'zoom-box'}
          onClick={() => onTool(tool === 'zoom-box' ? 'select' : 'zoom-box')}
        >
          <Scan size={13} />
        </IconButton>
        <IconButton label="Zoom out" zh="縮小" onClick={() => onZoom(-0.15)}>
          <Minus size={13} />
        </IconButton>
        {/* The level itself, so "why does this look wrong" has an answer that
            is not a guess. Same readout as Screens 05 and 06. */}
        <span className="w-10 text-center text-[11px] font-semibold tabular text-ink-700">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton label="Zoom in" zh="放大" onClick={() => onZoom(0.15)}>
          <Plus size={13} />
        </IconButton>
        {/* Reading one part's chain means being able to put the other nine
            away for a moment — the same filter Screens 05 and 06 offer, and
            the badge says how many are currently away. */}
        <IconButton
          label="Component Visibility"
          zh="元件顯示"
          active={componentVisibilityOpen}
          badge={hiddenComponentCount}
          onClick={onToggleComponentVisibility}
        >
          <Eye size={13} />
        </IconButton>
        <IconButton
          label={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          zh={fullscreen ? '離開全螢幕' : '全螢幕檢視'}
          active={fullscreen}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </IconButton>
      </div>
    </div>
  );
}
