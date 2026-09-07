/**
 * Ranked Candidate Table — 08 §12.
 *
 * The specification listed thirteen columns. Six of them answered a different
 * question than the one this screen exists to answer, and each was already one
 * row-click away in the inspector:
 *
 *   Rth, Q   — baseline context. §1 is "Bottleneck ≠ Maximum Rth", and a column
 *              of resistances next to a ranking invites exactly the reading the
 *              screen exists to prevent. ΔT stays: it is the drop actually being
 *              paid here, and it carries 0.35 of the score.
 *   Source   — "Analytical" on all 85 rows of STARKCORE. A column of one value.
 *   Confidence — a badge per row that matters when you act on a candidate, not
 *              while you are scanning for one. It is in the inspector, and a
 *              low-confidence candidate already raises a validation warning.
 *
 * The improvement columns are now driven by the target metric. Sensitivity ΔT
 * and Margin Impact were separate columns holding the SAME number whenever the
 * target was the worst margin — which is the default — so the target column
 * appears only when it is measuring something the margin column is not.
 */

import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
import {
  CLASSIFICATION_COLOR,
  TARGET_METRIC_LABELS,
  type BottleneckResult,
  type TargetMetric,
} from '@/thermal/analysis/analysisTypes';
import { Badge } from '@/ui/primitives';

import { CLASSIFICATION_ZH, num, signed } from './analysisViewModel';
import { T08 } from './tooltips';

export function BottleneckRankingTable({
  results,
  targetMetric,
  selectedEdgeId,
  onSelect,
}: {
  results: BottleneckResult[];
  targetMetric: TargetMetric;
  selectedEdgeId: string | null;
  onSelect: (edgeId: string) => void;
}) {
  // With the margin as the target, `target_improvement_C` and
  // `margin_improvement_C` are the same measurement of the same solve.
  const targetIsMargin = targetMetric === 'worst_thermal_margin';
  const columns = targetIsMargin ? 8 : 9;

  return (
    <table className="w-full min-w-[46rem] border-collapse text-[11px]">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1.5 pr-1.5 font-semibold">
            <ColumnLabel label="Rank" zh="排名" />
          </th>
          <th className="py-1.5 pr-1.5 font-semibold">
            <ColumnLabel label="Score" zh="分數" tooltip={T08.score} />
          </th>
          <th className="py-1.5 pr-1.5 font-semibold">
            <ColumnLabel label="Edge" zh="連線" />
          </th>
          <th className="py-1.5 pr-1.5 font-semibold">
            <ColumnLabel label="Path / Component" zh="路徑 / 元件" />
          </th>
          <th className="py-1.5 pr-1.5 font-semibold">
            <ColumnLabel label="Type" zh="類型" />
          </th>
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="ΔT now" zh="目前溫差" unit="°C" tooltip={T08.field.deltaT} />
          </th>
          {!targetIsMargin && (
            <th className="py-1.5 pr-1.5 text-right font-semibold">
              <ColumnLabel
                label={TARGET_METRIC_LABELS[targetMetric].label}
                zh={TARGET_METRIC_LABELS[targetMetric].zh}
                unit="°C"
                tooltip={T08.sensitivity}
              />
            </th>
          )}
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Margin Gain" zh="餘裕改善" unit="°C" tooltip={T08.marginImpact} />
          </th>
          <th className="py-1.5 text-right font-semibold">
            <ColumnLabel label="Affected" zh="受影響元件" tooltip={T08.affected} />
          </th>
        </tr>
      </thead>
      <tbody>
        {results.length === 0 ? (
          <tr>
            <td colSpan={columns} className="py-8 text-center text-[11px] text-ink-400">
              No ranked candidates yet. Run the analysis.
              <span className="block">尚無排名結果，請執行分析。</span>
            </td>
          </tr>
        ) : (
          results.map((result) => {
            const failed = result.sensitivity.solve_status === 'FAILED';
            return (
              <tr
                key={result.edge_id}
                onClick={() => onSelect(result.edge_id)}
                title={biTitle(`Inspect ${result.edge_label}`, '檢視此候選')}
                className={`cursor-pointer border-b border-line/60 transition-colors ${
                  selectedEdgeId === result.edge_id ? 'bg-accent-100' : 'hover:bg-surface-muted'
                }`}
              >
                <td className="py-1.5 pr-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: CLASSIFICATION_COLOR[result.classification] }}
                    />
                    <span className="font-bold text-ink-900 tabular">{result.rank}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-1.5">
                  {failed ? (
                    <Badge tone="danger">FAILED</Badge>
                  ) : (
                    <span
                      title={biTitle(
                        result.classification,
                        CLASSIFICATION_ZH[result.classification],
                      )}
                      className="inline-flex min-w-[2rem] justify-center rounded px-1.5 py-0.5 text-[11px] font-bold text-white tabular"
                      style={{ backgroundColor: CLASSIFICATION_COLOR[result.classification] }}
                    >
                      {result.score}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-1.5">
                  <span className="block max-w-[15rem] truncate font-semibold text-ink-900">
                    {result.edge_label}
                  </span>
                </td>
                <td className="py-1.5 pr-1.5">
                  <span className="block max-w-[10rem] truncate text-ink-500">
                    {result.path_label}
                  </span>
                </td>
                <td className="py-1.5 pr-1.5 text-ink-500">{result.edge_type}</td>
                <td className="py-1.5 pr-1.5 text-right tabular text-ink-500">
                  {num(result.baseline.delta_T_C, 1)}
                </td>
                {!targetIsMargin && (
                  <td className="py-1.5 pr-1.5 text-right font-semibold tabular text-ink-900">
                    {failed ? 'N/A' : num(result.sensitivity.target_improvement_C, 1)}
                  </td>
                )}
                <td
                  className={`py-1.5 pr-1.5 text-right font-bold tabular ${
                    result.sensitivity.margin_improvement_C > 0 ? 'text-ok-600' : 'text-ink-500'
                  }`}
                >
                  {failed ? 'N/A' : signed(result.sensitivity.margin_improvement_C, 1)}
                </td>
                <td className="py-1.5 text-right tabular text-ink-500">
                  {failed ? 'N/A' : result.sensitivity.affected_component_count}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
