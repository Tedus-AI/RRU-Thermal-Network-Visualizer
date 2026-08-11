/**
 * Boundary Summary (PNG §3 lower card).
 *
 * A read-back of the scenario's own inputs, so the engineer can check the whole
 * environment at a glance without opening five tabs. Everything here is an
 * input; nothing is a result.
 */

import { Bi } from '@/ui/FieldLabel';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { BoundarySummary } from './boundaryViewModel';
import { formatNumber } from './boundaryViewModel';

function Row({ label, zh, value }: { label: string; zh: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1 last:border-b-0">
      <span className="text-[11px] text-ink-500">
        {label} <span className="text-ink-400">/ {zh}</span>
      </span>
      <span className="shrink-0 text-[11px] font-semibold tabular text-ink-900">{value}</span>
    </div>
  );
}

export function BoundarySummaryCard({
  set,
  summary,
}: {
  set: ScenarioBoundaryConditionSet;
  summary: BoundarySummary;
}) {
  return (
    <div>
      <Row
        label="Ambient Temperature"
        zh="環境溫度"
        value={formatNumber(set.ambient.external_ambient_C, 1, '°C')}
      />
      <Row
        label="Wind Speed"
        zh="風速"
        value={formatNumber(set.site.wind_speed_m_s, 1, 'm/s')}
      />
      <Row
        label="Solar Irradiance"
        zh="太陽輻照度"
        value={
          set.site.solar_enabled
            ? formatNumber(set.site.solar_irradiance_W_m2, 0, 'W/m²')
            : 'Disabled'
        }
      />
      <Row
        label="Solar Angle"
        zh="入射角"
        value={set.site.solar_enabled ? formatNumber(set.site.solar_incidence_deg, 0, '°') : '—'}
      />
      <Row
        label="Air Flow Mode"
        zh="氣流模式"
        value={set.site.airflow_mode.replace(/_/g, ' ')}
      />
      <Row
        label="Convection Method"
        zh="對流計算方式"
        value={set.site.convection_method.replace(/_/g, ' ')}
      />
      <Row label="Surface Count" zh="表面數量" value={String(set.surface_properties.length)} />
      <Row
        label="Convection Profiles"
        zh="對流條件數"
        value={String(summary.convectionProfiles)}
      />
      <Row label="Radiation Profiles" zh="輻射條件數" value={String(summary.radiationProfiles)} />
      <Row label="Solar Loads" zh="太陽負載數" value={String(summary.solarLoads)} />
      <Row
        label="Fixed Temperature"
        zh="固定溫度邊界"
        value={String(summary.fixedTemperatureProfiles)}
      />
      <Row label="Adiabatic" zh="絕熱邊界" value={String(summary.adiabaticProfiles)} />

      <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
        <Bi
          en="Scenario inputs only. Screen 07 turns them into temperatures."
          zh="皆為情境輸入值，溫度由 07 求解產生。"
          inline
        />
      </p>
    </div>
  );
}
