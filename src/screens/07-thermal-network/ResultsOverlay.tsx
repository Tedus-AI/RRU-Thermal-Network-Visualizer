/**
 * The whole result table, as a window over the graph.
 *
 * It used to be a resizable row beneath the network, and the two were always
 * fighting for the same screen: 320 px of table is barely four groups expanded,
 * and taking more of it shrank the very graph the numbers describe. Neither one
 * was big enough, and the reader was paying for both at once.
 *
 * It then spent a while as a MODAL panel, which fixed the size and broke
 * something else: clicking a row selects a node, and the node inspector is a
 * floating panel — so the thing the click summoned opened behind the thing that
 * was clicked, unreadable. A modal is also the wrong promise. Reading a result
 * table against the graph is not a decision to be confirmed and dismissed; it
 * is two views of one answer, and both should be on screen and movable.
 *
 * So it is a window now: dragged where the reader wants it, sized how they
 * want, remembered, and stacked with the inspector so whichever was touched
 * last is on top. Escape still closes it, because a window opened from a
 * toolbar button should close the way every other panel does.
 */

import { useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';

import { biTitle } from '@/ui/FieldLabel';
import { FloatingPanel } from '@/ui/FloatingPanel';

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

  return (
    <FloatingPanel
      title="Results / 求解結果"
      subtitle={`${groups.length} groups · ${nodeCount} nodes · ${edgeCount} edges · Esc 關閉`}
      storageKey="tnvui.panel.07.results"
      // Wide by default: five columns and a component name that can carry a
      // manufacturer's part number.
      defaultWidth={1180}
      defaultHeight={760}
      badge={
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-orange-600 text-[11px] font-bold text-white tabular">
          3
        </span>
      }
      actions={
        <button
          type="button"
          onClick={onExportPdf}
          disabled={exporting}
          aria-label="Export results as PDF / 輸出求解結果 PDF"
          title={biTitle('Export the whole table as PDF', '將完整表格輸出為 PDF')}
          className="flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
          PDF
        </button>
      }
      bodyClassName=""
      onClose={onClose}
    >
      <ResultTree
        groups={groups}
        hasSolution={hasSolution}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onSelectNode={onSelectNode}
        onSelectEdge={onSelectEdge}
      />
    </FloatingPanel>
  );
}
