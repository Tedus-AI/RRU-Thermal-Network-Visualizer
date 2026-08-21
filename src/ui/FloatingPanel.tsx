/**
 * A draggable, resizable, NON-modal panel.
 *
 * Screens whose main content wants the full window width (04's component table)
 * cannot afford a permanently docked side panel, but the thing that panel held
 * is a long form the user edits while reading the table. A modal would hide the
 * table; a docked panel would shrink it. So: a window that floats above the
 * content, can be pushed out of the way, and never blocks a click behind it.
 *
 * Geometry is remembered per `storageKey`, and re-clamped to the viewport on
 * every open and every window resize — a position saved on a 27" monitor must
 * not strand the panel off-screen on a laptop.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 340;
const MIN_H = 260;
/** Keep this much of the panel on screen, so the header is always grabbable. */
const EDGE_KEEP = 64;

function clampRect(rect: PanelRect, vw: number, vh: number): PanelRect {
  const w = Math.min(Math.max(rect.w, MIN_W), Math.max(vw, MIN_W));
  const h = Math.min(Math.max(rect.h, MIN_H), Math.max(vh, MIN_H));
  return {
    w,
    h,
    x: Math.min(Math.max(rect.x, EDGE_KEEP - w), Math.max(vw - EDGE_KEEP, 0)),
    y: Math.min(Math.max(rect.y, 0), Math.max(vh - EDGE_KEEP, 0)),
  };
}

function readStored(key: string): PanelRect | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelRect>;
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.w === 'number' &&
      typeof parsed.h === 'number'
    ) {
      return parsed as PanelRect;
    }
  } catch {
    // A corrupt or unavailable store just means "no saved position".
  }
  return null;
}

/** Docked to the right, below the header — where a side panel used to be. */
function defaultRect(width: number, height: number): PanelRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(width, vw - 32);
  // Reach for the full window height: the point of the panel is to hold a whole
  // tab at once, and a form the user has to scroll is a form they misread.
  const h = Math.min(height, vh - 96);
  return { x: Math.max(vw - w - 24, 16), y: 72, w, h };
}

export function FloatingPanel({
  title,
  subtitle,
  badge,
  storageKey,
  defaultWidth = 560,
  defaultHeight = 900,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** localStorage key for the remembered geometry. */
  storageKey: string;
  defaultWidth?: number;
  defaultHeight?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const [rect, setRect] = useState<PanelRect>(() =>
    clampRect(
      readStored(storageKey) ?? defaultRect(defaultWidth, defaultHeight),
      window.innerWidth,
      window.innerHeight,
    ),
  );
  const [maximized, setMaximized] = useState(false);
  const drag = useRef<{ mode: 'move' | 'resize'; dx: number; dy: number; rect: PanelRect } | null>(
    null,
  );

  // Persist only deliberate geometry, never the maximized override.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(rect));
    } catch {
      // Storage being unavailable must not break the panel.
    }
  }, [storageKey, rect]);

  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r, window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (state.mode === 'move') {
      setRect(
        clampRect(
          { ...state.rect, x: event.clientX - state.dx, y: event.clientY - state.dy },
          vw,
          vh,
        ),
      );
    } else {
      setRect(
        clampRect(
          {
            ...state.rect,
            w: state.rect.w + (event.clientX - state.dx),
            h: state.rect.h + (event.clientY - state.dy),
          },
          vw,
          vh,
        ),
      );
    }
  }, []);

  const endDrag = useCallback((event: React.PointerEvent) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const startMove = (event: React.PointerEvent) => {
    if (maximized) return;
    drag.current = { mode: 'move', dx: event.clientX - rect.x, dy: event.clientY - rect.y, rect };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (event: React.PointerEvent) => {
    if (maximized) return;
    event.stopPropagation();
    drag.current = { mode: 'resize', dx: event.clientX, dy: event.clientY, rect };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const style = maximized
    ? { left: 16, top: 72, width: 'calc(100vw - 32px)', height: 'calc(100vh - 96px)' }
    : { left: rect.x, top: rect.y, width: rect.w, height: rect.h };

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl"
      style={style}
    >
      <header
        onPointerDown={startMove}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`flex shrink-0 items-start gap-2 border-b border-line bg-surface-muted px-3 py-2 ${
          maximized ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-[13px] font-bold text-ink-900">
            {title}
          </h2>
          {subtitle && <div className="truncate text-[11px] text-ink-400">{subtitle}</div>}
        </div>
        {badge}
        <button
          type="button"
          aria-label={maximized ? 'Restore panel size' : 'Maximize panel'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setMaximized((value) => !value)}
          className="rounded p-1 text-ink-500 hover:bg-surface hover:text-ink-900"
        >
          {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          aria-label="Close panel"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          className="rounded p-1 text-ink-500 hover:bg-surface hover:text-ink-900"
        >
          <X size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>

      {!maximized && (
        <div
          role="presentation"
          aria-hidden
          onPointerDown={startResize}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute right-0 bottom-0 size-4 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, var(--color-line-strong) 50%, var(--color-line-strong) 62%, transparent 62%, transparent 75%, var(--color-line-strong) 75%, var(--color-line-strong) 87%, transparent 87%)',
          }}
        />
      )}
    </section>
  );
}

export { clampRect, MIN_H, MIN_W };
