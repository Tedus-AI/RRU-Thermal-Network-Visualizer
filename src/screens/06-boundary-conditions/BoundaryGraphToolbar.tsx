import type { ReactNode } from 'react';
import {
  CircleCheck,
  Eye,
  Maximize,
  Maximize2,
  Minimize2,
  MousePointer2,
  Scan,
  Share2,
  Tags,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Select } from '@/ui/primitives';
import {
  LAYOUT_MODES,
  toggleTool,
  type CanvasTool,
} from '@/screens/05-thermal-path-builder/GraphToolbar';

function ToolButton({
  active,
  label,
  zh,
  icon,
  badge,
  onClick,
}: {
  active?: boolean;
  label: string;
  zh: string;
  icon: ReactNode;
  /** Count shown as a corner pip; omitted or 0 renders nothing. */
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} / ${zh}`}
      title={`${label} / ${zh}`}
      className={`relative flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
        active
          ? 'border-accent-500 bg-accent-100 text-accent-700'
          : 'border-transparent text-ink-500 hover:bg-surface-muted hover:text-ink-900'
      }`}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] leading-[0.9rem] font-bold text-white tabular"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />;

/** Screen 05 graph controls, with every topology-editing action intentionally removed. */
export function BoundaryGraphToolbar({
  tool,
  layoutMode,
  zoom,
  showPorts,
  showLabels,
  fullscreen,
  onTool,
  onLayoutMode,
  onAutoLayout,
  onFit,
  onZoom,
  onValidate,
  onTogglePorts,
  onToggleLabels,
  componentVisibilityOpen,
  hiddenComponentCount,
  onToggleComponentVisibility,
  onToggleFullscreen,
}: {
  tool: CanvasTool;
  layoutMode: string;
  zoom: number;
  showPorts: boolean;
  showLabels: boolean;
  fullscreen: boolean;
  onTool: (tool: CanvasTool) => void;
  onLayoutMode: (mode: string) => void;
  onAutoLayout: () => void;
  onFit: () => void;
  onZoom: (delta: number) => void;
  onValidate: () => void;
  onTogglePorts: () => void;
  onToggleLabels: () => void;
  componentVisibilityOpen: boolean;
  hiddenComponentCount: number;
  onToggleComponentVisibility: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center border-b border-line bg-surface px-2 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <ToolButton
          active={tool === 'select'}
          label="Select & Pan"
          zh="選取與平移"
          icon={<MousePointer2 size={14} />}
          onClick={() => onTool('select')}
        />
        <Divider />
        <ToolButton
          label="Auto Layout"
          zh="自動排列"
          icon={<Workflow size={14} />}
          onClick={onAutoLayout}
        />
        <div className="w-[5.75rem] shrink-0">
          <Select
            aria-label="Layout mode / 版面模式"
            className="h-8 !text-[11px]"
            value={layoutMode}
            items={LAYOUT_MODES}
            onChange={(event) => onLayoutMode(event.target.value)}
          />
        </div>
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
        {/* Not gated on fullscreen, unlike Screen 05: there the component
            palette down the left carries the same toggles, and here the left
            column is the boundary port list. */}
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
        <ToolButton
          active={fullscreen}
          label={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          zh={fullscreen ? '離開全螢幕' : '全螢幕檢視'}
          icon={fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          onClick={onToggleFullscreen}
        />
      </div>
    </div>
  );
}
