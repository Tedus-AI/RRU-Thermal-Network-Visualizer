/**
 * Selected Node Inspector — 09 §27–§35, §47.
 *
 * The Markdown specifies seven TABS (Overview, Temperature, Limit & Margin,
 * Scenario Compare, Connections, Source, External Mapping); the mockup draws
 * those sections stacked and visible at once with the tab strip above them.
 * Both are honoured the same way Screen 08 resolved it: every section renders in
 * one scrolling column exactly where the mockup places it, and the tab strip
 * selects and scrolls to a section rather than hiding the other six.
 *
 * Everything here is read-only (09 §34, §44): the connections come from the
 * Screen 07 solve and are displayed, never edited.
 */

import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import {
  NEAR_LIMIT_MARGIN_C,
  STATUS_LABELS,
  type TemperatureRow,
} from '@/thermal/analysis/temperatureDataset';
import type { ScenarioTemperatureComparison } from '@/thermal/analysis/scenarioTemperatureCompare';

import { STATUS_TONE, num, ordinal, signed, timeOf } from './distributionViewModel';
import { T09 } from './tooltips';

const TABS = [
  { id: 'overview', label: 'Overview', full: 'Overview', zh: '總覽' },
  { id: 'temperature', label: 'Temperature', full: 'Temperature', zh: '溫度' },
  { id: 'limit', label: 'Limit & Margin', full: 'Limit & Margin', zh: '限制與餘裕' },
  { id: 'compare', label: 'Scenario Compare', full: 'Scenario Compare', zh: '情境比較' },
  { id: 'connections', label: 'Connections', full: 'Connections', zh: '連線' },
  { id: 'source', label: 'Source', full: 'Source', zh: '資料來源' },
  { id: 'mapping', label: 'External Mapping', full: 'External Mapping', zh: '外部對應' },
] as const;

type Tab = (typeof TABS)[number]['id'];

function Row({
  label,
  zh,
  value,
  tone = '',
  explanation,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  explanation?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-ink-700">
        <span className="truncate">
          {label} <span className="font-normal text-ink-400">/ {zh}</span>
        </span>
        {explanation && <EngineeringInfo zh={explanation} label={label} align="left" />}
      </span>
      <span className={`shrink-0 text-[12px] font-bold tabular ${tone || 'text-ink-900'}`}>
        {value}
      </span>
    </div>
  );
}

function Heading({ title, zh }: { title: string; zh: string }) {
  return (
    <h3 className="mb-1 text-[12px] font-bold text-ink-900">
      {title} <span className="font-semibold text-ink-400">/ {zh}</span>
    </h3>
  );
}

export function TemperatureNodeInspector({
  row,
  network,
  solution,
  scenarioName,
  rank,
  percentilePosition,
  mean_C,
  comparison,
  comparisonScenarioName,
  onSelectNode,
}: {
  row: TemperatureRow;
  network: ThermalNetwork;
  solution: ThermalSolution;
  scenarioName: string;
  /** 1-based position in the current ranked dataset. */
  rank: number | null;
  percentilePosition: number | null;
  mean_C: number | null;
  comparison: ScenarioTemperatureComparison | null;
  comparisonScenarioName: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<Tab, HTMLElement | null>>>({});

  useEffect(() => {
    setTab('overview');
    containerRef.current?.scrollTo({ top: 0 });
  }, [row.node_id]);

  const goTo = (next: Tab) => {
    setTab(next);
    sectionRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const register = (id: Tab) => (element: HTMLElement | null) => {
    sectionRefs.current[id] = element;
  };

  // 09 §34 — connected edges from the Screen 07 solution, read-only.
  const connections = Object.values(solution.edge_results).filter(
    (result) => result.from === row.node_id || result.to === row.node_id,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap gap-0.5 rounded-md border border-line-strong p-0.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={biTitle(entry.full, entry.zh)}
            aria-pressed={tab === entry.id}
            onClick={() => goTo(entry.id)}
            className={`rounded px-1.5 py-1 text-[10px] font-semibold transition-colors ${
              tab === entry.id
                ? 'bg-accent-600 text-white'
                : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto pr-0.5">
        {/* --- Overview (09 §28) --------------------------------------- */}
        <section ref={register('overview')} className="scroll-mt-2">
          <Heading title="Node Overview" zh="節點總覽" />
          <Row label="Node Name" zh="節點名稱" value={row.node_name} />
          <Row label="Component" zh="元件" value={row.component_name ?? '—'} />
          <Row label="Node Type" zh="節點類型" value={row.node_type} />
          <Row label="Category" zh="類別" value={row.category ?? '—'} />
          <Row label="Base Zone" zh="基座區域" value={row.zone_id ?? '—'} />
          <Row label="Scenario" zh="情境" value={scenarioName} />
        </section>

        {/* --- Temperature (09 §29, §30) ------------------------------- */}
        <section ref={register('temperature')} className="mt-3 scroll-mt-2">
          <Heading title="Node Details" zh="節點細節" />
          <Row
            label="Temperature"
            zh="溫度"
            value={num(row.temperature_C, 1, '°C')}
            tone="text-ink-900"
          />
          <Row
            label="Temperature Rank"
            zh="溫度排名"
            value={rank == null ? 'N/A' : String(rank)}
            explanation={T09.temperatureRank}
          />
          <Row
            label="Percentile Position"
            zh="百分位位置"
            value={ordinal(percentilePosition)}
            explanation={T09.percentilePosition}
          />
          <Row
            label="Distance from Average"
            zh="與平均的差"
            value={
              mean_C == null ? 'N/A' : signed(row.temperature_C - mean_C, 1, '°C')
            }
            explanation={T09.distanceFromAverage}
          />
          <Row label="Result Source" zh="結果來源" value={row.result_source} />
          <Row label="Solved At" zh="求解時間" value={timeOf(solution.solved_at)} />
        </section>

        {/* --- Limit & Margin (09 §31, §32) ---------------------------- */}
        <section ref={register('limit')} className="mt-3 scroll-mt-2">
          <Heading title="Limit & Margin" zh="限制與餘裕" />
          <Row
            label="Limit Type"
            zh="限制類型"
            value={row.limit_type ?? '—'}
            explanation={T09.limitType}
          />
          <Row label="Limit" zh="限制值" value={num(row.limit_C, 1, '°C')} />
          <Row label="Current Temperature" zh="目前溫度" value={num(row.temperature_C, 1, '°C')} />
          <Row
            label="Margin"
            zh="餘裕"
            value={row.margin_C == null ? 'N/A' : signed(row.margin_C, 1, '°C')}
            tone={
              row.margin_C == null
                ? 'text-ink-400'
                : row.margin_C < 0
                  ? 'text-danger-600'
                  : row.margin_C <= NEAR_LIMIT_MARGIN_C
                    ? 'text-warn-600'
                    : 'text-ok-600'
            }
            explanation={T09.margin}
          />
          <div className="flex items-baseline justify-between gap-2 py-1.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-700">
              Status <span className="font-normal text-ink-400">/ 狀態</span>
              <EngineeringInfo zh={T09.status} label="Status" align="left" />
            </span>
            <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status].label}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1 rounded border border-line bg-surface-muted px-2 py-1.5 text-[10px] text-ink-500">
            Near Limit Threshold: {NEAR_LIMIT_MARGIN_C} °C
            <EngineeringInfo zh={T09.nearLimit} label="Near Limit" align="left" />
          </p>
        </section>

        {/* --- Scenario Compare (09 §33) ------------------------------- */}
        <section ref={register('compare')} className="mt-3 scroll-mt-2">
          <Heading title="Scenario Compare" zh="情境比較" />
          {comparison && comparisonScenarioName ? (
            <>
              <Row label="Baseline T" zh="基準溫度" value={num(comparison.baseline_temperature_C, 1, '°C')} />
              <Row
                label={`Comparison T`}
                zh="比較溫度"
                value={num(comparison.comparison_temperature_C, 1, '°C')}
              />
              <Row
                label="ΔT"
                zh="溫差"
                value={
                  comparison.delta_temperature_C == null
                    ? 'N/A'
                    : signed(comparison.delta_temperature_C, 2, '°C')
                }
                tone={
                  comparison.delta_temperature_C == null
                    ? 'text-ink-400'
                    : comparison.delta_temperature_C > 0
                      ? 'text-danger-600'
                      : 'text-ok-600'
                }
              />
              <Row
                label="Baseline Margin"
                zh="基準餘裕"
                value={comparison.baseline_margin_C == null ? 'N/A' : signed(comparison.baseline_margin_C, 1, '°C')}
              />
              <Row
                label="Comparison Margin"
                zh="比較餘裕"
                value={
                  comparison.comparison_margin_C == null
                    ? 'N/A'
                    : signed(comparison.comparison_margin_C, 1, '°C')
                }
              />
              {comparison.match_status !== 'matched' && (
                <p className="mt-1 rounded border border-warn-500/40 bg-warn-100 px-2 py-1.5 text-[10px] text-warn-600">
                  This node is not present in both scenarios, so no comparison is
                  available for it.
                  <span className="block text-ink-500">此節點未同時存在於兩個情境，無法比較。</span>
                </p>
              )}
            </>
          ) : (
            <p className="py-2 text-[11px] text-ink-400">
              Pick a comparison scenario to see this node side by side.
              <span className="block">選擇比較情境後，可在此並列檢視。</span>
            </p>
          )}
        </section>

        {/* --- Connections (09 §34) ------------------------------------ */}
        <section ref={register('connections')} className="mt-3 scroll-mt-2">
          <Heading title="Connections" zh="連線" />
          {connections.length === 0 ? (
            <p className="py-2 text-[11px] text-ink-400">
              No solved connections for this node.
              <span className="block">此節點沒有已求解的連線。</span>
            </p>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-line text-left text-ink-400">
                  <th className="py-1 font-semibold">Neighbor</th>
                  <th className="py-1 text-right font-semibold">T (°C)</th>
                  <th className="py-1 text-right font-semibold">Rth</th>
                  <th className="py-1 text-right font-semibold">Q (W)</th>
                  <th className="py-1 text-right font-semibold">ΔT</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((result) => {
                  const otherId = result.from === row.node_id ? result.to : result.from;
                  const q = result.from === row.node_id ? result.heat_flow_W : -result.heat_flow_W;
                  return (
                    <tr key={result.edge_id} className="border-b border-line/60">
                      <td className="py-1">
                        <button
                          type="button"
                          onClick={() => onSelectNode(otherId)}
                          className="max-w-[7rem] truncate text-left text-accent-600 hover:underline"
                        >
                          {network.nodes[otherId]?.name ?? otherId}
                        </button>
                      </td>
                      <td className="py-1 text-right tabular">
                        {num(solution.node_temperatures_C[otherId], 1)}
                      </td>
                      <td className="py-1 text-right tabular">
                        {result.active_rth_C_per_W.toFixed(3)}
                      </td>
                      <td className="py-1 text-right tabular">{signed(q, 1)}</td>
                      <td className="py-1 text-right tabular">{signed(result.delta_T_C, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-1 text-[10px] text-ink-400">
            Read-only, from the Screen 07 solve.
            <span className="block">唯讀，資料來自 07 的求解結果。</span>
          </p>
        </section>

        {/* --- Source (09 §35) ----------------------------------------- */}
        <section ref={register('source')} className="mt-3 scroll-mt-2">
          <Heading title="Source" zh="資料來源" />
          <Row label="Thermal Network Source" zh="熱網路來源" value="Analytical" />
          <Row label="Solver Version" zh="求解版本" value={solution.solver_version} />
          <Row
            label="FloTHERM"
            zh="FloTHERM"
            value="Not Available / Deferred"
            tone="text-ink-400"
          />
          <Row label="Measurement" zh="量測" value="Not Available" tone="text-ink-400" />
        </section>

        {/* --- External Mapping (09 §47) -------------------------------- */}
        <section ref={register('mapping')} className="mt-3 scroll-mt-2">
          <Heading title="External Mapping" zh="外部對應" />
          <Row
            label="FloTHERM Mapping"
            zh="FloTHERM 對應"
            value={network.nodes[row.node_id]?.simulation_alias ?? 'Not mapped'}
            tone="text-ink-400"
          />
          <Row
            label="External Mapping Status"
            zh="外部對應狀態"
            value={network.nodes[row.node_id]?.external_mappings ? 'Reserved' : 'Deferred'}
            tone="text-ink-400"
          />
          <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
            Screen 03 is deferred. Only mapping metadata is shown; no external
            result is imported and no value is invented.
            <span className="block">03 尚未實作，此處僅顯示對應資訊，不匯入也不產生假數值。</span>
          </p>
        </section>
      </div>
    </div>
  );
}

export function InspectorEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <p className="text-[12px] font-semibold text-ink-700">Select a node to inspect it.</p>
      <p className="text-[11px] text-ink-400">請於排名表、圖表或熱網路圖中選擇節點。</p>
    </div>
  );
}
