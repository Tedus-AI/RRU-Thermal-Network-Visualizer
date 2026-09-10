/**
 * Scenario Summary — the conditions the answer rests on.
 *
 * It used to be six rows and two buttons, one of which read "View Boundary
 * Conditions" and sent the reader to Screen 06 to find out how the heat leaves
 * the machine. That is four short rows of numbers, and it is exactly what a
 * reader checking a conclusion wants beside the conclusion — so it is here,
 * read from the set Screen 07 solved with rather than recomputed.
 *
 * The other button stays but stops being a trip: the thermal network opens in
 * a window over this screen, so looking at the graph no longer costs the page
 * you were reading.
 *
 * Still read-only. That used to be said in a footnote under the buttons; every
 * value renders as text and nothing here is an input, which says it better.
 */

import { Network } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import type { Scenario } from '@/domain/project';
import type { SolverQualitySummary } from '@/thermal/overview/overviewTypes';
import type { BoundarySummary } from '@/thermal/overview/boundarySummary';

import { num, timeOf } from './overviewViewModel';
import { T10 } from './tooltips';

function Row({ label, zh, value }: { label: string; zh: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/60 py-1 last:border-0">
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink-500">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-ink-400">{zh}</span>
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-ink-900 tabular">{value}</span>
    </div>
  );
}

const DERIVATION: Record<'fin_array' | 'flat_plate', { label: string; zh: string }> = {
  fin_array: { label: 'from fin geometry', zh: '由鰭片幾何推導' },
  flat_plate: { label: 'from plate correlation', zh: '由平板關聯式推導' },
};

export function ScenarioSummaryPanel({
  scenario,
  solver,
  stale,
  boundary,
  onOpenNetwork,
}: {
  scenario: Scenario;
  solver: SolverQualitySummary;
  stale: boolean;
  /** Screen 06's set, as the solve used it. Null before one exists. */
  boundary: BoundarySummary | null;
  onOpenNetwork: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{scenario.name}</Badge>
        <Badge tone={stale ? 'neutral' : solver.status === 'SOLVED' ? 'ok' : 'warn'}>
          {stale ? 'STALE' : solver.status}
        </Badge>
        <EngineeringInfo zh={T10.scenarioSummary} label="Scenario Summary" />
      </div>

      <div>
        <Row
          label="Ambient"
          zh="環境溫度"
          value={num(boundary?.external_ambient_C ?? scenario.ambient_C, 1, '°C')}
        />
        {boundary?.internal_air_C != null && (
          <Row label="Internal Air" zh="機內空氣" value={num(boundary.internal_air_C, 1, '°C')} />
        )}
        <Row label="Wind" zh="風速" value={num(scenario.wind_mps, 1, 'm/s')} />
        <Row
          label="Solar"
          zh="太陽輻射"
          value={
            boundary && boundary.solar_W > 0
              ? `${num(scenario.solar_W_m2, 0, 'W/m²')} · ${num(boundary.solar_W, 1, 'W')}`
              : num(scenario.solar_W_m2, 0, 'W/m²')
          }
        />
        <Row
          label="Power Scale"
          zh="功率倍率"
          value={`${(scenario.power_scale * 100).toFixed(0)}%`}
        />
        <Row label="Last Solved" zh="最後求解" value={timeOf(solver.solved_at)} />
      </div>

      {/* How the heat leaves, in the order it leaves by. */}
      <div className="pt-0.5">
        <p className="flex items-center gap-1 text-[11px] font-bold text-ink-700">
          Boundary Conditions
          <span className="font-semibold text-ink-400">/ 邊界條件</span>
          <EngineeringInfo zh={T10.boundarySummary} label="Boundary Conditions" />
        </p>
        {!boundary || boundary.surfaces.length === 0 ? (
          <p className="pt-1 text-[10px] text-ink-400">
            No dissipating surface is assigned yet.
            <span className="ml-1">尚未指派任何散熱面。</span>
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {boundary.surfaces.map((surface) => (
              <li
                key={surface.port_id}
                className="rounded-md border border-line bg-surface-muted px-2 py-1.5"
              >
                <span className="flex items-baseline gap-1.5">
                  <span
                    className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-900"
                    title={surface.name}
                  >
                    {surface.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tabular text-accent-700">
                    {surface.R_total_C_per_W == null
                      ? '—'
                      : `${num(surface.R_total_C_per_W, 3)} °C/W`}
                  </span>
                </span>
                <span className="block truncate text-[10px] text-ink-400" title={surface.kind}>
                  {surface.kind_zh}
                  {surface.derivation && ` · ${DERIVATION[surface.derivation].zh}`}
                </span>
                {/* h in the two halves it is made of: they reach the same air in
                    parallel, so the conductances add and R = 1/(h_total·A). One
                    half beside a resistance built from both is unreproducible. */}
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] tabular text-ink-500">
                  {surface.h_total_W_m2K != null && (
                    <span>
                      h {num(surface.h_total_W_m2K, 2)} W/m²K
                      {surface.h_conv_W_m2K != null && surface.h_rad_W_m2K != null && (
                        <span className="text-ink-400">
                          {' '}
                          = {num(surface.h_conv_W_m2K, 2)} 對流 + {num(surface.h_rad_W_m2K, 2)} 輻射
                        </span>
                      )}
                    </span>
                  )}
                  {surface.area_m2 != null && <span>A {num(surface.area_m2, 3)} m²</span>}
                  {surface.completeness === 'warning' && (
                    <span
                      className="font-semibold text-warn-600"
                      title={biTitle(
                        'Screen 06 marked this surface as resting on an assumption',
                        '06 標示此面帶有假設',
                      )}
                    >
                      assumption / 含假設
                    </span>
                  )}
                </span>
                {/* Why 1/(h·A) is not the whole path on a finned surface. */}
                {surface.fin_conduction_C_per_W != null && surface.R_surface_C_per_W != null && (
                  <span className="mt-0.5 block text-[10px] tabular text-ink-400">
                    表面 {num(surface.R_surface_C_per_W, 3)} ＋ 鰭片導熱{' '}
                    {num(surface.fin_conduction_C_per_W, 3)} °C/W
                    {surface.fin_effectiveness != null &&
                      `（有效效率 ${num(surface.fin_effectiveness, 3)}）`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button
          className="!h-7 !px-2 !text-[11px]"
          icon={<Network className="size-3.5" />}
          onClick={onOpenNetwork}
        >
          View Thermal Network / 檢視熱網路
        </Button>
      </div>
    </div>
  );
}
