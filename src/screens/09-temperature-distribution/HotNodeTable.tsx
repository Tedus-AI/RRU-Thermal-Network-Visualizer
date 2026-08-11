/**
 * Temperature Rank (Hot Node Table) — 09 §25, §26.
 *
 * Columns are exactly the specification's list: Rank, Node / Component,
 * Category, Node Type, Temperature, Limit Type, Limit, Margin, Zone,
 * Result Source.
 *
 * 09 §26 requires the heading to say TEMPERATURE RANK in as many words, so it is
 * never read as Screen 08's bottleneck rank. Sorting by how hot something is
 * says nothing about how much improving it would help — that is a different
 * question, answered on a different screen.
 */

import { Badge } from '@/ui/primitives';
import { ColumnLabel, EngineeringInfo } from '@/ui/FieldLabel';
import {
  STATUS_LABELS,
  type RankMode,
  type TemperatureRow,
} from '@/thermal/analysis/temperatureDataset';

import { STATUS_TONE, num, signed } from './distributionViewModel';
import { T09 } from './tooltips';

export const TOP_OPTIONS = [10, 20, 0] as const;

export const RANK_MODE_LABELS: Record<RankMode, { label: string; zh: string }> = {
  temperature: { label: 'Temperature Rank', zh: '溫度排名' },
  margin: { label: 'Margin Rank', zh: '餘裕排名' },
};

export function HotNodeTable({
  rows,
  rankMode,
  warningThreshold_C,
  selectedNodeId,
  onSelect,
}: {
  /** Already ranked and sliced by the caller. */
  rows: TemperatureRow[];
  rankMode: RankMode;
  warningThreshold_C: number;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <table className="w-full min-w-[46rem] border-collapse text-[11px]">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1.5 pr-2 font-semibold">
            <span className="flex items-center gap-1">
              <ColumnLabel label="Rank" zh="排名" />
              <EngineeringInfo
                zh={
                  rankMode === 'margin'
                    ? '依 thermal margin 由小到大排序；不是 Screen 08 的 Bottleneck Rank。'
                    : T09.temperatureRank
                }
                label={RANK_MODE_LABELS[rankMode].label}
                align="left"
              />
            </span>
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Node / Component" zh="節點 / 元件" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Category" zh="類別" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Node Type" zh="節點類型" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Temperature" zh="溫度" unit="°C" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Limit Type" zh="限制類型" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Limit" zh="限制值" unit="°C" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Margin" zh="餘裕" unit="°C" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Zone" zh="區域" />
          </th>
          <th className="py-1.5 font-semibold">
            <ColumnLabel label="Result Source" zh="結果來源" />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={10} className="py-8 text-center text-[11px] text-ink-400">
              No temperature data matches the current filters.
              <span className="block">目前的篩選條件沒有符合的溫度資料。</span>
            </td>
          </tr>
        ) : (
          rows.map((row, index) => {
            const hot = row.temperature_C > warningThreshold_C;
            return (
              <tr
                key={row.node_id}
                onClick={() => onSelect(row.node_id)}
                className={`cursor-pointer border-b border-line/60 transition-colors ${
                  selectedNodeId === row.node_id ? 'bg-accent-100' : 'hover:bg-surface-muted'
                }`}
              >
                <td className="py-1.5 pr-2 font-bold text-ink-900 tabular">{index + 1}</td>
                <td className="py-1.5 pr-2">
                  <span className="block max-w-[12rem] truncate font-semibold text-ink-900">
                    {row.node_name}
                  </span>
                  <span className="block max-w-[12rem] truncate text-[10px] text-ink-400">
                    {row.component_name ?? '—'}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-ink-500">{row.category ?? '—'}</td>
                <td className="py-1.5 pr-2 text-ink-500">{row.node_type}</td>
                <td
                  className={`py-1.5 pr-2 text-right font-bold tabular ${
                    hot ? 'text-danger-600' : 'text-ink-900'
                  }`}
                >
                  {row.temperature_C.toFixed(1)}
                </td>
                <td className="py-1.5 pr-2 text-ink-500">{row.limit_type ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                  {row.limit_C == null ? '—' : row.limit_C.toFixed(0)}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {row.margin_C == null ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    <span
                      className={`font-semibold tabular ${
                        row.status === 'over_limit'
                          ? 'text-danger-600'
                          : row.status === 'near_limit'
                            ? 'text-warn-600'
                            : 'text-ok-600'
                      }`}
                    >
                      {signed(row.margin_C, 1)}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-ink-500">{row.zone_id ?? '—'}</td>
                <td className="py-1.5">
                  <Badge tone={STATUS_TONE[row.status]}>
                    <span title={STATUS_LABELS[row.status].zh}>{row.result_source}</span>
                  </Badge>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

/** Used by the header line: "Showing 1 to 5 of 18 nodes". */
export function showingLabel(shown: number, total: number): string {
  if (total === 0) return 'No nodes in scope';
  return `Showing 1 to ${Math.min(shown, total)} of ${total} nodes`;
}

export { num };
