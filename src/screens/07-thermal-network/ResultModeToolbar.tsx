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

import { biTitle } from '@/ui/FieldLabel';
import { GraphToolStrip } from './GraphToolStrip';
import { ResultModePills } from './ResultModePills';
import { RESULT_MODES, type ResultMode } from './resultViewModel';
import type { GraphDisplayOptions, SolvedCanvasTool } from './SolvedGraphCanvas';

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

      {/* The result table, which is a panel now rather than a row under the
          graph — see `ResultsOverlay`. It is the only FILLED button on a
          toolbar of ghost icons and outline pills, and the only one carrying
          both an icon and a word, which is what makes it findable: the mode
          pills do go accent when active, but none of them is a solid button.

          The face is short and the Chinese is in the tooltip, which is the
          convention its neighbours already follow — every icon button beside
          it shows no text at all. A bilingual face fitted, but only by wrapping
          the toolbar onto a second row and stealing back the graph height this
          change exists to give it.

          It lives here rather than on the page so fullscreen has it too, which
          the old row never did. */}
      <button
        type="button"
        onClick={onOpenResults}
        aria-label="Results / 求解結果"
        title={biTitle('Open the full result table', '開啟完整求解結果')}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-orange-600 px-2 py-1.5 text-[11px] font-bold text-white shadow-sm ring-1 ring-orange-700/40 transition-colors hover:bg-orange-500"
      >
        {/* The step number lives out here on the button rather than inside the
            panel it opens: it says which step of Screen 07 this IS, which is
            information you want before opening it, not after. */}
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-white text-[10px] font-bold text-orange-700 tabular">
          3
        </span>
        <Table2 size={13} />
        <span>Results</span>
        <span className="rounded bg-white/20 px-1 text-[10px] font-semibold tabular">
          {resultsSummary}
        </span>
      </button>

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
