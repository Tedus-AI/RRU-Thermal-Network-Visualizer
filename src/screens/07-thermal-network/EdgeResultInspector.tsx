/**
 * Edge inspector — 07 §33, §34, §35.
 *
 * Tabs: Overview / Solved Result / Rth Model / Source / Mapping.
 *
 * The Rth Model tab lists every source slot side by side (07 §35). A slot with
 * no value reads "Not Available" — it is never filled in from another slot, and
 * the FloTHERM row stays empty while Screen 03 is deferred (07 §26, §28).
 */

import { useState } from 'react';

import { Badge } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import type { ThermalEdge, ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import {
  DIRECTION_LABELS,
  RTH_SOURCE_BADGE,
  num,
  rth as formatRth,
  signed,
  timeOf,
} from './resultViewModel';
import { T07 } from './tooltips';

const TABS = [
  { id: 'overview', label: 'Overview', full: 'Overview', zh: '總覽' },
  { id: 'result', label: 'Result', full: 'Solved Result', zh: '求解結果' },
  { id: 'model', label: 'Rth', full: 'Rth Model', zh: '熱阻模型' },
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
          title={biTitle(`Inspect ${fromName}`, '檢視起點節點')}
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
          title={biTitle(`Inspect ${toName}`, '檢視終點節點')}
        >
          {toName}
        </button>
        {boundaryDerived && <Badge tone="accent">Boundary (06)</Badge>}
        {biot && <Badge tone="accent">Finite Bi</Badge>}
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
            <Row label="Edge ID" zh="連線代號" value={edge.id} />
            <Row label="Edge Type" zh="連線類型" value={edge.type} />
            <Row label="Method" zh="計算方式" value={edge.method} />
            <Row label="Enabled" zh="啟用" value={edge.enabled ? 'Yes' : 'No'} />
            <Row label="Resolution" zh="解析狀態" value={edge.resolution} />
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
              value={result ? signed(result.delta_T_C, 2, '°C') : 'N/A'}
              tooltip={T07.field.deltaT}
            />
            <Row
              label="Q"
              zh="熱流"
              value={result ? signed(result.heat_flow_W, 2, 'W') : 'N/A'}
              tone={result && result.heat_flow_W < 0 ? 'text-accent-600' : ''}
              tooltip={T07.field.heatFlow}
            />
            <Row
              label="Actual Direction"
              zh="實際方向"
              value={result ? DIRECTION_LABELS[result.actual_direction].label : 'N/A'}
              tone={result?.actual_direction === 'reverse' ? 'text-accent-600' : ''}
              tooltip={T07.field.actualDirection}
            />
            <Row
              label="Active Rth"
              zh="作用熱阻"
              value={result ? `${formatRth(result.active_rth_C_per_W)} °C/W` : 'N/A'}
            />
            {result?.actual_direction === 'reverse' && (
              <p className="mt-2 rounded border border-accent-500/40 bg-accent-100 px-2 py-1.5 text-[11px] text-accent-700">
                Heat flows against the drawn direction. This is a valid solution,
                not an error.
                <span className="block text-ink-500">
                  熱流方向與圖示相反，這是合法結果而非錯誤。
                </span>
              </p>
            )}
          </div>
        )}

        {tab === 'model' && (
          <div>
            <Row label="Edge Type" zh="連線類型" value={edge.type} />
            <Row label="Method" zh="計算方式" value={edge.method} />
            <Row
              label="Active Source"
              zh="作用來源"
              value={boundaryDerived ? 'Scenario boundary (06)' : (badge?.label ?? edge.rth.active_source)}
              tooltip={T07.field.activeRthSource}
            />
            <Row
              label="Analytical Rth"
              zh="解析熱阻"
              value={edge.rth.analytical == null ? 'Not Available' : `${formatRth(edge.rth.analytical)} °C/W`}
              tone={edge.rth.analytical == null ? 'text-ink-400' : ''}
            />
            <Row
              label="Manual Rth"
              zh="手動熱阻"
              value={edge.rth.manual == null ? 'Not Available' : `${formatRth(edge.rth.manual)} °C/W`}
              tone={edge.rth.manual == null ? 'text-ink-400' : ''}
            />
            <Row
              label="Measurement Rth"
              zh="量測熱阻"
              value={
                edge.rth.measurement == null ? 'Not Available' : `${formatRth(edge.rth.measurement)} °C/W`
              }
              tone={edge.rth.measurement == null ? 'text-ink-400' : ''}
            />
            <Row
              label="FloTHERM Rth"
              zh="FloTHERM 熱阻"
              value="Not Available"
              tone="text-ink-400"
              tooltip="03 尚未實作，此欄位保留，不會出現假資料。"
            />
            {override?.R_C_per_W != null && (
              <Row
                label="Scenario Rth"
                zh="情境熱阻"
                value={`${formatRth(override.R_C_per_W)} °C/W`}
                tooltip="由 06 依此情境的邊界條件推導，僅作用於本次求解。"
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
                  tooltip="畫面 05 顯示的值。Bi → ∞ 是本模型的下限，恆小於實際值。"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                  Screen 05 has to build this edge at Bi → ∞ because h is scenario
                  data, and that is the smallest spreading the model can produce.
                  This solve measured the far-face h off the network itself and
                  re-solved the series against it.
                  <span className="block">
                    05 因為沒有邊界條件，只能以 Bi → ∞ 建立此邊，那是本模型的最小值；本次求解已由網路本身反算遠端 h 並重新計算。
                  </span>
                </p>
              </>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Q is computed from this edge's own resistance. A segment resistance
              is never derived from ΔT and a component's total power.
              <span className="block">{T07.field.rule4}</span>
            </p>
          </div>
        )}

        {tab === 'source' && (
          <div>
            <Row label="Active Source" zh="作用來源" value={edge.rth.active_source} />
            <Row label="Confidence" zh="信心度" value={provenance?.confidence ?? edge.confidence ?? '—'} />
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
              value={edge.external_mappings ? 'Reserved' : 'Deferred'}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Screen 03 is deferred. No FloTHERM file is parsed here and no
              FloTHERM number is invented.
              <span className="block">03 尚未實作，此處不解析檔案也不會產生假數值。</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function InspectorEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <p className="text-[12px] font-semibold text-ink-700">
        Select a node or an edge to inspect it.
      </p>
      <p className="text-[11px] text-ink-400">點選圖上的節點或連線以檢視結果。</p>
    </div>
  );
}
