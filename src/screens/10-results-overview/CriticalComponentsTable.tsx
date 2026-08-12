/**
 * Critical Components — 10 §8.
 *
 * Columns are exactly the specification's list: Component, Node, Temperature,
 * Limit Type, Limit, Margin, Status. Rows are sorted by margin, low to high, and
 * the default view is the top 5 (AC-10-06).
 *
 * A component with several monitored nodes shows its WORST node, and says how
 * many it has — otherwise "PA1: 96.8 °C" would quietly hide a hotter case
 * reading behind a cooler junction one.
 */

import { Badge } from '@/ui/primitives';
import { ColumnLabel, EngineeringInfo } from '@/ui/FieldLabel';
import type { CriticalComponentSummary } from '@/thermal/overview/overviewTypes';

import { COMPONENT_TONE, num, signed } from './overviewViewModel';
import { T10 } from './tooltips';

export function CriticalComponentsTable({
  rows,
  selectedNodeId,
  onSelect,
}: {
  rows: CriticalComponentSummary[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[11px] text-ink-400">
        No solved component nodes are available.
        <span className="block">目前沒有可用的已求解元件節點。</span>
      </p>
    );
  }

  return (
    <table className="w-full min-w-[38rem] border-collapse text-[11px]">
      <thead>
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Component" zh="元件" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Node" zh="節點" />
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
            <span className="flex items-center justify-end gap-1">
              <ColumnLabel label="Margin" zh="餘裕" unit="°C" />
              <EngineeringInfo zh={T10.worstThermalMargin} label="Margin" />
            </span>
          </th>
          <th className="py-1.5 font-semibold">
            <span className="flex items-center gap-1">
              <ColumnLabel label="Status" zh="狀態" />
              <EngineeringInfo zh={T10.nearLimit} label="Near Limit" align="left" />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.node_id}
            onClick={() => onSelect(row.node_id)}
            className={`cursor-pointer border-b border-line/60 transition-colors ${
              selectedNodeId === row.node_id ? 'bg-accent-100' : 'hover:bg-surface-muted'
            }`}
          >
            <td className="py-1.5 pr-2">
              <span className="block max-w-[10rem] truncate font-semibold text-ink-900">
                {row.component_name}
              </span>
              {row.monitored_node_count > 1 && (
                <span className="block text-[10px] text-ink-400">
                  worst of {row.monitored_node_count} monitored nodes
                </span>
              )}
            </td>
            <td className="py-1.5 pr-2">
              <span className="block max-w-[10rem] truncate text-ink-500">{row.node_name}</span>
            </td>
            <td className="py-1.5 pr-2 text-right font-bold tabular text-ink-900">
              {num(row.temperature_C, 1)}
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
                  className={`font-bold tabular ${
                    row.status === 'FAIL'
                      ? 'text-danger-600'
                      : row.status === 'NEAR LIMIT'
                        ? 'text-warn-600'
                        : 'text-ok-600'
                  }`}
                >
                  {signed(row.margin_C, 1)}
                </span>
              )}
            </td>
            <td className="py-1.5">
              <Badge tone={COMPONENT_TONE[row.status]}>{row.status}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
