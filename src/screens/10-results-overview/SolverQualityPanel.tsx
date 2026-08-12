/**
 * Solver / Energy Quality — 10 §11.
 *
 * The seven values the specification lists, graded with Screen 07's own
 * thresholds (<0.5% GOOD, 0.5–2.0% WARNING, >2.0% ERROR). The grade is computed
 * by Screen 07's `energyGrade`, not by a second copy of the numbers here, so the
 * two screens cannot drift apart (AC-10-13).
 */

import { Badge } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import type { SolverQualitySummary } from '@/thermal/overview/overviewTypes';

import { ENERGY_GRADE_LABEL, ENERGY_TONE, num, pct, timeOf } from './overviewViewModel';
import { T10 } from './tooltips';

function Row({
  label,
  zh,
  value,
  explanation,
  strong,
}: {
  label: string;
  zh: string;
  value: string;
  explanation?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/60 py-1 last:border-0">
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink-500">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-ink-400">{zh}</span>
        {explanation && <EngineeringInfo zh={explanation} label={label} align="left" />}
      </span>
      <span
        className={`shrink-0 tabular ${strong ? 'text-[12px] font-bold text-ink-900' : 'text-[11px] font-semibold text-ink-700'}`}
      >
        {value}
      </span>
    </div>
  );
}

export function SolverQualityPanel({ solver }: { solver: SolverQualitySummary }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <Badge tone={solver.status === 'SOLVED' ? 'ok' : solver.status === 'WARNING' ? 'warn' : 'danger'}>
          Solver {solver.status}
        </Badge>
        <Badge tone={ENERGY_TONE[solver.quality]}>
          <span className="flex items-center gap-1">
            Energy {ENERGY_GRADE_LABEL[solver.quality].label}
            <EngineeringInfo zh={T10.energyBalance} label="Energy Balance" />
          </span>
        </Badge>
      </div>

      <Row label="Solved Nodes" zh="已求解節點" value={`${solver.solved_nodes}`} />
      <Row label="Solved Edges" zh="已求解連線" value={`${solver.solved_edges}`} />
      <Row label="Generated Heat" zh="產生熱量" value={num(solver.generated_W, 1, 'W')} />
      <Row label="Rejected Heat" zh="排出熱量" value={num(solver.rejected_W, 1, 'W')} />
      <Row
        label="Energy Residual"
        zh="能量殘差"
        value={num(solver.residual_W, 3, 'W')}
        explanation={T10.energyResidual}
      />
      <Row
        label="Energy Error"
        zh="能量誤差"
        value={pct(solver.energy_error_pct)}
        explanation={T10.energyBalance}
        strong
      />
      <Row label="Last Solved" zh="最後求解時間" value={timeOf(solver.solved_at)} />

      <p className="pt-1 text-[10px] leading-relaxed text-ink-400">
        Thresholds follow Screen 07: &lt;0.5% GOOD · 0.5–2.0% WARNING · &gt;2.0% ERROR.
        <span className="block">品質門檻沿用 07：&lt;0.5% 良好，0.5–2.0% 警告，&gt;2.0% 錯誤。</span>
      </p>
    </div>
  );
}
