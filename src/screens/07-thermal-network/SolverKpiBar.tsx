/**
 * Solver KPI row — 07 §8.
 *
 * The six cards the specification requires, in its order: Solver Status,
 * Generated Heat, Rejected Heat, Energy Residual, Solved Nodes, Solved Edges.
 * Active Scenario is allowed as an extra (07 §8) and is shown as the seventh.
 * A Bottleneck KPI is explicitly forbidden and is not here.
 */

import type { ReactNode } from 'react';
import { Activity, CircleGauge, Flame, Layers, Share2, Snowflake, Wind } from 'lucide-react';

import type { Tone } from '@/ui/primitives';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { SolverState } from '@/thermal/types';

import { STATUS_TONE, STATUS_ZH, num, percent } from './resultViewModel';
import { T07 } from './tooltips';

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
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  status?: string;
  tone?: Tone;
  tooltip: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5"
      title={`${label} / ${zh} — ${tooltip}`}
    >
      <span className="shrink-0 text-ink-400">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-ink-700">{label}</span>
        <span className="block truncate text-[10px] text-ink-400">{zh}</span>
        <span className={`block truncate text-[15px] leading-tight font-bold tabular ${TONE_TEXT[tone]}`}>
          {value}
        </span>
        {status && <span className="block truncate text-[10px] text-ink-400">{status}</span>}
      </span>
    </div>
  );
}

export function SolverKpiBar({
  state,
  solution,
  stale,
  scenarioName,
}: {
  state: SolverState;
  solution: ThermalSolution | null;
  stale: boolean;
  scenarioName: string;
}) {
  const balance = solution?.energy_balance ?? null;
  // A stale solution is not the current answer, so its numbers are not shown as
  // if they were (07 §38). The cards fall back to "—" until a re-solve.
  const live = stale ? null : solution;
  const liveBalance = stale ? null : balance;

  const residualTone: Tone =
    liveBalance == null
      ? 'neutral'
      : liveBalance.grade === 'green'
        ? 'ok'
        : liveBalance.grade === 'warning'
          ? 'warn'
          : 'danger';

  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
      <KpiTile
        icon={<Activity size={18} />}
        label="Solver Status"
        zh="求解狀態"
        tooltip={T07.kpi.solverStatus}
        value={stale ? 'DIRTY' : state}
        status={STATUS_ZH[stale ? 'DIRTY' : state] ?? ''}
        tone={STATUS_TONE[stale ? 'DIRTY' : state] ?? 'neutral'}
      />
      <KpiTile
        icon={<Flame size={18} />}
        label="Generated Heat"
        zh="總發熱量"
        tooltip={T07.kpi.generatedHeat}
        value={num(liveBalance?.generated_W, 1, 'W')}
        status={
          liveBalance && liveBalance.solar_W > 0
            ? `component ${liveBalance.component_W.toFixed(1)} + solar ${liveBalance.solar_W.toFixed(1)}`
            : 'component dissipation / 元件發熱'
        }
      />
      <KpiTile
        icon={<Snowflake size={18} />}
        label="Rejected Heat"
        zh="排出熱量"
        tooltip={T07.kpi.rejectedHeat}
        value={num(liveBalance?.rejected_W, 1, 'W')}
        status="to fixed / boundary sinks"
      />
      <KpiTile
        icon={<CircleGauge size={18} />}
        label="Energy Residual"
        zh="能量殘差"
        tooltip={T07.kpi.energyResidual}
        value={liveBalance ? percent(liveBalance.error_pct) : 'N/A'}
        status={liveBalance ? `${num(liveBalance.residual_W, 2, 'W')} residual` : undefined}
        tone={residualTone}
      />
      <KpiTile
        icon={<Layers size={18} />}
        label="Solved Nodes"
        zh="已求解節點"
        tooltip={T07.kpi.solvedNodes}
        value={live ? String(live.metadata.solved_nodes) : 'N/A'}
        status={live ? `${live.metadata.fixed_nodes} fixed / 固定溫度` : undefined}
      />
      <KpiTile
        icon={<Share2 size={18} />}
        label="Solved Edges"
        zh="已求解連線"
        tooltip={T07.kpi.solvedEdges}
        value={live ? String(live.metadata.solved_edges) : 'N/A'}
        status={live ? `matrix ${live.metadata.matrix_size} × ${live.metadata.matrix_size}` : undefined}
      />
      <KpiTile
        icon={<Wind size={18} />}
        label="Active Scenario"
        zh="目前情境"
        tooltip="求解使用的情境。每個情境保留自己的解。"
        value={scenarioName || 'N/A'}
        status={solution ? `ambient ${num(solution.metadata.ambient_C, 1, '°C')}` : undefined}
      />
    </div>
  );
}
