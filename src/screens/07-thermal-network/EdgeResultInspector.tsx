/**
 * Edge inspector — 07 §33, §34, §35.
 *
 * Tabs: 總覽 / 結果 / 熱阻 / 來源 / 對應. Chinese-first (07 §59, 08 §35); the
 * English name of each row rides on its tooltip.
 *
 * The 熱阻 tab lists every source slot side by side (07 §35). A slot with no
 * value reads 「沒有」 — it is never filled in from another slot, and the
 * FloTHERM row stays empty while Screen 03 is deferred (07 §26, §28).
 */

import { useState } from 'react';

import { Badge } from '@/ui/primitives';
import type { ThermalEdge, ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import {
  DIRECTION_LABELS,
  EDGE_TYPE_ZH,
  RTH_SOURCE_BADGE,
  num,
  rth as formatRth,
  signed,
  timeOf,
} from './resultViewModel';
import { T07 } from './tooltips';

const TABS = [
  { id: 'overview', label: '總覽', full: '連線基本資料' },
  { id: 'result', label: '結果', full: '求解結果' },
  { id: 'model', label: '熱阻', full: '熱阻模型與各來源的值' },
  { id: 'source', label: '來源', full: '熱阻的資料來源' },
  { id: 'mapping', label: '對應', full: '外部模擬物件對應' },
] as const;

const NA = '沒有';

type Tab = (typeof TABS)[number]['id'];

const RESOLUTION_ZH: Record<string, string> = {
  resolved: '已解析',
  unresolved: '未解析',
  estimated: '估算',
  effective_path_only: '只有等效路徑',
};

const CONFIDENCE_ZH: Record<string, string> = { high: '高', medium: '中', low: '低' };

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

export function EdgeResultInspector({
  edge,
  network,
  solution,
  stale,
  scenarioId,
  onSelectNode,
}: {
  edge: ThermalEdge;
  network: ThermalNetwork;
  solution: ThermalSolution | null;
  stale: boolean;
  scenarioId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('result');

  const live = stale ? null : solution;
  const result = live?.edge_results[edge.id] ?? null;
  const fromName = network.nodes[edge.from]?.name ?? edge.from;
  const toName = network.nodes[edge.to]?.name ?? edge.to;
  const badge = RTH_SOURCE_BADGE[edge.rth.active_source];
  const provenance = edge.rth.provenance[edge.rth.active_source];
  const boundaryDerived = result?.rth_origin === 'boundary_scenario';
  // The finite-Bi spreading value is scenario data, so it lives on the solve
  // result rather than on the stored edge (see thermal/solver/spreadingBiot.ts).
  const biot = result?.spreading_biot ?? null;
  const override = edge.scenario_overrides?.[scenarioId];

  const T_from = live?.node_temperatures_C[edge.from] ?? null;
  const T_to = live?.node_temperatures_C[edge.to] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectNode(edge.from)}
          className="max-w-[7rem] truncate text-[12px] font-bold text-accent-600 hover:underline"
          title={`看起點節點 ${fromName}`}
        >
          {fromName}
        </button>
        <span aria-hidden className="text-ink-400">
          →
        </span>
        <button
          type="button"
          onClick={() => onSelectNode(edge.to)}
          className="max-w-[7rem] truncate text-[12px] font-bold text-accent-600 hover:underline"
          title={`看終點節點 ${toName}`}
        >
          {toName}
        </button>
        {boundaryDerived && <Badge tone="accent">邊界（05）</Badge>}
        {biot && <Badge tone="accent">有限 Bi</Badge>}
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
            <Row label="Edge ID" zh="連線代號" value={edge.id} />
            <Row label="Edge Type" zh="連線類型" value={EDGE_TYPE_ZH[edge.type] ?? edge.type} />
            <Row label="Method" zh="計算方式" value={edge.method} />
            <Row label="Enabled" zh="啟用" value={edge.enabled ? '是' : '否'} />
            <Row
              label="Resolution"
              zh="解析狀態"
              value={RESOLUTION_ZH[edge.resolution] ?? edge.resolution}
            />
            {edge.resolution_note && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">{edge.resolution_note}</p>
            )}
          </div>
        )}

        {tab === 'result' && (
          <div>
            <Row label="From" zh="起點" value={fromName} />
            <Row label="To" zh="終點" value={toName} />
            <Row label="T from" zh="起點溫度" value={num(T_from, 1, '°C')} />
            <Row label="T to" zh="終點溫度" value={num(T_to, 1, '°C')} />
            <Row
              label="ΔT"
              zh="溫差"
              value={result ? signed(result.delta_T_C, 2, '°C') : '—'}
              tooltip={T07.field.deltaT}
            />
            <Row
              label="Q"
              zh="熱流"
              value={result ? signed(result.heat_flow_W, 2, 'W') : '—'}
              tone={result && result.heat_flow_W < 0 ? 'text-accent-600' : ''}
              tooltip={T07.field.heatFlow}
            />
            <Row
              label="Actual Direction"
              zh="實際方向"
              value={result ? DIRECTION_LABELS[result.actual_direction].zh : '—'}
              tone={result?.actual_direction === 'reverse' ? 'text-accent-600' : ''}
              tooltip={T07.field.actualDirection}
            />
            <Row
              label="Active Rth"
              zh="求解用熱阻"
              value={result ? `${formatRth(result.active_rth_C_per_W)} °C/W` : '—'}
            />
            {result?.actual_direction === 'reverse' && (
              <p className="mt-2 rounded border border-accent-500/40 bg-accent-100 px-2 py-1.5 text-[11px] text-accent-700">
                熱流方向和圖上的箭頭相反。
                <span className="block text-ink-500">這是正常的求解結果，不是錯誤。</span>
              </p>
            )}
          </div>
        )}

        {tab === 'model' && (
          <div>
            <Row label="Edge Type" zh="連線類型" value={EDGE_TYPE_ZH[edge.type] ?? edge.type} />
            <Row label="Method" zh="計算方式" value={edge.method} />
            <Row
              label="Active Source"
              zh="採用的來源"
              value={boundaryDerived ? '情境邊界（05）' : (badge?.zh ?? edge.rth.active_source)}
              tooltip={T07.field.activeRthSource}
            />
            <Row
              label="Analytical Rth"
              zh="解析熱阻"
              value={edge.rth.analytical == null ? NA : `${formatRth(edge.rth.analytical)} °C/W`}
              tone={edge.rth.analytical == null ? 'text-ink-400' : ''}
            />
            <Row
              label="Manual Rth"
              zh="手動熱阻"
              value={edge.rth.manual == null ? NA : `${formatRth(edge.rth.manual)} °C/W`}
              tone={edge.rth.manual == null ? 'text-ink-400' : ''}
            />
            <Row
              label="Measurement Rth"
              zh="量測熱阻"
              value={
                edge.rth.measurement == null ? NA : `${formatRth(edge.rth.measurement)} °C/W`
              }
              tone={edge.rth.measurement == null ? 'text-ink-400' : ''}
            />
            <Row
              label="FloTHERM Rth"
              zh="FloTHERM 熱阻"
              value={NA}
              tone="text-ink-400"
              tooltip="03 尚未提供，這一欄先保留，不會出現假資料。"
            />
            {override?.R_C_per_W != null && (
              <Row
                label="Scenario Rth"
                zh="情境熱阻"
                value={`${formatRth(override.R_C_per_W)} °C/W`}
                tooltip="由 05 依此情境的邊界條件推導，僅作用於本次求解。"
              />
            )}
            {biot && (
              <>
                <Row
                  label="Far-face h (eff)"
                  zh="遠端等效對流係數"
                  value={`${biot.h_eff_W_m2K.toFixed(1)} W/m²K`}
                  tooltip="由本情境的鰭片與邊界熱阻反算，攤平到底板面積上；這就是 Bi 所需要的 h。"
                />
                <Row
                  label="Biot number"
                  zh="畢奧數"
                  value={biot.bi.toFixed(3)}
                  tooltip="Bi = h·b/k，b 為底板等效半徑（不是厚度）。Bi 越小，熱越需要橫向擴散，擴散熱阻越大。"
                />
                <Row
                  label="Rth at Bi → ∞"
                  zh="Bi → ∞ 熱阻"
                  value={`${formatRth(biot.R_bi_infinite_C_per_W)} °C/W`}
                  tooltip="05 顯示的值。Bi → ∞ 是這個模型的下限，一定比實際值小。"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                  05 建這條連線時還沒有情境的邊界條件，只能用 Bi → ∞，那是這個模型最小的擴散熱阻；這次求解已經由熱網路本身反算遠端 h，再重新計算。
                </p>
              </>
            )}
            {result?.spreading_domain && (
              <>
                <Row
                  label="Spreading domain"
                  zh="擴散範圍"
                  value={
                    result.spreading_domain.mode === 'HeatShare'
                      ? '依熱量分配'
                      : '指定面積'
                  }
                  tooltip="在 04 的元件設定中選擇。只擴散到部分底座，假設周圍底座不比平均溫度高。"
                />
                <Row
                  label="Domain area"
                  zh="擴散面積"
                  value={`${Math.round(result.spreading_domain.plate_area_mm2).toLocaleString('en-US')} mm² (${(
                    (100 * result.spreading_domain.plate_area_mm2) /
                    result.spreading_domain.base_area_mm2
                  ).toFixed(1)} %)`}
                  tooltip="括號內為佔整片 HSK 基座的比例。"
                />
                {result.spreading_domain.mode === 'HeatShare' && (
                  <Row
                    label="Heat share"
                    zh="熱量佔比"
                    value={
                      result.spreading_domain.reverse
                        ? '熱由這裡流出底座，維持整片基座'
                        : `進入底座熱量的 ${((result.spreading_domain.heat_share ?? 0) * 100).toFixed(2)} %`
                    }
                    tooltip="這條連線求得的熱流 ÷ 進入底座的總熱流，都來自這次求解，不是元件額定功耗。"
                  />
                )}
              </>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">{T07.field.rule4}</p>
          </div>
        )}

        {tab === 'source' && (
          <div>
            <Row
              label="Active Source"
              zh="採用的來源"
              value={badge?.zh ?? edge.rth.active_source}
            />
            <Row
              label="Confidence"
              zh="信心度"
              value={CONFIDENCE_ZH[provenance?.confidence ?? edge.confidence ?? ''] ?? '—'}
            />
            <Row label="Reference" zh="依據" value={provenance?.reference ?? '—'} />
            <Row label="Recorded" zh="記錄時間" value={timeOf(provenance?.timestamp)} />
            <Row label="Origin" zh="產生方式" value={edge.origin?.kind ?? '—'} />
          </div>
        )}

        {tab === 'mapping' && (
          <div>
            <Row
              label="Import Status"
              zh="匯入狀態"
              value={edge.external_mappings ? '已保留對應' : '尚未提供'}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              03 匯入模擬結果尚未提供；這裡不解析 FloTHERM 檔案，也不會產生假數值。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
