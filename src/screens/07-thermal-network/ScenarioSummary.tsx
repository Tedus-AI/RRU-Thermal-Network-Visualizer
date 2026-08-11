/**
 * Scenario Summary — 07 §10.
 *
 * Read-only. Ambient, wind, solar, power scale and boundary count come from
 * Screen 06 and the scenario record; editing any of them means going back to
 * Screen 06, which is what the button does.
 */

import { ArrowLeft } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import type { Scenario } from '@/domain/project';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';

import { num } from './resultViewModel';
import { T07 } from './tooltips';

function Row({ label, zh, value }: { label: string; zh: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">
        {label}
        <span className="ml-1 font-normal text-ink-400">/ {zh}</span>
      </span>
      <span className="shrink-0 text-[12px] font-bold text-ink-900 tabular">{value}</span>
    </div>
  );
}

export function ScenarioSummary({
  scenario,
  set,
  boundaryCount,
  portCount,
  solarLoadCount,
  onEditBoundary,
}: {
  scenario: Scenario | null;
  set: ScenarioBoundaryConditionSet | null;
  boundaryCount: number;
  /** Boundary ports Screen 05 left open, for the "n of m" reading. */
  portCount: number;
  solarLoadCount: number;
  onEditBoundary: () => void;
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-center gap-2">
        <span className="truncate text-[13px] font-bold text-ink-900">
          {scenario?.name ?? 'No scenario / 尚未選擇情境'}
        </span>
        {set && (
          <Badge tone={set.status === 'ready_for_solve' ? 'ok' : 'warn'}>
            {set.status.replace(/_/g, ' ').toUpperCase()}
          </Badge>
        )}
      </div>

      <div>
        <Row
          label="Ambient"
          zh="環境溫度"
          value={num(set?.ambient.external_ambient_C ?? scenario?.ambient_C, 1, '°C')}
        />
        <Row
          label="Wind"
          zh="風速"
          value={num(set?.site.wind_speed_m_s ?? scenario?.wind_mps, 1, 'm/s')}
        />
        <Row
          label="Solar"
          zh="太陽輻照"
          value={
            set?.site.solar_enabled === false
              ? 'Disabled / 未啟用'
              : num(set?.site.solar_irradiance_W_m2 ?? scenario?.solar_W_m2, 0, 'W/m²')
          }
        />
        <Row label="Power Scale" zh="功率縮放" value={`${(scenario?.power_scale ?? 1).toFixed(2)} ×`} />
        <Row
          label="Boundaries"
          zh="邊界條件"
          value={`${boundaryCount} / ${portCount} ports`}
        />
        {solarLoadCount > 0 && (
          <Row label="Solar Loads" zh="太陽負載" value={`${solarLoadCount} injected`} />
        )}
      </div>

      <Button
        icon={<ArrowLeft size={14} />}
        className="h-8 !text-[12px]"
        title={biTitle('Edit boundary conditions in Screen 06', T07.action.backTo06)}
        onClick={onEditBoundary}
      >
        Edit Boundary Conditions / 編輯邊界條件
      </Button>
    </div>
  );
}
