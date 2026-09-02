/**
 * Column widths an engineer set by dragging, remembered per table.
 *
 * A fifteen-column table cannot be sized right for everyone at once: the
 * component names in one project are short codes and in another they carry the
 * manufacturer's part number, and whoever is reading wants a different column
 * wide each time. So the widths are theirs to set and ours to remember.
 *
 * Stored under the same `tnvui.` prefix as the resizable panels, and for the
 * same reason: `syncBuildStamp` clears the `tnv.` namespace whenever the build
 * changes, because project data written against an older schema cannot be
 * trusted. A column width has no schema.
 */

import { PANEL_STORAGE_PREFIX } from './panelSize';

/** Narrow enough for a checkbox column, wide enough to still be grabbable. */
export const COLUMN_MIN_PX = 44;
export const COLUMN_MAX_PX = 640;
/** Pointer movement under this is a click, not a drag — as on the panels. */
export { PANEL_CLICK_SLOP_PX as COLUMN_CLICK_SLOP_PX } from './panelSize';

export type ColumnWidths = Record<string, number>;

export function clampColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return COLUMN_MIN_PX;
  return Math.min(Math.max(Math.round(width), COLUMN_MIN_PX), COLUMN_MAX_PX);
}

/**
 * The remembered widths, merged over the table's own defaults.
 *
 * Defaults win for any column the stored entry does not mention, so adding a
 * column to a table does not leave it at zero width for everyone who had
 * already dragged another one.
 */
export function readColumnWidths(key: string, defaults: ColumnWidths): ColumnWidths {
  try {
    const raw = window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}columns.${key}`);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<ColumnWidths>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaults };
    const merged: ColumnWidths = { ...defaults };
    for (const [id, width] of Object.entries(parsed)) {
      // Only columns this table actually has, so a stale entry from a renamed
      // column cannot widen the table by a phantom.
      if (id in defaults && typeof width === 'number' && Number.isFinite(width)) {
        merged[id] = clampColumnWidth(width);
      }
    }
    return merged;
  } catch {
    // A corrupt or unavailable store just means "no remembered widths".
    return { ...defaults };
  }
}

export function writeColumnWidths(key: string, widths: ColumnWidths): void {
  try {
    window.localStorage.setItem(
      `${PANEL_STORAGE_PREFIX}columns.${key}`,
      JSON.stringify(widths),
    );
  } catch {
    // Storage being unavailable must not break the table.
  }
}
