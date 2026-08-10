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
  Hand,
  Maximize,
  MousePointer2,
  Plus,
  Redo2,
  Share2,
  Spline,
  Tags,
  Undo2,
  Waypoints,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Select } from '@/ui/primitives';

export type CanvasTool = 'select' | 'pan' | 'connect' | 'add-node' | 'add-edge';

export const LAYOUT_MODES = [
  { value: 'Auto', label: 'Auto' },
  { value: 'LeftRight', label: 'Left → Right' },
  { value: 'TopBottom', label: 'Top → Bottom' },
  { value: 'Hierarchical', label: 'Hierarchical' },
  { value: 'Free', label: 'Free' },
];

function ToolButton({
  active,
  disabled,
  label,
  zh,
  icon,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  zh: string;
  icon: ReactNode;
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
      className={`flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent-500 bg-accent-100 text-accent-700'
          : 'border-transparent text-ink-500 hover:bg-surface-muted hover:text-ink-900'
      }`}
    >
      {icon}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />;

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
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-2 py-1.5">
      <ToolButton
        active={tool === 'select'}
        label="Select"
        zh="選取"
        icon={<MousePointer2 size={14} />}
        onClick={() => onTool('select')}
      />
      <ToolButton
        active={tool === 'pan'}
        label="Pan"
        zh="平移"
        icon={<Hand size={14} />}
        onClick={() => onTool('pan')}
      />
      <ToolButton
        active={tool === 'connect'}
        disabled={readOnly}
        label="Connect"
        zh="連接埠"
        icon={<Share2 size={14} />}
        onClick={() => onTool('connect')}
      />
      <ToolButton
        active={tool === 'add-node'}
        disabled={readOnly}
        label="Add Node"
        zh="新增節點"
        icon={<Plus size={14} />}
        onClick={() => onTool('add-node')}
      />
      <ToolButton
        active={tool === 'add-edge'}
        disabled={readOnly}
        label="Add Edge"
        zh="新增連線"
        icon={<Spline size={14} />}
        onClick={() => onTool('add-edge')}
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
      <Select
        aria-label="Layout mode / 版面模式"
        className="h-8 w-[5.75rem] shrink-0 !text-[11px]"
        value={layoutMode}
        items={LAYOUT_MODES}
        onChange={(event) => onLayoutMode(event.target.value)}
      />
      <ToolButton label="Fit" zh="全覽" icon={<Maximize size={14} />} onClick={onFit} />

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
  );
}
