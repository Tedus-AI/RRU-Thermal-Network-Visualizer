/**
 * Six KPI cards — 10 §6.
 *
 * Exactly the six the specification names, in its order: Overall Status, Max
 * Temperature, Worst Thermal Margin, Top Bottleneck, Energy Balance, Total
 * Power. Top Bottleneck comes from Screen 08 and says `Not Available` when 08
 * has nothing current — it is never back-filled with the largest Rth, which is
 * the exact mistake Screen 08 exists to prevent (10 §6, AC-10-08).
 */

import {
  Activity,
  BadgeCheck,
  Gauge,
  Shield,
  Thermometer,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { EngineeringInfo } from '@/ui/FieldLabel';
import type { Tone } from '@/ui/primitives';
import type { EnergyGrade } from '@/thermal/solver/solverTypes';
import type { OverallThermalStatus, ResultsOverviewKpis } from '@/thermal/overview/overviewTypes';
import { OVERALL_STATUS_LABELS } from '@/thermal/overview/overviewTypes';

import { ENERGY_TONE, OVERALL_TONE, num, pct, signed } from './overviewViewModel';
import { T10 } from './tooltips';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  accent: 'text-accent-700',
  neutral: 'text-ink-700',
};

function KpiCard({
  icon: Icon,
  label,
  zh,
  explanation,
  value,
  valueTone = 'neutral',
  note,
  compact,
}: {
  icon: LucideIcon;
  label: string;
  zh: string;
  explanation: string;
  value: string;
  valueTone?: Tone;
  note?: string;
  /** Long text values (an edge label) need a smaller type size to stay on one line. */
  compact?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
      <header className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span className="truncate text-[11.5px] font-bold text-ink-700">{label}</span>
        <EngineeringInfo zh={explanation} label={label} />
      </header>
      <p className="text-[10px] text-ink-400">{zh}</p>
      <p
        className={`truncate font-bold tabular ${compact ? 'text-[15px]' : 'text-[22px]'} ${TONE_TEXT[valueTone]}`}
        title={value}
      >
        {value}
      </p>
      <p className="truncate text-[10px] text-ink-400" title={note}>
        {note ?? ' '}
      </p>
    </section>
  );
}

export function ResultsKpiBar({
  status,
  kpis,
  energyGrade,
  bottleneckAvailable,
  monitoredCount,
}: {
  status: OverallThermalStatus;
  kpis: ResultsOverviewKpis;
  energyGrade: EnergyGrade;
  bottleneckAvailable: boolean;
  monitoredCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={BadgeCheck}
        label="Overall Status"
        zh="整體熱狀態"
        explanation={T10.overallStatus}
        value={status}
        valueTone={OVERALL_TONE[status]}
        note={OVERALL_STATUS_LABELS[status].zh}
        compact={status.length > 7}
      />
      <KpiCard
        icon={Thermometer}
        label="Max Temperature"
        zh="最高溫度"
        explanation={T10.maxTemperature}
        value={num(kpis.max_temperature_C, 1, '°C')}
        valueTone="danger"
        note={kpis.max_temperature_node ?? undefined}
      />
      <KpiCard
        icon={Shield}
        label="Worst Thermal Margin"
        zh="最小熱餘裕"
        explanation={T10.worstThermalMargin}
        value={signed(kpis.worst_margin_C, 1, '°C')}
        valueTone={
          kpis.worst_margin_C == null
            ? 'neutral'
            : kpis.worst_margin_C < 0
              ? 'danger'
              : kpis.worst_margin_C <= 10
                ? 'warn'
                : 'ok'
        }
        note={
          kpis.worst_margin_C == null
            ? `No monitored node · ${monitoredCount} with limits`
            : (kpis.worst_margin_node ?? undefined)
        }
      />
      <KpiCard
        icon={Activity}
        label="Top Bottleneck"
        zh="首要瓶頸"
        explanation={T10.topBottleneck}
        // 10 §6, §21 — absence is stated, never filled in.
        value={kpis.top_bottleneck ?? 'Not Available'}
        valueTone={kpis.top_bottleneck ? 'accent' : 'neutral'}
        note={bottleneckAvailable ? 'From Screen 08 / 來自 08' : 'Run Screen 08 / 請先執行 08'}
        compact
      />
      <KpiCard
        icon={Gauge}
        label="Energy Balance"
        zh="能量守恆誤差"
        explanation={T10.energyBalance}
        value={pct(kpis.energy_error_pct)}
        valueTone={ENERGY_TONE[energyGrade]}
        note="Generated vs rejected / 產生對排出"
      />
      <KpiCard
        icon={Zap}
        label="Total Power"
        zh="總熱功率"
        explanation={T10.totalPower}
        value={num(kpis.total_power_W, 1, 'W')}
        valueTone="neutral"
        note="Injected into the solve / 注入求解的總熱量"
      />
    </div>
  );
}
