/**
 * The right-hand tool strip of Screen 07's graph toolbar: layout, zoom,
 * component visibility, the two exports and fullscreen.
 *
 * Extracted so Screen 10's network window carries the same tools rather than a
 * second implementation of them. Everything here acts on the picture — how it
 * is laid out, how far in you are, what is hidden, and getting it out as a
 * file. What stays behind in `ResultModeToolbar` is what belongs to Screen 07
 * as a screen: the Results table button and its step number.
 */

import {
  Eye,
  FileImage,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Scan,
  Workflow,
} from 'lucide-react';

import { Select } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import { LAYOUT_MODES } from '@/screens/05-thermal-path-builder/GraphToolbar';

import type { SolvedCanvasTool } from './SolvedGraphCanvas';

export function IconButton({
  label,
  zh,
  active,
  badge,
  disabled,
  onClick,
  children,
}: {
  label: string;
  zh: string;
  active?: boolean;
  /** A count worth seeing without opening the control — as on Screen 05. */
  badge?: number;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={biTitle(label, zh)}
      aria-label={biTitle(label, zh)}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex size-7 items-center justify-center rounded border text-ink-500 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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

export function GraphToolStrip({
  tool,
  zoom,
  layoutMode,
  fullscreen,
  componentVisibilityOpen,
  hiddenComponentCount,
  exporting,
  onExportJpg,
  onExportPdf,
  onToggleComponentVisibility,
  onTool,
  onZoom,
  onLayoutMode,
  onRelayout,
  onToggleFullscreen,
}: {
  tool: SolvedCanvasTool;
  zoom: number;
  layoutMode: string;
  fullscreen: boolean;
  componentVisibilityOpen: boolean;
  hiddenComponentCount: number;
  /** Which export is in flight, so its own button can say so. */
  exporting: 'jpg' | 'pdf' | null;
  onExportJpg: () => void;
  onExportPdf: () => void;
  onToggleComponentVisibility: () => void;
  onTool: (tool: SolvedCanvasTool) => void;
  onZoom: (delta: number) => void;
  onLayoutMode: (mode: string) => void;
  onRelayout: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {/* Auto Layout and its mode, as on Screen 05: the button re-runs the
          layout, the select says which one. Both fit afterwards, which is why
          there is no separate Fit button here. */}
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
      {/* The level itself, so "why does this look wrong" has an answer that is
          not a guess. Same readout as Screens 05 and 06. */}
      <span className="w-10 text-center text-[11px] font-semibold tabular text-ink-700">
        {Math.round(zoom * 100)}%
      </span>
      <IconButton label="Zoom in" zh="放大" onClick={() => onZoom(0.15)}>
        <Plus size={13} />
      </IconButton>
      {/* Reading one part's chain means being able to put the other nine away
          for a moment — the same filter Screens 05 and 06 offer, and the badge
          says how many are currently away. */}
      <IconButton
        label="Component Visibility"
        zh="元件顯示"
        active={componentVisibilityOpen}
        badge={hiddenComponentCount}
        onClick={onToggleComponentVisibility}
      >
        <Eye size={13} />
      </IconButton>
      {/* Both exports render at model size rather than at the zoom on screen:
          the whole graph fits a 22" monitor only at about 51 %, and at 51 % the
          edge labels are unreadable. Disabled while one is running, because a
          second render would compete with the first for the same offscreen
          canvas. */}
      <IconButton
        label="Export JPG"
        zh="輸出 JPG（100% 尺寸）"
        disabled={exporting != null}
        onClick={onExportJpg}
      >
        {exporting === 'jpg' ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <FileImage size={13} />
        )}
      </IconButton>
      <IconButton
        label="Export PDF"
        zh="輸出 PDF（含各元件單頁）"
        disabled={exporting != null}
        onClick={onExportPdf}
      >
        {exporting === 'pdf' ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <FileText size={13} />
        )}
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
  );
}
