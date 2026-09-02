import { describe, expect, it } from 'vitest';

import { marqueeRect, MIN_MARQUEE_PX, zoomRegionViewport } from './graphViewport';

const VIEW = { viewWidth: 800, viewHeight: 600, minZoom: 0.15, maxZoom: 3 };
const IDENTITY = { zoom: 1, pan: { x: 0, y: 0 } };

describe('zooming to a drawn region', () => {
  it('scales the region up until it runs out of room on one axis', () => {
    // 400×150 inside 800×600: width allows 2x, height allows 4x. Width wins.
    const next = zoomRegionViewport({
      box: { x1: 100, y1: 100, x2: 500, y2: 250 },
      current: IDENTITY,
      ...VIEW,
    })!;
    expect(next.zoom).toBeCloseTo(2, 6);
  });

  it('puts the region centre in the middle of the canvas', () => {
    const next = zoomRegionViewport({
      box: { x1: 100, y1: 100, x2: 500, y2: 250 },
      current: IDENTITY,
      ...VIEW,
    })!;
    // Region centre is model (300, 175) at zoom 1 with no pan.
    const centreOnScreen = {
      x: 300 * next.zoom + next.pan.x,
      y: 175 * next.zoom + next.pan.y,
    };
    expect(centreOnScreen.x).toBeCloseTo(400, 6);
    expect(centreOnScreen.y).toBeCloseTo(300, 6);
  });

  /** The box is in container pixels, so an existing pan and zoom both count. */
  it('reads the box against the viewport it was drawn on', () => {
    const next = zoomRegionViewport({
      box: { x1: 100, y1: 100, x2: 500, y2: 250 },
      current: { zoom: 2, pan: { x: -50, y: -30 } },
      ...VIEW,
      // Past the canvas's own ceiling on purpose: the clamp has its own test,
      // and this one is about the arithmetic underneath it.
      maxZoom: 10,
    })!;
    // Same rectangle on screen, but it now covers half as much model space,
    // so the target zoom is twice what it was from the identity viewport.
    expect(next.zoom).toBeCloseTo(4, 6);
    const centreModel = { x: (300 + 50) / 2, y: (175 + 30) / 2 };
    expect(centreModel.x * next.zoom + next.pan.x).toBeCloseTo(400, 6);
    expect(centreModel.y * next.zoom + next.pan.y).toBeCloseTo(300, 6);
  });

  it('never zooms past the canvas limits', () => {
    const tiny = zoomRegionViewport({
      box: { x1: 0, y1: 0, x2: 20, y2: 20 },
      current: IDENTITY,
      ...VIEW,
    })!;
    expect(tiny.zoom).toBe(VIEW.maxZoom);
  });

  /** A click that slipped is not a region, and must not throw the view away. */
  it('declines a region too small to be a deliberate drag', () => {
    expect(
      zoomRegionViewport({
        box: { x1: 10, y1: 10, x2: 10 + MIN_MARQUEE_PX - 1, y2: 400 },
        current: IDENTITY,
        ...VIEW,
      }),
    ).toBeNull();
  });

  it('declines a container that has not been laid out', () => {
    expect(
      zoomRegionViewport({
        box: { x1: 0, y1: 0, x2: 400, y2: 300 },
        current: IDENTITY,
        ...VIEW,
        viewWidth: 0,
        viewHeight: 0,
      }),
    ).toBeNull();
  });
});

describe('the rectangle painted during the drag', () => {
  it('normalises a box dragged up and to the left', () => {
    expect(marqueeRect({ x1: 300, y1: 200, x2: 100, y2: 50 })).toEqual({
      left: 100,
      top: 50,
      width: 200,
      height: 150,
    });
  });

  it('has nothing to paint when no drag is in progress', () => {
    expect(marqueeRect(null)).toBeNull();
  });
});
