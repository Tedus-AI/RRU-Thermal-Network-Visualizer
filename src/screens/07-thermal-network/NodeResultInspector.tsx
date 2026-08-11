/**
 * Node inspector — 07 §29, §30, §31, §32.
 *
 * Tabs: Overview / Thermal Result / Connections / Limit / Source / Mapping.
 * The labels are shortened to fit a 22 rem column; the full English and
 * Traditional Chinese names ride on the tooltip, per the project bilingual rule.
 *
 * The Connections tab shows ΣQ + P, which must come out near zero — the direct
 * check that the node equation actually balances (07 §32). It shows a single
 * node's margin (07 §16) and no ranking of any kind (07 §44).
 */

import { useState } from 'react';

import { Badge } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import type { ThermalNetwork, ThermalNode } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { netHeatFlowOf } from '@/thermal/solver/solveScenario';
import { nodeGroup } from '@/ui/graphStyles';

import {
  DIRECTION_LABELS,
  NODE_ROLE_LABELS,
  num,
  rth as formatRth,
  signed,
  timeOf,
} from './resultViewModel';
import { T07 } from './tooltips';

const TABS = [
  { id: 'overview', label: 'Overview', full: 'Overview', zh: '總覽' },
  { id: 'result', label: 'Result', full: 'Thermal Result', zh: '熱分析結果' },
  { id: 'connections', label: 'Links', full: 'Connections', zh: '連線' },
  { id: 'limit', label: 'Limit', full: 'Limit', zh: '限制值' },
  { id: 'source', label: 'Source', full: 'Source', zh: '資料來源' },
  { id: 'mapping', label: 'Map', full: 'External Mapping', zh: '外部對應' },
] as const;

type Tab = (typeof TABS)[number]['id'];

function Row({
  label,
  zh,
  value,
  tone = '',
  tooltip,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  tooltip?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0"
      title={tooltip ? `${label} / ${zh} — ${tooltip}` : `${label} / ${zh}`}
    >
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">
        {label}
        <span className="ml-1 font-normal text-ink-400">/ {zh}</span>
      </span>
      <span className={`shrink-0 text-[12px] font-bold tabular ${tone || 'text-ink-900'}`}>
        {value}
      </span>
    </div>
  );
}

export function NodeResultInspector({
  node,
  network,
  solution,
  stale,
  scenarioName,
  solverState,
  onSelectEdge,
}: {
  node: ThermalNode;
  network: ThermalNetwork;
  solution: ThermalSolution | null;
  stale: boolean;
  scenarioName: string;
  solverState: string;
  onSelectEdge: (edgeId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');

  const live = stale ? null : solution;
  const temperature = live?.node_temperatures_C[node.id] ?? null;
  const margin =
    node.limit_C != null && temperature != null ? node.limit_C - temperature : null;
  const netFlow = live ? netHeatFlowOf(live, node.id) : null;
  const role = NODE_ROLE_LABELS[nodeGroup(node)];
  const fixed = node.boundary_type === 'fixed_temperature' || node.boundary_role === 'placeholder';

  const connections = Object.values(live?.edge_results ?? {}).filter(
    (result) => result.from === node.id || result.to === node.id,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-bold text-ink-900">{node.name}</span>
        <Badge tone={fixed ? 'accent' : 'neutral'}>{role.label}</Badge>
      </div>

      <div className="flex shrink-0 flex-wrap gap-0.5 rounded-md border border-line-strong p-0.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={biTitle(entry.full, entry.zh)}
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`rounded px-1.5 py-1 text-[11px] font-semibold transition-colors ${
              tab === entry.id
                ? 'bg-accent-600 text-white'
                : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'overview' && (
          <div>
            <Row label="Node Name" zh="節點名稱" value={node.name} />
            <Row label="Node Type" zh="節點類型" value={node.type} />
            <Row label="Component" zh="元件" value={node.component_ref ?? '—'} />
            <Row label="Zone" zh="區域" value={node.zone ?? node.zone_id ?? '—'} />
            <Row label="Scenario" zh="情境" value={scenarioName || '—'} />
            <Row label="Solver Status" zh="求解狀態" value={stale ? 'DIRTY' : solverState} />
          </div>
        )}

        {tab === 'result' && (
          <div>
            <Row
              label="Temperature"
              zh="溫度"
              value={num(temperature, 1, '°C')}
              tone={temperature == null ? 'text-ink-400' : ''}
            />
            <Row
              label="Injected Power"
              zh="注入功率"
              value={num(node.power_W, 2, 'W')}
              tooltip={node.power_W > 0 ? undefined : '被動節點的注入功率為 0。'}
            />
            <Row
              label="Net Heat Flow"
              zh="淨熱流"
              value={netFlow == null ? 'N/A' : signed(netFlow, 2, 'W')}
              tooltip={T07.field.heatFlow}
            />
            <Row label="Result Source" zh="結果來源" value={live ? 'Analytical' : '—'} />
            <Row label="Scenario ID" zh="情境代號" value={live?.scenario_id ?? '—'} />
            <Row label="Solved At" zh="求解時間" value={timeOf(live?.solved_at)} />
            {fixed && (
              <Row
                label="Fixed Temperature"
                zh="固定溫度"
                value={num(node.fixed_temperature_C, 1, '°C')}
              />
            )}
            {node.limit_C != null && (
              <>
                <Row label="Thermal Limit" zh="熱限制值" value={num(node.limit_C, 1, '°C')} />
                <Row
                  label="Margin"
                  zh="餘裕"
                  value={margin == null ? 'N/A' : signed(margin, 1, '°C')}
                  tone={margin == null ? 'text-ink-400' : margin >= 0 ? 'text-ok-600' : 'text-danger-600'}
                  tooltip={T07.field.margin}
                />
              </>
            )}
            {stale && solution && (
              <p className="mt-2 rounded border border-warn-500/40 bg-warn-100 px-2 py-1.5 text-[11px] text-warn-600">
                A previous solution exists but the inputs changed. Re-solve to see current values.
                <span className="block text-ink-500">舊解已失效，請重新求解。</span>
              </p>
            )}
          </div>
        )}

        {tab === 'connections' && (
          <div>
            {connections.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-ink-400">
                No solved connections. / 尚無已求解的連線。
              </p>
            ) : (
              <>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-400">
                      <th className="py-1 font-semibold" title={biTitle('Other node', '另一端節點')}>
                        Other
                      </th>
                      <th className="py-1 text-right font-semibold" title={biTitle('Active Rth', '作用熱阻')}>
                        Rth
                      </th>
                      <th className="py-1 text-right font-semibold" title={biTitle('Heat flow', T07.field.heatFlow)}>
                        Q
                      </th>
                      <th className="py-1 text-right font-semibold" title={biTitle('Delta T', T07.field.deltaT)}>
                        ΔT
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((result) => {
                      const otherId = result.from === node.id ? result.to : result.from;
                      // Sign as seen FROM this node: positive means heat leaves.
                      const q = result.from === node.id ? result.heat_flow_W : -result.heat_flow_W;
                      return (
                        <tr key={result.edge_id} className="border-b border-line/60">
                          <td className="py-1">
                            <button
                              type="button"
                              onClick={() => onSelectEdge(result.edge_id)}
                              title={biTitle(
                                `Inspect ${result.edge_id}`,
                                DIRECTION_LABELS[result.actual_direction].zh,
                              )}
                              className="max-w-[8rem] truncate text-left text-accent-600 hover:underline"
                            >
                              {network.nodes[otherId]?.name ?? otherId}
                            </button>
                          </td>
                          <td className="py-1 text-right tabular">
                            {formatRth(result.active_rth_C_per_W)}
                          </td>
                          <td
                            className={`py-1 text-right tabular ${q < 0 ? 'text-accent-600' : 'text-ink-900'}`}
                          >
                            {signed(q, 2)}
                          </td>
                          <td className="py-1 text-right tabular">{signed(result.delta_T_C, 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="mt-2 rounded border border-line bg-surface-muted px-2 py-1.5">
                  <Row
                    label="ΣQ − P"
                    zh="節點失衡量"
                    value={netFlow == null ? 'N/A' : signed(netFlow - node.power_W, 3, 'W')}
                    tone={
                      netFlow != null && Math.abs(netFlow - node.power_W) < 1e-6
                        ? 'text-ok-600'
                        : 'text-warn-600'
                    }
                    tooltip="節點的流出熱量與注入功率之差，應接近 0。"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'limit' && (
          <div>
            <Row label="Limit Type" zh="限制類型" value={node.limit_type ?? '—'} />
            <Row label="Limit" zh="限制值" value={num(node.limit_C, 1, '°C')} />
            <Row label="Temperature" zh="溫度" value={num(temperature, 1, '°C')} />
            <Row
              label="Margin"
              zh="餘裕"
              value={margin == null ? 'N/A' : signed(margin, 1, '°C')}
              tone={margin == null ? 'text-ink-400' : margin >= 0 ? 'text-ok-600' : 'text-danger-600'}
              tooltip={T07.field.margin}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Screen 07 shows one node's margin. Comparing components against each
              other is Screen 08's job.
              <span className="block">07 只顯示單一節點餘裕，元件間的比較屬於 08。</span>
            </p>
          </div>
        )}

        {tab === 'source' && (
          <div>
            <Row label="Temperature Source" zh="溫度來源" value={live ? 'Analytical' : 'Not solved'} />
            <Row label="Solver Version" zh="求解版本" value={live?.solver_version ?? '—'} />
            <Row label="FloTHERM" zh="FloTHERM" value="Not Available" />
            <Row label="Measurement" zh="量測" value="Not Available" />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Analytical, FloTHERM and measurement results keep separate slots. An
              import never overwrites the analytical value.
              <span className="block">三種來源各自保存，匯入不會覆寫解析值。</span>
            </p>
          </div>
        )}

        {tab === 'mapping' && (
          <div>
            <Row label="Simulation Alias" zh="模擬物件別名" value={node.simulation_alias ?? 'Not mapped'} />
            <Row
              label="Import Status"
              zh="匯入狀態"
              value={node.external_mappings ? 'Reserved' : 'Deferred'}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Screen 03 is deferred. Screen 07 displays mapping metadata but never
              imports or parses anything.
              <span className="block">03 尚未實作，07 只顯示對應資訊，不進行匯入。</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
