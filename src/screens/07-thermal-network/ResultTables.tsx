/**
 * Node Temperature Results and Heat Flow Results — PNG bottom row, 07 §16, §17.
 *
 * Rows are ordered by node / edge id, never by "worst first". Prioritising the
 * results is Screen 08's job (07 §44), and a table that quietly sorts by margin
 * would already be doing it. No histogram, no distribution statistic (07 §45).
 */

import { Badge } from '@/ui/primitives';
import { ColumnLabel, biTitle } from '@/ui/FieldLabel';

import {
  DIRECTION_LABELS,
  RTH_SOURCE_BADGE,
  num,
  rth as formatRth,
  signed,
  type EdgeResultRow,
  type NodeResultRow,
} from './resultViewModel';
import { T07 } from './tooltips';

function EmptyRow({ colSpan, text, zh }: { colSpan: number; text: string; zh: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-[11px] text-ink-400">
        {text}
        <span className="block">{zh}</span>
      </td>
    </tr>
  );
}

export function NodeTemperatureTable({
  rows,
  hasSolution,
  selectedNodeId,
  onSelect,
}: {
  rows: NodeResultRow[];
  hasSolution: boolean;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Node" zh="節點" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Type" zh="類型" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Power" zh="功率" unit="W" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Temp" zh="溫度" unit="°C" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="ΔT amb" zh="對環境溫差" unit="°C" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Limit" zh="限制" unit="°C" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Margin" zh="餘裕" unit="°C" tooltip={T07.field.margin} />
          </th>
          <th className="py-1.5 font-semibold">
            <ColumnLabel label="Status" zh="狀態" />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={8} text="No nodes in the network." zh="網路中沒有節點。" />
        ) : (
          rows.map((row) => (
            <tr
              key={row.node.id}
              onClick={() => onSelect(row.node.id)}
              title={biTitle(`Inspect ${row.node.name}`, '檢視此節點')}
              className={`cursor-pointer border-b border-line/60 transition-colors ${
                selectedNodeId === row.node.id ? 'bg-accent-100' : 'hover:bg-surface-muted'
              }`}
            >
              <td className="py-1.5 pr-2">
                <span className="block max-w-[10rem] truncate font-semibold text-ink-900">
                  {row.node.name}
                </span>
                <span className="block max-w-[10rem] truncate text-[10px] text-ink-400">
                  {row.node.id}
                </span>
              </td>
              <td className="py-1.5 pr-2 text-ink-500">{row.node.type}</td>
              <td className="py-1.5 pr-2 text-right tabular">
                {row.power_W > 0 ? row.power_W.toFixed(2) : '—'}
              </td>
              <td className="py-1.5 pr-2 text-right font-bold tabular text-ink-900">
                {hasSolution ? num(row.temperature_C, 1) : '—'}
              </td>
              <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                {hasSolution ? num(row.delta_to_ambient_C, 1) : '—'}
              </td>
              <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                {row.limit_C == null ? '—' : row.limit_C.toFixed(0)}
              </td>
              <td
                className={`py-1.5 pr-2 text-right font-semibold tabular ${
                  row.status === 'over' ? 'text-danger-600' : 'text-ink-900'
                }`}
              >
                {hasSolution && row.margin_C != null ? signed(row.margin_C, 1) : '—'}
              </td>
              <td className="py-1.5">
                {!hasSolution || row.status === 'na' ? (
                  <span className="text-ink-400">—</span>
                ) : (
                  <Badge tone={row.status === 'pass' ? 'ok' : 'danger'}>
                    {row.status === 'pass' ? 'Pass' : 'Over'}
                  </Badge>
                )}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function HeatFlowTable({
  rows,
  selectedEdgeId,
  onSelect,
}: {
  rows: EdgeResultRow[];
  selectedEdgeId: string | null;
  onSelect: (edgeId: string) => void;
}) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="border-b border-line text-left align-bottom text-ink-700">
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="From → To" zh="起點 → 終點" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Rth" zh="熱阻" unit="°C/W" />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="Q" zh="熱流" unit="W" tooltip={T07.field.heatFlow} />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="ΔT" zh="溫差" unit="°C" tooltip={T07.field.deltaT} />
          </th>
          <th className="py-1.5 pr-2 text-right font-semibold">
            <ColumnLabel label="% of total" zh="佔總熱量" />
          </th>
          <th className="py-1.5 pr-2 font-semibold">
            <ColumnLabel label="Direction" zh="方向" tooltip={T07.field.actualDirection} />
          </th>
          <th className="py-1.5 font-semibold">
            <ColumnLabel label="Source" zh="來源" tooltip={T07.field.activeRthSource} />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow
            colSpan={7}
            text="No heat-flow results yet. Solve the network first."
            zh="尚無熱流結果，請先執行求解。"
          />
        ) : (
          rows.map((row) => {
            const badge = RTH_SOURCE_BADGE[row.result.active_rth_source];
            const boundary = row.result.rth_origin === 'boundary_scenario';
            return (
              <tr
                key={row.result.edge_id}
                onClick={() => onSelect(row.result.edge_id)}
                title={biTitle(`Inspect ${row.result.edge_id}`, '檢視此連線')}
                className={`cursor-pointer border-b border-line/60 transition-colors ${
                  selectedEdgeId === row.result.edge_id ? 'bg-accent-100' : 'hover:bg-surface-muted'
                }`}
              >
                <td className="py-1.5 pr-2">
                  <span className="block max-w-[13rem] truncate font-semibold text-ink-900">
                    {row.from_name} → {row.to_name}
                  </span>
                  <span className="block max-w-[13rem] truncate text-[10px] text-ink-400">
                    {row.edge_type}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right tabular">
                  {formatRth(row.result.active_rth_C_per_W)}
                </td>
                <td
                  className={`py-1.5 pr-2 text-right font-bold tabular ${
                    row.result.heat_flow_W < 0 ? 'text-accent-600' : 'text-ink-900'
                  }`}
                >
                  {signed(row.result.heat_flow_W, 2)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                  {signed(row.result.delta_T_C, 1)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                  {row.share_pct == null ? '—' : `${row.share_pct.toFixed(1)}%`}
                </td>
                <td className="py-1.5 pr-2">
                  <span
                    className={
                      row.result.actual_direction === 'reverse'
                        ? 'font-semibold text-accent-600'
                        : 'text-ink-500'
                    }
                  >
                    {DIRECTION_LABELS[row.result.actual_direction].label}
                  </span>
                </td>
                <td className="py-1.5">
                  <span
                    title={biTitle(
                      boundary ? 'Derived from Screen 06 boundary conditions' : (badge?.label ?? 'Unresolved'),
                      boundary ? '由 06 邊界條件推導' : (badge?.zh ?? '未解析'),
                    )}
                    className="text-ink-500"
                  >
                    {boundary ? 'Boundary' : (badge?.short ?? '?')}
                  </span>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
