/**
 * Remembering how big a panel the engineer sized should be.
 *
 * Shared by the side panels (width) and the stacked ones (height): the storage
 * shape, the click-versus-drag threshold and the clamping rule are the same
 * question in two axes, and a panel that behaved differently depending on which
 * edge you grabbed would be a worse tool, not a more flexible one.
 */

/**
 * Deliberately OUTSIDE the `tnv.` namespace.
 *
 * `syncBuildStamp` clears every `tnv.` key when the running build changes,
 * because project data written against an older schema cannot be trusted. A
 * panel size has no schema and belongs to the person, not the project — losing
 * it on every deploy is exactly the annoyance this feature exists to remove.
 */
export const PANEL_STORAGE_PREFIX = 'tnvui.';

/** Pointer movement under this is a click, not a drag. */
export const PANEL_CLICK_SLOP_PX = 4;

export interface PanelSizeState {
  size: number;
  collapsed: boolean;
}

/**
 * The size the panel is allowed to take, in px.
 *
 * The viewport ceiling is the part that matters: a size chosen on a 27" monitor
 * must not swallow, on a laptop, the content the panel exists beside.
 */
export function clampPanelSize(
  size: number,
  bounds: { min: number; max: number; viewport: number; fraction: number },
): number {
  const ceiling = Math.max(
    bounds.min,
    Math.min(bounds.max, Math.round(bounds.viewport * bounds.fraction)),
  );
  if (!Number.isFinite(size)) return bounds.min;
  return Math.min(Math.max(Math.round(size), bounds.min), ceiling);
}

export function readPanelSize(key: string, defaultSize: number): PanelSizeState {
  try {
    const raw = window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelSizeState> & { width?: number };
      // `width` is what the side panels wrote before the two shared a shape.
      const stored = typeof parsed.size === 'number' ? parsed.size : parsed.width;
      if (typeof stored === 'number' && Number.isFinite(stored)) {
        return { size: stored, collapsed: parsed.collapsed === true };
      }
    }
  } catch {
    // A corrupt or unavailable store just means "no remembered size".
  }
  return { size: defaultSize, collapsed: false };
}

export function writePanelSize(key: string, state: PanelSizeState): void {
  try {
    window.localStorage.setItem(`${PANEL_STORAGE_PREFIX}${key}`, JSON.stringify(state));
  } catch {
    // Storage being unavailable must not break the panel.
  }
}
