/**
 * Graph toolbar — 07 §20, §27.
 *
 * Before a solve only Node Type, Rth and Rth Source are selectable (07 §20):
 * the result modes have nothing to colour and must not offer an empty picture
 * that reads as "everything is fine".
 *
 * 07 §27 forbids a Bottleneck Ranking control. There is none.
 */

import { Table2 } from 'lucide-react';

import { GraphToolStrip } from './GraphToolStrip';
import { ResultModePills } from './ResultModePills';
import { RESULT_MODES, type ResultMode } from './resultViewModel';
import type { GraphDisplayOptions, SolvedCanvasTool } from './SolvedGraphCanvas';

const TOGGLES: Array<{ key: keyof GraphDisplayOptions; zh: string; tip: string }> = [
  { key: 'showLabels', zh: '標籤', tip: '在節點與連線旁顯示數值' },
  { key: 'showPower', zh: '功耗', tip: '在發熱節點旁顯示功耗' },
  { key: 'showLimits', zh: '限溫', tip: '在有限溫的節點旁顯示限溫' },
  { key: 'showBoundary', zh: '邊界', tip: '顯示環境與散熱表面的邊界節點' },
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
  showResultsButton = true,
  resultsSummary,
  exporting,
  onOpenResults,
  onExportJpg,
  onExportPdf,
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
  /**
   * 07 lists the components beside the graph and opens the full table from
   * there; only in fullscreen, where the list is gone, does the toolbar carry
   * the way to it.
   */
  showResultsButton?: boolean;
  /** "85 nodes · 85 edges", so the button says how much is behind it. */
  resultsSummary: string;
  /** Which export is in flight, so its own button can say so. */
  exporting: 'jpg' | 'pdf' | null;
  onOpenResults: () => void;
  onExportJpg: () => void;
  onExportPdf: () => void;
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
      <ResultModePills modes={RESULT_MODES} mode={mode} hasResult={hasResult} onMode={onMode} />

      <div className="flex items-center gap-1.5">
        {TOGGLES.map((toggle) => (
          <label
            key={toggle.key}
            title={toggle.tip}
            className="flex items-center gap-1 text-[11px] font-medium text-ink-500"
          >
            <input
              type="checkbox"
              className="size-3.5 accent-accent-600"
              checked={display[toggle.key] as boolean}
              onChange={(event) => onDisplay({ [toggle.key]: event.target.checked })}
            />
            {toggle.zh}
          </label>
        ))}
      </div>

      {/* The full result table — every node, every edge's drop, flow and
          resistance. 07's component list opens it beside the graph; this
          button is for fullscreen, where the list is not on screen. */}
      {showResultsButton && (
        <button
          type="button"
          onClick={onOpenResults}
          aria-label="完整結果表"
          title="每個節點的溫度、每段連線的溫差、熱流與熱阻；可輸出 PDF"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:bg-surface-muted"
        >
          <Table2 size={13} aria-hidden />
          <span>完整結果表</span>
          <span className="rounded bg-surface-muted px-1 text-[10px] font-semibold tabular text-ink-500">
            {resultsSummary}
          </span>
        </button>
      )}

      <div className="ml-auto">
        <GraphToolStrip
          tool={tool}
          zoom={zoom}
          layoutMode={layoutMode}
          fullscreen={fullscreen}
          componentVisibilityOpen={componentVisibilityOpen}
          hiddenComponentCount={hiddenComponentCount}
          exporting={exporting}
          onExportJpg={onExportJpg}
          onExportPdf={onExportPdf}
          onToggleComponentVisibility={onToggleComponentVisibility}
          onTool={onTool}
          onZoom={onZoom}
          onLayoutMode={onLayoutMode}
          onRelayout={onRelayout}
          onToggleFullscreen={onToggleFullscreen}
        />
      </div>
    </div>
  );
}
