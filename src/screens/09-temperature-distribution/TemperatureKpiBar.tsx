/**
 * Temperature KPI row — 09 §6, PNG top row.
 *
 * The six cards the specification requires, in its order: Max Temperature,
 * Average Temperature, P95 Temperature, Min Thermal Margin, Nodes Above Warning,
 * Active Scenario.
 *
 * 09 §6 forbids a Top Bottleneck Score or a Sensitivity Improvement card here —
 * those belong to Screen 08 and are not present.
 *
 * Every card carries an `EngineeringInfo` affordance rather than a bare `title`,
 * because 09 §3.3 / AC-09-34 do not accept the native attribute alone.
 */

import type { ReactNode } from 'react';
import { Gauge, ShieldCheck, Target, Thermometer, TrendingUp, TriangleAlert } from 'lucide-react';

import { EngineeringInfo } from '@/ui/FieldLabel';
import type { Tone } from '@/ui/primitives';
import type { TemperatureStatistics } from '@/thermal/analysis/temperatureStatistics';

import { num } from './distributionViewModel';
import { T09 } from './tooltips';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  neutral: 'text-ink-900',
  accent: 'text-accent-600',
};

function KpiTile({
  icon,
  label,
  zh,
  value,
  status,
  tone = 'neutral',
  explanation,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  status?: string;
  tone?: Tone;
  explanation: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5">
      <span className="shrink-0 text-ink-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[11px] font-semibold text-ink-700">{label}</span>
          <EngineeringInfo zh={explanation} label={label} />
        </span>
        <span className="block truncate text-[10px] text-ink-400">{zh}</span>
        <span className={`block truncate text-[15px] leading-tight font-bold tabular ${TONE_TEXT[tone]}`}>
          {value}
        </span>
        {status && <span className="block truncate text-[10px] text-ink-400">{status}</span>}
      </span>
    </div>
  );
}

export function TemperatureKpiBar({
  statistics,
  minMargin_C,
  nodesAboveWarning,
  warningThreshold_C,
  scenarioName,
  stale,
}: {
  statistics: TemperatureStatistics;
  minMargin_C: number | null;
  nodesAboveWarning: number;
  warningThreshold_C: number;
  scenarioName: string;
  stale: boolean;
}) {
  // 09 §45 — a stale solution is not the current answer, so its numbers are not
  // shown as if they were.
  const live = stale ? null : statistics;

  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        icon={<Thermometer size={18} />}
        label="Max Temperature"
        zh="最高溫度"
        explanation={T09.maxTemperature}
        value={num(live?.max_C, 1, '°C')}
        status={live ? `${live.count} nodes in scope` : undefined}
        tone={live?.max_C == null ? 'neutral' : 'danger'}
      />
      <KpiTile
        icon={<Gauge size={18} />}
        label="Average Temperature"
        zh="平均溫度"
        explanation={T09.averageTemperature}
        value={num(live?.mean_C, 1, '°C')}
        status={live ? `median ${num(live.median_C, 1, '°C')}` : undefined}
      />
      <KpiTile
        icon={<TrendingUp size={18} />}
        label="P95 Temperature"
        zh="第 95 百分位溫度"
        explanation={T09.p95}
        value={num(live?.p95_C, 1, '°C')}
        status={live ? `P90 ${num(live.p90_C, 1, '°C')}` : undefined}
      />
      <KpiTile
        icon={<ShieldCheck size={18} />}
        label="Min Thermal Margin"
        zh="最小熱餘裕"
        explanation={T09.minThermalMargin}
        value={stale ? 'N/A' : num(minMargin_C, 1, '°C')}
        status="Limit − Temperature"
        tone={
          stale || minMargin_C == null
            ? 'neutral'
            : minMargin_C < 0
              ? 'danger'
              : minMargin_C <= 10
                ? 'warn'
                : 'ok'
        }
      />
      <KpiTile
        icon={<TriangleAlert size={18} />}
        label="Nodes Above Warning"
        zh="高於警示溫度的節點"
        explanation={T09.nodesAboveWarning}
        value={stale ? 'N/A' : String(nodesAboveWarning)}
        status={`above ${warningThreshold_C} °C`}
        tone={stale ? 'neutral' : nodesAboveWarning > 0 ? 'warn' : 'ok'}
      />
      <KpiTile
        icon={<Target size={18} />}
        label="Active Scenario"
        zh="目前情境"
        explanation="本頁所有統計、圖表與排名皆來自此 Scenario 於 07 的求解結果。"
        value={scenarioName || 'N/A'}
        status="analytical result / 解析解"
      />
    </div>
  );
}
