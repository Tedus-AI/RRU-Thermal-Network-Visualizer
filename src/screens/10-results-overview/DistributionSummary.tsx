/**
 * Temperature Distribution Summary — 10 §10.
 *
 * Average, P95, Nodes Above Warning, Temperature Range and the distribution row
 * count, read from Screen 09's dataset. 10 §10 is explicit that the Screen 09
 * histogram is NOT redrawn here and that this screen carries no distribution
 * controls (§24) — the compact Min ─ Average ─ P95 ─ Max bar is the whole of the
 * visual, and anything more detailed is a trip back to Screen 09.
 */

import { ArrowRight, Ban } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import type { TemperatureSummary } from '@/thermal/overview/overviewTypes';

import { num, rangePosition } from './overviewViewModel';
import { T10 } from './tooltips';

function Stat({
  label,
  zh,
  value,
  tone = 'text-ink-900',
  explanation,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  explanation?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-500">
        <span className="truncate">{label}</span>
        {explanation && <EngineeringInfo zh={explanation} label={label} />}
      </p>
      <p className="text-[10px] text-ink-400">{zh}</p>
      <p className={`text-[15px] font-bold tabular ${tone}`}>{value}</p>
    </div>
  );
}

/** 10 §10 — the compact range bar. Min ─ Average ─ P95 ─ Max, nothing else. */
function TemperatureRangeBar({ summary }: { summary: TemperatureSummary }) {
  const markers = [
    { key: 'average', label: 'Avg', value: summary.average_C, color: '#16a34a' },
    { key: 'p95', label: 'P95', value: summary.p95_C, color: '#7c3aed' },
  ];

  return (
    <div className="mt-1">
      <p className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-500">
        Temperature Range
        <span className="font-normal text-ink-400">/ 溫度範圍</span>
        <EngineeringInfo zh={T10.temperatureRangeBar} label="Temperature Range" />
      </p>

      <div className="relative mt-4 mb-5 h-2.5 rounded-full bg-gradient-to-r from-[#2563eb] via-[#22c55e] to-[#dc2626]">
        {markers.map((marker) => {
          const position = rangePosition(marker.value, summary.min_C, summary.max_C);
          if (position == null) return null;
          return (
            <span
              key={marker.key}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position * 100}%` }}
            >
              <span
                className="block size-3.5 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: marker.color }}
              />
              <span
                className="absolute top-4 left-1/2 -translate-x-1/2 text-[9.5px] font-semibold whitespace-nowrap"
                style={{ color: marker.color }}
              >
                {marker.label} {num(marker.value, 1)}
              </span>
            </span>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] font-semibold text-ink-500 tabular">
        <span>Min {num(summary.min_C, 1, '°C')}</span>
        <span>Max {num(summary.max_C, 1, '°C')}</span>
      </div>
    </div>
  );
}

export function DistributionSummary({
  summary,
  onOpenDistribution,
}: {
  summary: TemperatureSummary | null;
  onOpenDistribution: () => void;
}) {
  if (!summary) {
    return (
      <div className="flex flex-col items-start gap-2 py-4">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-ink-700">
          <Ban className="size-4 text-ink-400" aria-hidden />
          Temperature distribution is not available for this scenario.
        </p>
        <p className="text-[11px] text-ink-500">此情境沒有可用的溫度分佈資料。</p>
        <Button icon={<ArrowRight className="size-4" />} onClick={onOpenDistribution}>
          Open Temperature Distribution / 開啟溫度分佈
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Average Temperature" zh="平均溫度" value={num(summary.average_C, 1, '°C')} />
        <Stat
          label="P95 Temperature"
          zh="第 95 百分位溫度"
          value={num(summary.p95_C, 1, '°C')}
          tone="text-[#7c3aed]"
        />
        <Stat
          label="Nodes Above Warning"
          zh="高於警示溫度的節點"
          value={`${summary.nodes_above_warning}`}
          tone={summary.nodes_above_warning > 0 ? 'text-warn-600' : 'text-ok-600'}
          explanation={T10.nodesAboveWarning}
        />
        <Stat
          label="Distribution Rows"
          zh="分佈資料列數"
          value={`${summary.row_count}`}
          tone="text-ink-700"
        />
      </div>

      <TemperatureRangeBar summary={summary} />

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[10.5px] text-ink-400">
        <span>Scope: {summary.scope_label}</span>
        <span>Warning threshold: {summary.warning_threshold_C} °C</span>
        {/* 10 §22 — 10 may say a comparison exists; it never draws one. */}
        <button
          type="button"
          onClick={onOpenDistribution}
          className="font-bold text-accent-600 hover:underline"
        >
          Comparison Available — Open Temperature Distribution / 可比較，前往 09
        </button>
      </p>
    </div>
  );
}
