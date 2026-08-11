/**
 * Ranked Candidate Table — 08 §12.
 *
 * The columns are exactly the specification's list, in its order:
 *   Rank · Score · Edge · Path / Component · Type · Rth · Q · ΔT ·
 *   Sensitivity ΔT · Margin Impact · Affected Components · Confidence · Source
 *
 * Sorted by Score, descending. The Rth column carries the specification's own
 * caveat on its tooltip: it is displayed for engineering context and is not the
 * primary ranking metric.
 */

import { Badge } from '@/ui/primitives';
import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
import { CLASSIFICATION_COLOR, type BottleneckResult } from '@/thermal/analysis/analysisTypes';

import {
  CLASSIFICATION_ZH,
  CONFIDENCE_TONE,
  CONFIDENCE_ZH,
  num,
  rth as formatRth,
  signed,
} from './analysisViewModel';
import { T08 } from './tooltips';

/** 08 §12 — the exact tooltip the specification asks for on the Rth column. */
const RTH_CONTEXT_TOOLTIP =
  'Rth is displayed for engineering context but is not the primary ranking metric. / ' + T08.rth;

export function BottleneckRankingTable({
  results,
  selectedEdgeId,
  onSelect,
}: {
  results: BottleneckResult[];
  selectedEdgeId: string | null;
  onSelect: (edgeId: string) => void;
}) {
  return (
    <table className="w-full min-w-[62rem] border-collapse text-[11px]">
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
            <ColumnLabel label="Rth" zh="熱阻" unit="°C/W" tooltip={RTH_CONTEXT_TOOLTIP} />
          </th>
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Q" zh="熱流" unit="W" tooltip={T08.field.heatFlow} />
          </th>
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="ΔT" zh="溫差" unit="°C" tooltip={T08.field.deltaT} />
          </th>
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Sensitivity ΔT" zh="敏感度改善" unit="°C" tooltip={T08.sensitivity} />
          </th>
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Margin Impact" zh="餘裕改善" unit="°C" tooltip={T08.marginImpact} />
          </th>
          <th className="py-1.5 pr-1.5 text-right font-semibold">
            <ColumnLabel label="Affected" zh="受影響元件" tooltip={T08.affected} />
          </th>
          <th className="py-1.5 pr-1.5 font-semibold">
            <ColumnLabel label="Confidence" zh="信心度" tooltip={T08.field.confidence} />
          </th>
          <th className="py-1.5 font-semibold">
            <ColumnLabel label="Source" zh="來源" tooltip={T08.field.source} />
          </th>
        </tr>
      </thead>
      <tbody>
        {results.length === 0 ? (
          <tr>
            <td colSpan={13} className="py-8 text-center text-[11px] text-ink-400">
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
                  <span className="block max-w-[13rem] truncate font-semibold text-ink-900">
                    {result.edge_label}
                  </span>
                </td>
                <td className="py-1.5 pr-1.5">
                  <span className="block max-w-[9rem] truncate text-ink-500">{result.path_label}</span>
                </td>
                <td className="py-1.5 pr-1.5 text-ink-500">{result.edge_type}</td>
                <td className="py-1.5 pr-1.5 text-right tabular text-ink-500">
                  {formatRth(result.baseline.rth_C_per_W)}
                </td>
                <td className="py-1.5 pr-1.5 text-right tabular">
                  {num(result.baseline.heat_flow_W, 1)}
                </td>
                <td className="py-1.5 pr-1.5 text-right tabular">
                  {num(result.baseline.delta_T_C, 1)}
                </td>
                <td className="py-1.5 pr-1.5 text-right font-bold tabular text-ink-900">
                  {failed ? 'N/A' : num(result.sensitivity.target_improvement_C, 1)}
                </td>
                <td
                  className={`py-1.5 pr-1.5 text-right font-semibold tabular ${
                    result.sensitivity.margin_improvement_C > 0 ? 'text-ok-600' : 'text-ink-500'
                  }`}
                >
                  {failed ? 'N/A' : signed(result.sensitivity.margin_improvement_C, 1)}
                </td>
                <td className="py-1.5 pr-1.5 text-right tabular text-ink-500">
                  {failed ? 'N/A' : result.sensitivity.affected_component_count}
                </td>
                <td className="py-1.5 pr-1.5">
                  <Badge tone={CONFIDENCE_TONE[result.confidence]}>
                    <span title={CONFIDENCE_ZH[result.confidence]}>{result.confidence}</span>
                  </Badge>
                </td>
                <td className="py-1.5 text-ink-500">{result.baseline.rth_source}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
