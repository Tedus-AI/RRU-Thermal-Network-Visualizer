/**
 * Node inspector — 07 §29, §30, §31, §32.
 *
 * Tabs: 總覽 / 結果 / 連線 / 限溫 / 來源 / 對應. Chinese-first (07 §59, 08
 * §35); the English name of each row rides on its tooltip.
 *
 * The Connections tab shows ΣQ + P, which must come out near zero — the direct
 * check that the node equation actually balances (07 §32). It shows a single
 * node's margin (07 §16) and no ranking of any kind (07 §44).
 */

import { useState } from 'react';

import { Badge } from '@/ui/primitives';
import { NODE_TYPE_HINTS, type ThermalNetwork, type ThermalNode } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { netHeatFlowOf } from '@/thermal/solver/solveScenario';
import { nodeGroup } from '@/ui/graphStyles';

import {
  DIRECTION_LABELS,
  NODE_ROLE_LABELS,
  STATUS_ZH,
  num,
  rth as formatRth,
  signed,
  timeOf,
} from './resultViewModel';
import { T07 } from './tooltips';

const TABS = [
  { id: 'overview', label: '總覽', full: '節點基本資料' },
  { id: 'result', label: '結果', full: '熱分析結果' },
  { id: 'connections', label: '連線', full: '接到這個節點的連線' },
  { id: 'limit', label: '限溫', full: '限溫與餘裕' },
  { id: 'source', label: '來源', full: '溫度的資料來源' },
  { id: 'mapping', label: '對應', full: '外部模擬物件對應' },
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
      title={tooltip ? `${zh}（${label}）— ${tooltip}` : `${zh}（${label}）`}
    >
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">{zh}</span>
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
        <Badge tone={fixed ? 'accent' : 'neutral'}>{role.zh}</Badge>
      </div>

      <div className="flex shrink-0 flex-wrap gap-0.5 rounded-md border border-line-strong p-0.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.full}
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
            <Row
              label="Node Type"
              zh="節點類型"
              value={node.type}
              tooltip={NODE_TYPE_HINTS[node.type]?.zh}
            />
            <Row label="Component" zh="元件" value={node.component_ref ?? '—'} />
            <Row label="Zone" zh="區域" value={node.zone ?? node.zone_id ?? '—'} />
            <Row label="Scenario" zh="情境" value={scenarioName || '—'} />
            <Row
              label="Solver Status"
              zh="求解狀態"
              value={stale ? STATUS_ZH.DIRTY : (STATUS_ZH[solverState] ?? solverState)}
            />
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
              tooltip={node.power_W > 0 ? undefined : '被動節點的注入功率是 0。'}
            />
            <Row
              label="Net Heat Flow"
              zh="淨熱流"
              value={netFlow == null ? '—' : signed(netFlow, 2, 'W')}
              tooltip={T07.field.heatFlow}
            />
            <Row label="Result Source" zh="結果來源" value={live ? '解析計算' : '—'} />
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
                <Row label="Thermal Limit" zh="限溫" value={num(node.limit_C, 1, '°C')} />
                <Row
                  label="Margin"
                  zh="餘裕"
                  value={margin == null ? '—' : signed(margin, 1, '°C')}
                  tone={margin == null ? 'text-ink-400' : margin >= 0 ? 'text-ok-600' : 'text-danger-600'}
                  tooltip={T07.field.margin}
                />
              </>
            )}
            {stale && solution && (
              <p className="mt-2 rounded border border-warn-500/40 bg-warn-100 px-2 py-1.5 text-[11px] text-warn-600">
                輸入在求解之後改過，這是舊的結果。
                <span className="block text-ink-500">重新求解才會看到目前的數值。</span>
              </p>
            )}
          </div>
        )}

        {tab === 'connections' && (
          <div>
            {connections.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-ink-400">
                還沒有已求解的連線。
              </p>
            ) : (
              <>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-400">
                      <th className="py-1 font-semibold" title="連線另一端的節點">
                        另一端
                      </th>
                      <th className="py-1 text-right font-semibold" title="求解用的熱阻（°C/W）">
                        Rth
                      </th>
                      <th className="py-1 text-right font-semibold" title={T07.field.heatFlow}>
                        Q
                      </th>
                      <th className="py-1 text-right font-semibold" title={T07.field.deltaT}>
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
                              title={`看連線 ${result.edge_id}・${DIRECTION_LABELS[result.actual_direction].zh}`}
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
                    value={netFlow == null ? '—' : signed(netFlow - node.power_W, 3, 'W')}
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
            <Row label="Limit Type" zh="限溫對象" value={node.limit_type ?? '—'} />
            <Row label="Limit" zh="限溫" value={num(node.limit_C, 1, '°C')} />
            <Row label="Temperature" zh="溫度" value={num(temperature, 1, '°C')} />
            <Row
              label="Margin"
              zh="餘裕"
              value={margin == null ? '—' : signed(margin, 1, '°C')}
              tone={margin == null ? 'text-ink-400' : margin >= 0 ? 'text-ok-600' : 'text-danger-600'}
              tooltip={T07.field.margin}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              這裡只看這一個節點的餘裕；要看是哪一段熱阻吃掉餘裕、改哪裡最有效，到 06 瓶頸分析。
            </p>
          </div>
        )}

        {tab === 'source' && (
          <div>
            <Row label="Temperature Source" zh="溫度來源" value={live ? '解析計算' : '尚未求解'} />
            <Row label="Solver Version" zh="求解器版本" value={live?.solver_version ?? '—'} />
            <Row label="FloTHERM" zh="FloTHERM" value="沒有" />
            <Row label="Measurement" zh="量測" value="沒有" />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              解析計算、FloTHERM 與量測的結果各自保存，匯入不會覆寫解析計算的值。
            </p>
          </div>
        )}

        {tab === 'mapping' && (
          <div>
            <Row label="Simulation Alias" zh="模擬物件別名" value={node.simulation_alias ?? '未對應'} />
            <Row
              label="Import Status"
              zh="匯入狀態"
              value={node.external_mappings ? '已保留對應' : '尚未提供'}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              FloTHERM 匯入尚未提供；這裡只顯示對應資訊，不會匯入或解析任何檔案。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
