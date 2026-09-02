/**
 * Drag-to-resize column headers for a plain HTML table.
 *
 * `useColumnWidths` owns the state and the persistence; `<ColumnResizer/>` is
 * the grab strip that goes inside a `<th>`. The table stays a `<table>` — this
 * is not a grid component — because everything else about it already works and
 * the ask was only that the columns be sizable.
 *
 * The table must be `table-fixed` for a `<colgroup>` width to be authoritative;
 * with the default auto layout the browser treats a width as a suggestion and
 * re-solves it against the content, so a dragged column would spring back.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampColumnWidth,
  readColumnWidths,
  writeColumnWidths,
  type ColumnWidths,
} from './columnWidths';

export function useColumnWidths(key: string, defaults: ColumnWidths) {
  const [widths, setWidths] = useState<ColumnWidths>(() => readColumnWidths(key, defaults));
  const drag = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    writeColumnWidths(key, widths);
  }, [key, widths]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const next = clampColumnWidth(active.startWidth + (event.clientX - active.startX));
    setWidths((current) =>
      current[active.id] === next ? current : { ...current, [active.id]: next },
    );
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    window.removeEventListener('pointermove', onPointerMove);
  }, [onPointerMove]);

  useEffect(() => () => endDrag(), [endDrag]);

  const startResize = useCallback(
    (id: string, event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      drag.current = { id, startX: event.clientX, startWidth: widths[id] ?? 0 };
      // On the window, not the handle: a fast drag outruns a 6px strip, and a
      // pointer that leaves it must keep resizing rather than stop dead.
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag, { once: true });
      window.addEventListener('pointercancel', endDrag, { once: true });
      // Held on the body so the cursor does not flicker back to a text caret
      // whenever the pointer crosses a cell mid-drag.
      document.body.style.setProperty('cursor', 'col-resize');
      document.body.style.setProperty('user-select', 'none');
    },
    [widths, onPointerMove, endDrag],
  );

  return { widths, startResize };
}

export function ColumnResizer({
  id,
  labelEn,
  labelZh,
  onResize,
}: {
  id: string;
  labelEn: string;
  labelZh: string;
  onResize: (id: string, event: React.PointerEvent) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${labelEn} column / 調整${labelZh}欄寬`}
      title={`Drag to resize / 拖曳調整欄寬`}
      onPointerDown={(event) => onResize(id, event)}
      // Sits astride the border so the target is the seam itself, and the
      // hairline only appears under the pointer — a permanent one on fifteen
      // columns would read as a grid.
      className="group absolute inset-y-0 -right-1 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center"
    >
      <span className="h-3/5 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-accent-600/60" />
    </span>
  );
}
