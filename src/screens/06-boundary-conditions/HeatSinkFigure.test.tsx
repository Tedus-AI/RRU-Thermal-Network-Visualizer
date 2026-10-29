/**
 * The heat sink figure is drawn from whatever the fin panel holds, and the
 * panel is often half filled. Every state has to draw without a NaN, every
 * number it prints has to be a field's or the fin result's, and a field still
 * empty has to read 未填 rather than as a number the figure made up.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { finArrayBoundary, type FinTechnology } from '@/thermal/boundary/finArray';

import { HeatSinkFigure, type HeatSinkGeometry } from './HeatSinkFigure';

function draw(
  geometry: Partial<HeatSinkGeometry>,
  technology: FinTechnology = 'Embedded',
  countOverride: number | null = null,
) {
  const g: HeatSinkGeometry = {
    baseL_mm: 336,
    baseW_mm: 275,
    baseT_mm: 7,
    finHeight_mm: 60.4,
    gap_mm: 11.6,
    thickness_mm: 1.2,
    draft_deg: technology === 'DieCasting' ? 1.25 : 0,
    ...geometry,
  };
  const result = finArrayBoundary({
    baseLength_mm: g.baseL_mm,
    baseWidth_mm: g.baseW_mm,
    finHeight_mm: g.finHeight_mm,
    gap_mm: g.gap_mm,
    thickness_mm: g.thickness_mm,
    technology,
    draftAngle_deg: g.draft_deg,
    finCountOverride: countOverride,
  });
  const html = renderToStaticMarkup(
    <HeatSinkFigure geometry={g} result={result} highlight={null} onHighlight={() => {}} />,
  );
  return { html, result };
}

const texts = (html: string) => [...html.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('heat sink figure', () => {
  it('draws starkCORE’s stack with its own numbers', () => {
    const { html, result } = draw({}, 'Embedded', 22);
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    const shown = texts(html);
    expect(shown).toEqual(expect.arrayContaining(['L 336', 'W 275', '22 片', '11.6', 't 1.2', '60.4']));
    expect(shown).toContain(`尖端超溫 ${Math.round(result!.tipExcessRatio * 100)}%`);
    // One silhouette per fin and one for the base.
    expect(html.match(/class="sh"/g)).toHaveLength(23);
    // A bonded stack has no draft, so no root thickness.
    expect(shown.some((text) => text.startsWith('根'))).toBe(false);
  });

  it('shows the root a die-cast draft thickens, from the fin result', () => {
    const { html, result } = draw({ gap_mm: 7.4, thickness_mm: 1.6 }, 'DieCasting');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    const shown = texts(html);
    expect(shown).toContain(`根 ${Number(result!.rootThickness_mm.toFixed(2))}`);
    expect(shown).toContain('拔模 1.25°');
    expect(shown).toContain(`${result!.fin_count} 片`);
  });

  it('reads 未填 for an empty field and draws no fins it does not know', () => {
    const { html, result } = draw({ finHeight_mm: null, gap_mm: null });
    expect(result).toBeNull();
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    const shown = texts(html);
    expect(shown).toEqual(expect.arrayContaining(['L 336', 'W 275', '片數 未定', '鰭片幾何未填齊高度、間隙']));
    expect(shown.some((text) => /^\d/.test(text))).toBe(false);
    expect(html).toContain('miss-ol');
    // The base is known and drawn; no fin is.
    expect(html.match(/class="sh"/g)).toHaveLength(1);
  });

  it('draws a missing base dashed too', () => {
    const { html } = draw({ baseL_mm: null, baseW_mm: null });
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    expect(texts(html)).toEqual(expect.arrayContaining(['L 未填', 'W 未填']));
    expect(html).not.toContain('class="sh"');
  });

  it('copes with one fin, two fins and a count too large to draw one by one', () => {
    for (const count of [1, 2, 900]) {
      const { html } = draw({}, 'Embedded', count);
      expect(html, `count ${count}`).not.toMatch(/NaN|Infinity|undefined/);
      expect(texts(html)).toContain(`${count} 片`);
    }
  });
});
