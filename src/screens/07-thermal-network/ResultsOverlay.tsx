/**
 * The whole result table, over the graph rather than under it.
 *
 * It used to be a resizable row beneath the network, and the two were always
 * fighting for the same screen: 320 px of table is barely four groups expanded,
 * and taking more of it shrank the very graph the numbers describe. Neither one
 * was big enough, and the reader was paying for both at once.
 *
 * So it is a panel now, opened from the graph's own toolbar and covering almost
 * the whole window while it is open. The graph gets the height back; the table
 * gets enough room to read a whole chain without scrolling; and because the
 * button lives in the toolbar it is there in fullscreen too, where the old row
 * was not rendered at all.
 *
 * Two ways out, because a reader who opened it by accident should not have to
 * hunt: Escape, and the X. Escape is bound on the DOCUMENT, not on this element
 * — a `keydown` handler on a div only fires when focus is inside it, and this
 * panel opens with focus still on the button that opened it.
 */

import { useEffect, useId, useRef } from 'react';
import { FileText, Loader2, X } from 'lucide-react';

import { biTitle } from '@/ui/FieldLabel';

import { ResultTree } from './ResultTree';
import type { ResultTreeGroupRow } from './resultViewModel';

export function ResultsOverlay({
  groups,
  hasSolution,
  nodeCount,
  edgeCount,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onExportPdf,
  exporting,
  onClose,
}: {
  groups: ResultTreeGroupRow[];
  hasSolution: boolean;
  nodeCount: number;
  edgeCount: number;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onExportPdf: () => void;
  exporting: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Screen 07's canvas also listens for keys; this is the topmost thing on
      // screen, so it takes the press rather than letting it reach the graph.
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Focus moves in, so the next Tab walks the table rather than the toolbar
  // behind it, and a screen reader is told where it has been taken.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      // Above the fullscreen graph, which sits at z-30.
      className="fixed inset-0 z-50 flex items-center justify-center bg-shell-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-results-overlay
      onClick={onClose}
    >
      <div
        // As large as the window allows: the point of moving it here was room.
        className="flex h-[92vh] w-full max-w-[110rem] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        // The backdrop closes; the panel itself must not.
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-5 py-3">
          <span className="flex size-5 shrink-0 items-center justify-center rounded bg-orange-600 text-[11px] font-bold text-white tabular">
            3
          </span>
          <h2 id={titleId} className="min-w-0 truncate text-[15px] font-bold text-ink-900">
            Results <span className="font-semibold text-ink-400">/ 求解結果</span>
          </h2>
          <span className="shrink-0 text-[11px] text-ink-400">
            {groups.length} groups · {nodeCount} nodes · {edgeCount} edges
          </span>
          {/* The PDF carries the table FULLY EXPANDED, not whatever happens to
              be open — a report of the rows someone had unfolded is not a
              report. */}
          <button
            type="button"
            onClick={onExportPdf}
            disabled={exporting}
            aria-label="Export results as PDF / 輸出求解結果 PDF"
            title={biTitle('Export the whole table as PDF', '將完整表格輸出為 PDF')}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <FileText size={13} />
            )}
            PDF
          </button>
          <span className="shrink-0 text-[11px] text-ink-400">
            Esc <span className="text-ink-500">關閉</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close results / 關閉求解結果"
            title={biTitle('Close', '關閉')}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <ResultTree
            groups={groups}
            hasSolution={hasSolution}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={onSelectNode}
            onSelectEdge={onSelectEdge}
          />
        </div>
      </div>
    </div>
  );
}
