/**
 * What Screen 08 shows once a candidate is ranked, after the simplification.
 *
 * The ranking table dropped six columns and the inspector dropped three
 * sections; these check that what went is gone, that what replaced it is
 * present, and — the one with real behaviour behind it — that the improvement
 * columns follow the target metric instead of printing the same number twice.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BottleneckResult } from '@/thermal/analysis/analysisTypes';

import { BottleneckInspector } from './BottleneckInspector';
import { BottleneckRankingTable } from './BottleneckRankingTable';
import { ImprovementPreview } from './ImprovementPreview';

const result = {
  edge_id: 'E_FIN_AMB',
  rank: 1,
  edge_label: 'Fin Surface → Ambient',
  path_label: 'Boundary',
  edge_type: 'custom',
  baseline: {
    rth_C_per_W: 0.1196,
    heat_flow_W: 296.5,
    delta_T_C: 35.5,
    T_from_C: 80.5,
    T_to_C: 45,
    rth_source: 'Analytical',
    confidence: 'low',
  },
  sensitivity: {
    reduction_pct: 20,
    original_rth_C_per_W: 0.1196,
    modified_rth_C_per_W: 0.0957,
    baseline_target_C: 3,
    modified_target_C: 13.5,
    target_improvement_C: 10.5,
    baseline_worst_margin_C: 3,
    modified_worst_margin_C: 13.5,
    margin_improvement_C: 10.5,
    affected_component_count: 9,
    affected_components: [],
    energy_error_pct: 0,
    solve_status: 'SOLVED',
    message: null,
  },
  normalized: { delta_t: 1, sensitivity: 1, margin_impact: 1 },
  score: 81,
  classification: 'Critical',
  confidence: 'low',
  recommendation: {
    title: 'Review effective area, fin spacing and exposure',
    zh: '檢視有效面積、鰭片間距與外露條件',
    points: ['Check fin spacing', 'Check exposed area'],
  },
} as unknown as BottleneckResult;

const table = (metric: 'worst_thermal_margin' | 'worst_component_temperature') =>
  renderToStaticMarkup(
    <BottleneckRankingTable
      results={[result]}
      targetMetric={metric}
      selectedEdgeId={null}
      onSelect={vi.fn()}
    />,
  );

describe('ranking table', () => {
  it('drops the columns that answered a different question', () => {
    const html = table('worst_thermal_margin');
    for (const gone of ['Rth</', 'Q</', 'Confidence', 'Source', '熱阻來源']) {
      expect(html).not.toContain(gone);
    }
    // The row's own numbers went with the headers.
    expect(html).not.toContain('0.1196');
    expect(html).not.toContain('296.5');
  });

  it('keeps the columns that rank and the ones that say what to fix', () => {
    const html = table('worst_thermal_margin');
    for (const kept of ['Rank', 'Score', 'Edge', 'Path / Component', 'Type', 'ΔT now', 'Margin Gain', 'Affected']) {
      expect(html).toContain(kept);
    }
    expect(html).toContain('Fin Surface → Ambient');
    expect(html).toContain('+10.5');
    expect(html).toContain('35.5');
    expect(html).toContain('>9<');
  });

  it('shows one improvement column when the target IS the margin', () => {
    const html = table('worst_thermal_margin');
    // Sensitivity ΔT and Margin Impact held the same 10.5 as separate columns.
    expect(html).not.toContain('Worst Thermal Margin');
    expect(html.match(/10\.5/g)).toHaveLength(1);
  });

  it('adds the target column when the target is NOT the margin', () => {
    const html = table('worst_component_temperature');
    expect(html).toContain('Worst Component Temperature');
    // Both are shown, because now they can differ.
    expect(html.match(/10\.5/g)).toHaveLength(2);
  });
});

describe('candidate inspector', () => {
  const html = renderToStaticMarkup(
    <BottleneckInspector result={result} onFocusEdge={vi.fn()} />,
  );

  it('drops the placeholder mapping section', () => {
    expect(html).not.toContain('External Mapping');
    expect(html).not.toContain('Reserved / Deferred');
    expect(html).not.toContain('Not Available');
    // FloTHERM still appears once, inside the Rth Source tooltip listing where
    // a resistance can come from. That is a real field, not the placeholder.
    expect(html.match(/FloTHERM/g)).toHaveLength(1);
  });

  it('drops the score internals that were the same on every candidate', () => {
    expect(html).not.toContain('Score Weights');
    expect(html).not.toContain('Normalized');
  });

  it('drops the sensitivity rows the Improvement Preview already shows', () => {
    expect(html).not.toContain('Sensitivity Details');
    expect(html).not.toContain('Modified Rth');
    expect(html).not.toContain('Baseline Worst Margin');
  });

  it('has no tab strip left to select between three sections', () => {
    expect(html).not.toContain('>Overview<');
    expect(html).not.toContain('>Mapping<');
  });

  it('keeps what the candidate is, is doing, helps, and needs', () => {
    expect(html).toContain('Fin Surface → Ambient');
    expect(html).toContain('Baseline');
    expect(html).toContain('0.1196'); // Rth moved here from the table
    expect(html).toContain('296.50'); // so did Q
    expect(html).toContain('Affected Components');
    expect(html).toContain('Review effective area, fin spacing and exposure');
    expect(html).toContain('low'); // confidence moved here from the table
  });
});

describe('improvement preview', () => {
  const html = renderToStaticMarkup(
    <ImprovementPreview
      result={result}
      targetMetric="worst_thermal_margin"
      reductionPct={20}
      readOnly={false}
      proposalExists={false}
      onCreateProposal={vi.fn()}
    />,
  );

  it('drops the energy-balance row whose baseline was hard-coded to zero', () => {
    expect(html).not.toContain('Energy Balance');
    expect(html).not.toContain('能量平衡');
  });

  it('states the resistance change it is assuming', () => {
    expect(html).toContain('Edge Rth');
    expect(html).toContain('0.1196');
    expect(html).toContain('0.0957');
  });

  it('still shows the before, the after and the gain', () => {
    expect(html).toContain('3.0 °C');
    expect(html).toContain('13.5 °C');
    expect(html).toContain('+10.5 °C');
  });
});
