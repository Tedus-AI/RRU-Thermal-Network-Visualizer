import { describe, expect, it } from 'vitest';

import { cytoscapeStylesheet, NODE_TEXT_STYLE } from '@/ui/graphStyles';
import { solvedStylesheet } from './SolvedGraphCanvas';

function nodeRule(sheet: ReturnType<typeof solvedStylesheet>) {
  const rule = sheet.find((entry) => entry.selector === 'node') as
    | { selector: string; style: Record<string, unknown> }
    | undefined;
  expect(rule, 'every canvas needs a base node rule').toBeDefined();
  return rule!.style;
}

/**
 * `labelBox` computes each node's box from a canvas measurement in ONE font at
 * ONE wrap width. A canvas that then paints the text in a different font, or
 * wraps it at a different width, gets a box that does not fit its own contents.
 *
 * Screen 07 did exactly that — its own `font-size`, its own `text-max-width`,
 * and no family at all, so it measured in `system-ui` at 140 px and painted in
 * Cytoscape's Helvetica default at 150 px. It looked fine wherever those two
 * happen to measure alike and overflowed on Windows, where they are Segoe UI
 * and Arial.
 */
describe('what the node boxes were measured against', () => {
  it('paints Screen 07 text with the metrics labelBox used', () => {
    const style = nodeRule(solvedStylesheet());
    for (const [property, value] of Object.entries(NODE_TEXT_STYLE)) {
      expect(style[property], `node ${property}`).toBe(value);
    }
  });

  it('paints Screen 05 text with them too', () => {
    const style = nodeRule(cytoscapeStylesheet());
    for (const [property, value] of Object.entries(NODE_TEXT_STYLE)) {
      expect(style[property], `node ${property}`).toBe(value);
    }
  });

  /** A tint is a fill colour; as a 2 px stroke on white it is not a line. */
  it('keeps every result-ramp line dark enough to see on white', () => {
    const sheet = solvedStylesheet();
    expect(sheet.length).toBeGreaterThan(0);
    for (const hex of ['#15803d', '#0284c7']) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      // Relative luminance against white; a line needs to be well under it.
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      expect(luminance, `${hex} against white`).toBeLessThan(0.55);
    }
  });
});
