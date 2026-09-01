/**
 * Solver KPI row — 07 §8, trimmed from seven cards to three.
 *
 * The specification names six and allows Active Scenario as a seventh. Four of
 * those said something the screen was already saying somewhere else:
 *
 *   Solver Status  — the badge beside the page title says it, and the status
 *                    overlay on the graph says it again.
 *   Solved Nodes   — 85/85 and an 83×83 matrix are how the run went, not what
 *   Solved Edges     it found; they belong with the other run metadata, which
 *                    is now in the status overlay.
 *   Active Scenario— named twice already in the header, in the scenario picker
 *                    and in the badge row.
 *
 * What is left is the three numbers that decide whether to believe the answer:
 * how much heat went in, how much came out, and whether they agree. Those are
 * not available anywhere else on the screen, and reading them together is the
 * whole check.
 *
 * The tile is Screen 06's — label and value on one line, Chinese and status
 * beneath — which is about half the height of the old one.
 */

import type { ReactNode } from 'react';
import { CircleGauge, Flame, Snowflake } from 'lucide-react';

import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import { num, percent } from './resultViewModel';
import { T07 } from './tooltips';

function KpiTile({
  icon,
  label,
  zh,
  value,
  status,
  tone = 'text-ink-900',
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  status?: string;
  tone?: string;
  tooltip: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-line bg-surface px-2 py-2"
      title={`${label} / ${zh} — ${tooltip}`}
    >
      <span className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-semibold text-ink-900">
        <span className="shrink-0 text-ink-400">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={`shrink-0 pl-2 font-bold tabular ${tone}`}>{value}</span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-400">
        <span className="min-w-0 flex-1 truncate">{zh}</span>
        {status && <span className="shrink-0 truncate text-[10px]">{status}</span>}
      </span>
    </div>
  );
}

export function SolverKpiBar({
  solution,
  stale,
}: {
  solution: ThermalSolution | null;
  stale: boolean;
}) {
  // A stale solution is not the current answer, so its numbers are not shown as
  // if they were (07 §38). The cards fall back to N/A until a re-solve.
  const balance = stale ? null : (solution?.energy_balance ?? null);

  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
      <KpiTile
        icon={<Flame size={13} />}
        label="Generated Heat"
        zh="總發熱量"
        tooltip={T07.kpi.generatedHeat}
        value={num(balance?.generated_W, 1, 'W')}
        status={
          balance && balance.solar_W > 0
            ? `component ${balance.component_W.toFixed(1)} + solar ${balance.solar_W.toFixed(1)}`
            : '元件發熱'
        }
      />
      <KpiTile
        icon={<Snowflake size={13} />}
        label="Rejected Heat"
        zh="排出熱量"
        tooltip={T07.kpi.rejectedHeat}
        value={num(balance?.rejected_W, 1, 'W')}
        status="至固定溫度／邊界"
      />
      <KpiTile
        icon={<CircleGauge size={13} />}
        label="Energy Residual"
        zh="能量殘差"
        tooltip={T07.kpi.energyResidual}
        value={balance ? percent(balance.error_pct) : 'N/A'}
        status={balance ? `${num(balance.residual_W, 2, 'W')} 殘差` : undefined}
        tone={
          balance == null
            ? 'text-ink-900'
            : balance.grade === 'green'
              ? 'text-ok-600'
              : balance.grade === 'warning'
                ? 'text-warn-600'
                : 'text-danger-600'
        }
      />
    </div>
  );
}
