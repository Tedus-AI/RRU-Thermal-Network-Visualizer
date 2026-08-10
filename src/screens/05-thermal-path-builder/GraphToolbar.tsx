/**
 * Graph toolbar — 05 §29, §30.
 *
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
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Select } from '@/ui/primitives';
import { BilingualTooltip } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

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
      title={`${label} / ${zh}`}
      className={`flex h-11 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent-500 bg-accent-100 text-accent-700'
          : 'border-transparent text-ink-500 hover:bg-surface-muted hover:text-ink-900'
      }`}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-line" />;

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
  onFit: () => void;
  onZoom: (delta: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onValidate: () => void;
  onTogglePorts: () => void;
  onToggleLabels: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface px-2 py-1.5">
      <ToolButton
        active={tool === 'select'}
        label="Select"
        zh="選取"
        icon={<MousePointer2 size={15} />}
        onClick={() => onTool('select')}
      />
      <ToolButton
        active={tool === 'pan'}
        label="Pan"
        zh="平移"
        icon={<Hand size={15} />}
        onClick={() => onTool('pan')}
      />
      <ToolButton
        active={tool === 'connect'}
        disabled={readOnly}
        label="Connect"
        zh="連接埠"
        icon={<Share2 size={15} />}
        onClick={() => onTool('connect')}
      />
      <ToolButton
        active={tool === 'add-node'}
        disabled={readOnly}
        label="Add Node"
        zh="新增節點"
        icon={<Plus size={15} />}
        onClick={() => onTool('add-node')}
      />
      <ToolButton
        active={tool === 'add-edge'}
        disabled={readOnly}
        label="Add Edge"
        zh="新增連線"
        icon={<Spline size={15} />}
        onClick={() => onTool('add-edge')}
      />

      <Divider />

      <ToolButton
        label="Undo"
        zh="復原"
        disabled={!canUndo || readOnly}
        icon={<Undo2 size={15} />}
        onClick={onUndo}
      />
      <ToolButton
        label="Redo"
        zh="重做"
        disabled={!canRedo || readOnly}
        icon={<Redo2 size={15} />}
        onClick={onRedo}
      />

      <Divider />

      <ToolButton
        label="Layout"
        zh="自動排列"
        icon={<Workflow size={15} />}
        onClick={onAutoLayout}
      />
      <Select
        aria-label="Layout mode / 版面模式"
        className="h-8 w-32 !text-[11px]"
        value={layoutMode}
        items={LAYOUT_MODES}
        onChange={(event) => onLayoutMode(event.target.value)}
      />
      <ToolButton label="Fit" zh="全覽" icon={<Maximize size={15} />} onClick={onFit} />

      <div className="ml-1 flex items-center gap-1">
        <button
          type="button"
          aria-label="Zoom out / 縮小"
          onClick={() => onZoom(-0.15)}
          className="flex size-7 items-center justify-center rounded border border-line-strong text-ink-500 hover:bg-surface-muted"
        >
          <ZoomOut size={13} />
        </button>
        <span className="w-12 text-center text-[11px] font-semibold tabular text-ink-700">
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

      <BilingualTooltip zh={TOOLTIPS_ZH.validate}>
        <ToolButton
          label="Validate"
          zh="驗證"
          icon={<CircleCheck size={15} />}
          onClick={onValidate}
        />
      </BilingualTooltip>
      <ToolButton
        active={showPorts}
        label="Ports"
        zh="連接埠"
        icon={<Share2 size={15} />}
        onClick={onTogglePorts}
      />
      <ToolButton
        active={showLabels}
        label="Labels"
        zh="標籤"
        icon={<Tags size={15} />}
        onClick={onToggleLabels}
      />
    </div>
  );
}
