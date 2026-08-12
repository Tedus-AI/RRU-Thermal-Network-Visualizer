/**
 * Scenario Summary — 10 §7.
 *
 * Read-only: Active Scenario, Ambient, Wind, Solar, Power Scale, Solver Status
 * and Last Solved, with links out to the screens that own those inputs. 10 §7 is
 * explicit that nothing on Screen 10 edits them, so the values render as text
 * and the only affordances are navigation (AC-10-17's read-only spirit applied
 * to the inputs as well as to the graph).
 */

import { ArrowUpRight } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import type { Scenario } from '@/domain/project';
import type { SolverQualitySummary } from '@/thermal/overview/overviewTypes';

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

export function ScenarioSummaryPanel({
  scenario,
  solver,
  stale,
  onOpenBoundary,
  onOpenNetwork,
}: {
  scenario: Scenario;
  solver: SolverQualitySummary;
  stale: boolean;
  onOpenBoundary: () => void;
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
        <Row label="Ambient" zh="環境溫度" value={num(scenario.ambient_C, 1, '°C')} />
        <Row label="Wind" zh="風速" value={num(scenario.wind_mps, 1, 'm/s')} />
        <Row label="Solar" zh="太陽輻射" value={num(scenario.solar_W_m2, 0, 'W/m²')} />
        <Row
          label="Power Scale"
          zh="功率倍率"
          value={`${(scenario.power_scale * 100).toFixed(0)}%`}
        />
        <Row label="Solver Status" zh="求解狀態" value={stale ? `${solver.status} (stale)` : solver.status} />
        <Row label="Last Solved" zh="最後求解" value={timeOf(solver.solved_at)} />
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button
          className="!h-7 !px-2 !text-[11px]"
          icon={<ArrowUpRight className="size-3.5" />}
          onClick={onOpenBoundary}
        >
          View Boundary Conditions / 檢視邊界條件
        </Button>
        <Button
          className="!h-7 !px-2 !text-[11px]"
          icon={<ArrowUpRight className="size-3.5" />}
          onClick={onOpenNetwork}
        >
          View Thermal Network / 檢視熱網路
        </Button>
      </div>

      <p className="text-[10px] leading-relaxed text-ink-400">
        Read-only on this screen. Edit boundaries in 06 and topology in 05.
        <span className="block">本頁唯讀；邊界條件請於 06 修改，拓樸請於 05 修改。</span>
      </p>
    </div>
  );
}
