/**
 * A side panel the engineer sizes and collapses from ONE place: the seam.
 *
 * The screens that carry a graph (05, 06, 07) all had the same shape — a column
 * of panels, then the canvas — and two of them had grown a small chevron button
 * for collapsing it. That button is a separate thing to find, and it only ever
 * offered two widths: the one it shipped with, and none.
 *
 * Here the divider between the panel and the canvas does both jobs, the way an
 * editor's sidebar does: drag it to any width, or click it to collapse. Which
 * one happened is decided by how far the pointer moved, so neither gesture needs
 * its own target. The chosen width is remembered per screen, because the right
 * width depends on the screen — 06's boundary forms are wider than 07's solver
 * settings — and on the monitor the engineer is sitting at.
 *
 * Below `lg` the layout stacks and the panel is full width; there is no seam to
 * drag, so the splitter is not rendered and the stored width is ignored.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Deliberately OUTSIDE the `tnv.` namespace.
 *
 * `syncBuildStamp` clears every `tnv.` key when the running build changes,
 * because project data written against an older schema cannot be trusted. A
 * panel width has no schema and belongs to the person, not the project — losing
 * it on every deploy is exactly the annoyance this feature exists to remove.
 */
const SIDEBAR_STORAGE_PREFIX = 'tnvui.sidebar.';

/** Narrower than this and the panels inside start wrapping into unreadability. */
export const SIDEBAR_MIN_PX = 240;
export const SIDEBAR_MAX_PX = 760;
/** Pointer movement under this is a click, not a drag. */
export const SIDEBAR_CLICK_SLOP_PX = 4;
/** The panel must never eat the canvas it exists to annotate. */
export const SIDEBAR_MAX_VIEWPORT_FRACTION = 0.6;

export interface SidebarState {
  width: number;
  collapsed: boolean;
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const ceiling = Math.max(
    SIDEBAR_MIN_PX,
    Math.min(SIDEBAR_MAX_PX, Math.round(viewportWidth * SIDEBAR_MAX_VIEWPORT_FRACTION)),
  );
  if (!Number.isFinite(width)) return SIDEBAR_MIN_PX;
  return Math.min(Math.max(Math.round(width), SIDEBAR_MIN_PX), ceiling);
}

export function readSidebarState(key: string, defaultWidth: number): SidebarState {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarState>;
      if (typeof parsed.width === 'number' && Number.isFinite(parsed.width)) {
        return { width: parsed.width, collapsed: parsed.collapsed === true };
      }
    }
  } catch {
    // A corrupt or unavailable store just means "no remembered size".
  }
  return { width: defaultWidth, collapsed: false };
}

function writeSidebarState(key: string, state: SidebarState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage being unavailable must not break the panel.
  }
}

/** True while the layout is side-by-side, which is the only time width means anything. */
function useSideBySide(): boolean {
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return wide;
}

export function ResizableSidebar({
  id,
  defaultWidth,
  labelEn,
  labelZh,
  shortEn,
  shortZh,
  children,
}: {
  /** Which screen's sidebar this is; the remembered size is kept per screen. */
  id: string;
  defaultWidth: number;
  /** What the panel holds, for the collapsed strip's tooltip. */
  labelEn: string;
  labelZh: string;
  /** Two or three characters for the collapsed strip's vertical label. */
  shortEn: string;
  shortZh: string;
  children: ReactNode;
}) {
  const storageKey = `${SIDEBAR_STORAGE_PREFIX}${id}`;
  const [state, setState] = useState<SidebarState>(() => readSidebarState(storageKey, defaultWidth));
  const sideBySide = useSideBySide();
  const [dragging, setDragging] = useState(false);
  // Where the pointer went down, and whether it has travelled far enough to be
  // a resize. Held in a ref so a move does not re-render on its own account.
  const gesture = useRef<{ startX: number; startWidth: number; moved: boolean } | null>(null);

  useEffect(() => {
    writeSidebarState(storageKey, state);
  }, [storageKey, state]);

  // A width chosen on a 27" monitor must not swallow a laptop's canvas.
  useEffect(() => {
    const onResize = () =>
      setState((current) => ({
        ...current,
        width: clampSidebarWidth(current.width, window.innerWidth),
      }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    gesture.current = { startX: event.clientX, startWidth: state.width, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active) return;
    const dx = event.clientX - active.startX;
    if (!active.moved && Math.abs(dx) < SIDEBAR_CLICK_SLOP_PX) return;
    active.moved = true;
    setState((current) => ({
      ...current,
      width: clampSidebarWidth(active.startWidth + dx, window.innerWidth),
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

  const expand = () => setState((current) => ({ ...current, collapsed: false }));

  if (state.collapsed) {
    return (
      <button
        type="button"
        onClick={expand}
        aria-expanded={false}
        title={`Expand ${labelEn} / 展開${labelZh}`}
        aria-label={`Expand ${labelEn} / 展開${labelZh}`}
        className="flex h-9 w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[11px] font-semibold text-ink-500 hover:border-ink-400 hover:text-ink-900 lg:h-full lg:w-10 lg:flex-col"
      >
        <ChevronRight size={15} />
        <span className="hidden [writing-mode:vertical-rl] lg:block">
          {shortEn} / {shortZh}
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative flex w-full shrink-0 flex-col lg:h-full"
      style={sideBySide ? { width: state.width, flexBasis: state.width } : undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 lg:pr-3">
        {children}
      </div>

      {/* The seam. `group` so the hairline and the tooltip react to the same hover. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize or collapse ${labelEn} / 調整或收合${labelZh}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="group absolute inset-y-0 -right-1 z-20 hidden w-2.5 cursor-col-resize touch-none items-center justify-center lg:flex"
      >
        <span
          className={`h-full w-0.5 rounded-full transition-colors ${
            dragging ? 'bg-accent-600' : 'bg-transparent group-hover:bg-accent-600/50'
          }`}
        />
        {/* Named on hover, because a seam that does two things has to say so. */}
        <span
          className={`pointer-events-none absolute top-1/2 left-4 z-30 w-max -translate-y-1/2 rounded-md bg-ink-900 px-2 py-1 text-[11px] leading-tight font-semibold text-white shadow-lg ${
            dragging ? 'hidden' : 'hidden group-hover:block'
          }`}
        >
          Click to collapse / 點擊收合
          <span className="block font-normal text-white/70">
            Drag to resize / 拖曳調整寬度
          </span>
        </span>
      </div>
    </div>
  );
}
