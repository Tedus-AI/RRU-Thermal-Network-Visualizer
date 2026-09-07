/**
 * Screen 08's KPI row, after the simplification.
 *
 * The row was six cards on a tile half again as tall as the one 05 and 06 use,
 * and two of the six said something the screen already said elsewhere. These
 * check what went and that nothing went with it.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';

import { BottleneckKpiBar } from './BottleneckKpiBar';

const analysis = {
  state: 'WARNING',
  results: [
    {
      edge_id: 'E1',
      path_label: 'CMP_GTRB384608FC Local',
      classification: 'Critical',
      composite_score: 89,
    },
  ],
  summary: {
    top_bottleneck: 'GTRB384608FC 1 Junction → Case',
    top_score: 89,
    worst_margin_C: 0.7,
    best_improvement_C: 15,
    analyzed_edges: 83,
    failed_candidates: 0,
  },
} as unknown as BottleneckAnalysis;

const render = (props: Partial<Parameters<typeof BottleneckKpiBar>[0]> = {}) =>
  renderToStaticMarkup(
    <BottleneckKpiBar analysis={analysis} reductionPct={20} stale={false} {...props} />,
  );

describe('bottleneck KPI row', () => {
  it('shows four cards, not six', () => {
    const html = render();
    expect(html.match(/rounded-lg border border-line bg-surface/g)).toHaveLength(4);
    expect(html).toContain('Top Bottleneck');
    expect(html).toContain('Worst Margin');
    expect(html).toContain('Best 20% Rth Improvement');
    expect(html).toContain('Analyzed Edges');
  });

  it('drops the two cards the screen already said elsewhere', () => {
    const html = render();
    // The header badge next to the title says this in the same words.
    expect(html).not.toContain('Analysis Status');
    expect(html).not.toContain('分析狀態');
    // Top Score was a card of its own; it is now a line on the row it scores.
    expect(html).not.toContain('Top Score');
    expect(html).not.toContain('最高分數');
  });

  it('keeps the top score and its classification on the bottleneck card', () => {
    expect(render()).toContain('89/100 · Critical');
  });

  it('uses the same tile height as Screens 05 and 06', () => {
    // px-2 py-2 with a 13px first line — not 08's old px-3 py-2.5 and 15px.
    const html = render();
    expect(html).toContain('px-2 py-2');
    expect(html).not.toContain('px-3 py-2.5');
    expect(html).not.toContain('text-[15px]');
  });

  it('shows nothing as current while the analysis is stale', () => {
    const html = render({ stale: true });
    expect(html).toContain('N/A');
    expect(html).not.toContain('89/100');
  });
});
