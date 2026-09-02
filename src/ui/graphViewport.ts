/**
 * Turning a rectangle the engineer drew into a viewport.
 *
 * Shared by Screen 05/06's editable canvas and Screen 07's solved one. The two
 * are different components for good reasons — one edits topology, the other
 * colours a result — but "zoom to the region I just dragged" is the same
 * arithmetic, and two copies of it would drift.
 */

/** Anything smaller than this is a click that slipped, not a chosen region. */
export const MIN_MARQUEE_PX = 12;

/**
 * Zoom per wheel notch, as a multiplier. 1.03 is 3% a notch.
 *
 * This is the one number to change if the wheel feels too slow or too abrupt;
 * a browser's own zoom steps are nearer 1.10. Cytoscape's built-in
 * `wheelSensitivity` is not equivalent — it scales the raw delta, so the step
 * an engineer gets depends on their mouse and their OS.
 */
export const WHEEL_ZOOM_STEP = 1.03;

/**
 * One wheel notch, in notches, whatever the device reports.
 *
 * `deltaMode` is pixels on most mice, lines on some, pages on a few, and a
 * trackpad sends a stream of small pixel deltas rather than one notch — so the
 * delta is normalised to pixels first and a notch defined as 100 of them. A
 * trackpad flick then zooms smoothly instead of in jumps, and a mouse notch is
 * exactly one step.
 */
export function wheelNotches(event: WheelEvent): number {
  const perLine = 16;
  const perPage = 400;
  const pixels =
    event.deltaMode === 1
      ? event.deltaY * perLine
      : event.deltaMode === 2
        ? event.deltaY * perPage
        : event.deltaY;
  return pixels / 100;
}

export interface ViewportBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Viewport {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * The zoom and pan that make `box` — in CONTAINER pixels — fill the viewport.
 *
 * Rendered pixels map to model space as `model = (rendered - pan) / zoom`, so
 * the level that makes the region fill the viewport is whichever of the two
 * axes runs out of room first, and the pan is then whatever puts the region's
 * centre in the middle of the canvas.
 *
 * Null when there is nothing sensible to do: a region too small to be a
 * deliberate drag, or a container that has not been laid out yet.
 */
export function zoomRegionViewport(input: {
  box: ViewportBox;
  current: Viewport;
  viewWidth: number;
  viewHeight: number;
  minZoom: number;
  maxZoom: number;
}): Viewport | null {
  const { box, current, viewWidth, viewHeight } = input;
  const width = Math.abs(box.x2 - box.x1);
  const height = Math.abs(box.y2 - box.y1);
  if (width < MIN_MARQUEE_PX || height < MIN_MARQUEE_PX) return null;
  if (viewWidth <= 0 || viewHeight <= 0) return null;
  if (!(current.zoom > 0)) return null;

  const modelWidth = width / current.zoom;
  const modelHeight = height / current.zoom;
  const centreModel = {
    x: (Math.min(box.x1, box.x2) + width / 2 - current.pan.x) / current.zoom,
    y: (Math.min(box.y1, box.y2) + height / 2 - current.pan.y) / current.zoom,
  };

  const wanted = Math.min(viewWidth / modelWidth, viewHeight / modelHeight);
  const zoom = Math.min(Math.max(wanted, input.minZoom), input.maxZoom);

  return {
    zoom,
    pan: {
      x: viewWidth / 2 - centreModel.x * zoom,
      y: viewHeight / 2 - centreModel.y * zoom,
    },
  };
}

/** The rectangle to paint while the drag is in progress, in container pixels. */
export function marqueeRect(box: ViewportBox | null): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  if (!box) return null;
  return {
    left: Math.min(box.x1, box.x2),
    top: Math.min(box.y1, box.y2),
    width: Math.abs(box.x2 - box.x1),
    height: Math.abs(box.y2 - box.y1),
  };
}
