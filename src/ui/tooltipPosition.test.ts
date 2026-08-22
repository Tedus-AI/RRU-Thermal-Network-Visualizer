import { describe, expect, it } from 'vitest';

import { positionTooltip } from './tooltipPosition';

const viewport = { width: 1000, height: 700 };
const tooltip = { width: 240, height: 80 };

describe('positionTooltip', () => {
  it('centres above a trigger when there is room', () => {
    expect(
      positionTooltip(
        { left: 480, right: 520, top: 300, bottom: 320, width: 40 },
        tooltip,
        viewport,
        'center',
      ),
    ).toEqual({ left: 380, top: 214, placement: 'top' });
  });

  it('clamps a tooltip to the left viewport edge', () => {
    expect(
      positionTooltip(
        { left: 2, right: 22, top: 300, bottom: 320, width: 20 },
        tooltip,
        viewport,
        'center',
      ).left,
    ).toBe(8);
  });

  it('clamps a tooltip to the right viewport edge', () => {
    expect(
      positionTooltip(
        { left: 970, right: 990, top: 300, bottom: 320, width: 20 },
        tooltip,
        viewport,
        'left',
      ).left,
    ).toBe(752);
  });

  it('flips below a trigger near the top edge', () => {
    expect(
      positionTooltip(
        { left: 300, right: 340, top: 20, bottom: 40, width: 40 },
        tooltip,
        viewport,
        'center',
      ),
    ).toEqual({ left: 200, top: 46, placement: 'bottom' });
  });
});
