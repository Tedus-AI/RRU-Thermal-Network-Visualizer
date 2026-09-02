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
  labelEn,
  labelZh,
  children,
}: {
  /** Which panel this is; the remembered size is kept per panel. */
  id: string;
  defaultHeight: number;
  /** Rendered inside the header row, which is always visible. */
  header: ReactNode;
  labelEn: string;
  labelZh: string;
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

  return (
    <section
      className="relative flex shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-surface"
      style={state.collapsed ? undefined : { height: state.size }}
    >
      {!state.collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize or collapse ${labelEn} / 調整或收合${labelZh}`}
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
            Click to collapse / 點擊收合
            <span className="block font-normal text-white/70">
              Drag to resize / 拖曳調整高度
            </span>
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={!state.collapsed}
        title={
          state.collapsed
            ? `Expand ${labelEn} / 展開${labelZh}`
            : `Collapse ${labelEn} / 收合${labelZh}`
        }
        className="flex w-full shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5 text-left"
      >
        {header}
        <ChevronDown
          size={14}
          className={`ml-auto shrink-0 text-ink-400 ${state.collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {!state.collapsed && <div className="min-h-0 flex-1 overflow-auto">{children}</div>}
    </section>
  );
}
