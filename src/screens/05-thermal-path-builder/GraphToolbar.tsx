/**
 * Graph toolbar — 05 §29, §30.
 *
 * One row, as in `05.png`: tools, history, layout, zoom, then the view toggles.
 * The shared App Shell sidebar leaves the canvas narrower than the mockup's, so
 * the buttons are icon-only with bilingual tooltips instead of stacked labels.
 * Tools are modes on the canvas, not state of their own: the canvas asks this
 * component which mode is active and reports interactions back to the view,
 * which is the only thing allowed to mutate `networkStore` (05 §46).
 */

import {
  CircleCheck,
  Eye,
  Maximize,
  Maximize2,
  Minimize2,
  MousePointer2,
  Plus,
  Redo2,
  Share2,
  Spline,
  Tags,
  Undo2,
  Scan,
  Waypoints,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Select } from '@/ui/primitives';

export type CanvasTool = 'select' | 'connect' | 'add-node' | 'add-edge' | 'zoom-box';

export const LAYOUT_MODES = [
  { value: 'Auto', label: 'Auto' },
  { value: 'LeftRight', label: 'Left → Right' },
  { value: 'TopBottom', label: 'Top → Bottom' },
  { value: 'Free', label: 'Free' },
];

/** Same reason as `isResultMode`: a layout a previous build offered may be gone. */
export function isLayoutMode(value: unknown): value is string {
  return LAYOUT_MODES.some((mode) => mode.value === value);
}

function ToolButton({
  active,
  disabled,
  label,
  zh,
  icon,
  badge,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  zh: string;
  icon: ReactNode;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${label} / ${zh}`}
      title={`${label} / ${zh}`}
      className={`relative flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent-500 bg-accent-100 text-accent-700'
          : 'border-transparent text-ink-500 hover:bg-surface-muted hover:text-ink-900'
      }`}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-accent-600 px-1 text-center text-[9px] leading-4 font-bold text-white shadow-sm">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />;

/**
 * Select is the resting state, so every other mode toggles back to it.
 *
 * Connect, Add Node and Add Edge used to latch: once armed there was no way
 * off them but to pick a different tool, and clicking the lit button again did
 * nothing. Zoom to Region already toggled, which made the row inconsistent as
 * well as sticky.
 */
export const toggleTool = (current: CanvasTool, wanted: CanvasTool): CanvasTool =>
  current === wanted ? 'select' : wanted;

export function GraphToolbar({
  tool,
  layoutMode,
  zoom,
  showPorts,
  showLabels,
  canUndo,
  canRedo,
  readOnly,
  onTool,
  onLayoutMode,
  onAutoLayout,
  onAutoConnect,
  onFit,
  onZoom,
  onUndo,
  onRedo,
  onValidate,
  onTogglePorts,
  onToggleLabels,
  componentVisibilityOpen,
  hiddenComponentCount,
  onToggleComponentVisibility,
  fullscreen,
  onToggleFullscreen,
}: {
  tool: CanvasTool;
  layoutMode: string;
  zoom: number;
  showPorts: boolean;
  showLabels: boolean;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  onTool: (tool: CanvasTool) => void;
  onLayoutMode: (mode: string) => void;
  onAutoLayout: () => void;
  onAutoConnect: () => void;
  onFit: () => void;
  onZoom: (delta: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onValidate: () => void;
  onTogglePorts: () => void;
  onToggleLabels: () => void;
  componentVisibilityOpen: boolean;
  hiddenComponentCount: number;
  onToggleComponentVisibility: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center border-b border-line bg-surface px-2 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <ToolButton
          active={tool === 'select'}
          label="Select & Pan (drag blank canvas to move the view)"
          zh="選取與平移（拖曳空白處移動畫面）"
          icon={<MousePointer2 size={14} />}
          onClick={() => onTool('select')}
        />
        <ToolButton
          active={tool === 'connect'}
          disabled={readOnly}
          label="Connect Port"
          zh="連接埠"
          icon={<Share2 size={14} />}
          onClick={() => onTool(toggleTool(tool, 'connect'))}
        />
        <ToolButton
          active={tool === 'add-node'}
          disabled={readOnly}
          label="Add Node"
          zh="新增節點"
          icon={<Plus size={14} />}
          onClick={() => onTool(toggleTool(tool, 'add-node'))}
        />
        <ToolButton
          active={tool === 'add-edge'}
          disabled={readOnly}
          label="Add Edge (manual)"
          zh="新增連線（手動）"
          icon={<Spline size={14} />}
          onClick={() => onTool(toggleTool(tool, 'add-edge'))}
        />
        <ToolButton
          disabled={readOnly}
          label="Auto Connect"
          zh="依建議連接"
          icon={<Waypoints size={14} />}
          onClick={onAutoConnect}
        />

        <Divider />

        <ToolButton
          label="Undo"
          zh="復原"
          disabled={!canUndo || readOnly}
          icon={<Undo2 size={14} />}
          onClick={onUndo}
        />
        <ToolButton
          label="Redo"
          zh="重做"
          disabled={!canRedo || readOnly}
          icon={<Redo2 size={14} />}
          onClick={onRedo}
        />

        <Divider />

        <ToolButton
          label="Auto Layout"
          zh="自動排列"
          icon={<Workflow size={14} />}
          onClick={onAutoLayout}
        />
        {/*
          Wrapped rather than sized directly. `Select` carries `w-full` in its
          shared base class, and a `w-*` utility passed through `className` does
          not reliably beat it — so the select was claiming the full width of the
          toolbar and, being `shrink-0`, refusing to give any back. Everything to
          its right (zoom, fit, validate, the view toggles) was pushed outside
          the scroll area and could not be reached at all. Constraining the
          wrapper makes its `w-full` mean 100% of these 5.75rem.
        */}
        <div className="w-[5.75rem] shrink-0">
          <Select
            aria-label="Layout mode / 版面模式"
            className="h-8 !text-[11px]"
            value={layoutMode}
            items={LAYOUT_MODES}
            onChange={(event) => onLayoutMode(event.target.value)}
          />
        </div>
        {/* Marquee zoom and its way back. `Fit` is the only route to the whole
            network once you have zoomed into a corner, so the two sit together
            rather than the zoom being offered without an escape from it. */}
        <ToolButton
          active={tool === 'zoom-box'}
          label="Zoom to Region"
          zh="框選放大"
          icon={<Scan size={14} />}
          onClick={() => onTool(toggleTool(tool, 'zoom-box'))}
        />
        <ToolButton
          label="Fit Whole Network"
          zh="全網路顯示"
          icon={<Maximize size={14} />}
          onClick={onFit}
        />

        <div className="ml-1 flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out / 縮小"
            onClick={() => onZoom(-0.15)}
            className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 hover:bg-surface-muted"
          >
            <ZoomOut size={13} />
          </button>
          <span className="w-10 text-center text-[11px] font-semibold tabular text-ink-700">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in / 放大"
            onClick={() => onZoom(0.15)}
            className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 hover:bg-surface-muted"
          >
            <ZoomIn size={13} />
          </button>
        </div>

        <Divider />

        <ToolButton
          label="Validate"
          zh="驗證"
          icon={<CircleCheck size={14} />}
          onClick={onValidate}
        />
        <ToolButton
          active={showPorts}
          label="Show Ports"
          zh="顯示連接埠"
          icon={<Share2 size={14} />}
          onClick={onTogglePorts}
        />
        <ToolButton
          active={showLabels}
          label="Show Labels"
          zh="顯示標籤"
          icon={<Tags size={14} />}
          onClick={onToggleLabels}
        />
      </div>
      <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-line pl-1">
        {fullscreen && (
          <span data-component-visibility-toggle>
            <ToolButton
              active={componentVisibilityOpen}
              label="Component Visibility"
              zh="元件顯示"
              icon={<Eye size={14} />}
              badge={hiddenComponentCount}
              onClick={onToggleComponentVisibility}
            />
          </span>
        )}
        <ToolButton
          active={fullscreen}
          label={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          zh={fullscreen ? '離開全螢幕' : '全螢幕編輯'}
          icon={fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          onClick={onToggleFullscreen}
        />
      </div>
    </div>
  );
}
