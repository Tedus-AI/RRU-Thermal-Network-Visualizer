export type TooltipAlign = 'left' | 'center';

export interface TooltipAnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface TooltipViewport {
  width: number;
  height: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
}

export const TOOLTIP_VIEWPORT_PADDING = 8;
export const TOOLTIP_GAP = 6;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Keeps a tooltip inside the viewport regardless of scroll containers around
 * its trigger. Above is preferred; below is used when the top edge is tight.
 */
export function positionTooltip(
  anchor: TooltipAnchorRect,
  tooltip: TooltipSize,
  viewport: TooltipViewport,
  align: TooltipAlign,
): TooltipPosition {
  const desiredLeft =
    align === 'left' ? anchor.left : anchor.left + anchor.width / 2 - tooltip.width / 2;
  const left = clamp(
    desiredLeft,
    TOOLTIP_VIEWPORT_PADDING,
    viewport.width - tooltip.width - TOOLTIP_VIEWPORT_PADDING,
  );

  const above = anchor.top - tooltip.height - TOOLTIP_GAP;
  const below = anchor.bottom + TOOLTIP_GAP;
  const fitsAbove = above >= TOOLTIP_VIEWPORT_PADDING;
  const fitsBelow = below + tooltip.height <= viewport.height - TOOLTIP_VIEWPORT_PADDING;
  const placement = fitsAbove || !fitsBelow ? 'top' : 'bottom';
  const desiredTop = placement === 'top' ? above : below;

  return {
    left,
    top: clamp(
      desiredTop,
      TOOLTIP_VIEWPORT_PADDING,
      viewport.height - tooltip.height - TOOLTIP_VIEWPORT_PADDING,
    ),
    placement,
  };
}
