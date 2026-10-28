/**
 * A stacked panel the engineer sizes and collapses from its top edge.
 *
 * The horizontal twin of `ResizableSidebar`, for a panel that sits BELOW the
 * thing it belongs to rather than beside it — Screen 07's results table under
 * the solved graph. Same bargain: drag the seam to any height, or click it to
 * fold the panel down to its own header, and the choice is remembered.
 *
 * Collapsed it keeps its header rather than becoming an anonymous strip, so the
 * row count stays readable and there is something obvious to click. The header
 * expands it too — a folded panel should not require finding a 10px seam.
 *
 * `emptyHint` folds it the same way while there is nothing in it, with the
 * hint saying how to fill it. That is not the reader's collapse: it is not
 * remembered, and the panel opens at the reader's own height and state as soon
 * as there is something to show (08 §35 — the empty 可調參數 panel).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Below this the table shows a header and nothing worth reading. */
export const PANE_MIN_PX = 120;
export const PANE_MAX_PX = 900;
/** The panel must never crowd out the graph it reports on. */
export const PANE_MAX_VIEWPORT_FRACTION = 0.7;

import {
  clampPanelSize,
  PANEL_CLICK_SLOP_PX,
  readPanelSize,
  writePanelSize,
  type PanelSizeState,
} from './panelSize';

export function clampPaneHeight(height: number, viewportHeight: number): number {
  return clampPanelSize(height, {
    min: PANE_MIN_PX,
    max: PANE_MAX_PX,
    viewport: viewportHeight,
    fraction: PANE_MAX_VIEWPORT_FRACTION,
  });
}

export function ResizablePane({
  id,
  defaultHeight,
  header,
  actions,
  labelZh,
  emptyHint,
  children,
}: {
  /** Which panel this is; the remembered size is kept per panel. */
  id: string;
  defaultHeight: number;
  /** Rendered inside the header row, which is always visible. */
  header: ReactNode;
  /**
   * Controls beside the header, OUTSIDE the expand/collapse button.
   *
   * A tab strip cannot live inside `header`: buttons do not nest, and a click
   * meant for a tab would collapse the panel on its way past. So the button
   * takes the label and the seam, and this takes the controls.
   */
  actions?: ReactNode;
  labelZh: string;
  /** Set while the panel has nothing to show: it folds to its header with this line. */
  emptyHint?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<PanelSizeState>(() => readPanelSize(id, defaultHeight));
  const [dragging, setDragging] = useState(false);
  // Where the pointer went down, and whether it has travelled far enough to be
  // a resize. Held in a ref so a move does not re-render on its own account.
  const gesture = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  useEffect(() => {
    writePanelSize(id, state);
  }, [id, state]);

  useEffect(() => {
    const onResize = () =>
      setState((current) => ({
        ...current,
        size: clampPaneHeight(current.size, window.innerHeight),
      }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    gesture.current = { startY: event.clientY, startHeight: state.size, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active) return;
    // Dragging the top edge UP makes the panel taller, so the delta is inverted.
    const dy = active.startY - event.clientY;
    if (!active.moved && Math.abs(dy) < PANEL_CLICK_SLOP_PX) return;
    active.moved = true;
    setState((current) => ({
      ...current,
      size: clampPaneHeight(active.startHeight + dy, window.innerHeight),
    }));
  };

  const endGesture = useCallback((event: React.PointerEvent) => {
    const active = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Went down and came up without travelling: that was a click.
    if (active && !active.moved) setState((current) => ({ ...current, collapsed: true }));
  }, []);

  const toggle = () => setState((current) => ({ ...current, collapsed: !current.collapsed }));
  const empty = Boolean(emptyHint);
  const collapsed = state.collapsed || empty;

  return (
    <section
      className="relative flex shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-surface"
      style={collapsed ? undefined : { height: state.size }}
      data-empty={empty || undefined}
    >
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={`調整或收合${labelZh}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          className="group absolute inset-x-0 -top-1 z-20 flex h-2.5 cursor-row-resize touch-none items-center justify-center"
        >
          <span
            className={`h-0.5 w-full rounded-full transition-colors ${
              dragging ? 'bg-accent-600' : 'bg-transparent group-hover:bg-accent-600/50'
            }`}
          />
          {/* Named on hover, because a seam that does two things has to say so. */}
          <span
            className={`pointer-events-none absolute top-4 left-1/2 z-30 w-max -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-[11px] leading-tight font-semibold text-white shadow-lg ${
              dragging ? 'hidden' : 'hidden group-hover:block'
            }`}
          >
            點一下收合
            <span className="block font-normal text-white/70">拖曳調整高度</span>
          </span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-line pr-3.5">
        {empty ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3.5">
            {header}
            <span className="min-w-0 truncate text-[11px] text-ink-400" title={emptyHint}>
              {emptyHint}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!state.collapsed}
            title={state.collapsed ? `展開${labelZh}` : `收合${labelZh}`}
            className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3.5 text-left"
          >
            {header}
            <ChevronDown
              size={14}
              className={`ml-auto shrink-0 text-ink-400 ${state.collapsed ? '-rotate-90' : ''}`}
            />
          </button>
        )}
        {actions && <span className="flex shrink-0 items-center gap-2">{actions}</span>}
      </div>

      {!collapsed && <div className="min-h-0 flex-1 overflow-auto">{children}</div>}
    </section>
  );
}
