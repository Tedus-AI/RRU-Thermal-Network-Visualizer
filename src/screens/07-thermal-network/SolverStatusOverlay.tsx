/**
 * Solver Status and Solver Messages, merged into one collapsible overlay.
 *
 * They were two docked panels, and between them they said the same thing three
 * times: a status row reading SOLVED, a "Clear / Blocked" badge over the message
 * list, and an energy-residual row duplicating the KPI card two inches above.
 * Docked, they also cost the graph a whole column.
 *
 * So: one overlay in the graph's corner, in the shape Screen 05 already uses for
 * validation — collapsed to a single line of counts, opened when there is
 * something to read. The run metadata (solve time, matrix size, residual) lives
 * here too, which is why those three KPI cards could go: this is where you look
 * when you are asking whether the run was sound, and the KPI row is where you
 * look when you are asking what it produced.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, CircleAlert, Info } from 'lucide-react';

import type { SolverIssue, ThermalSolution } from '@/thermal/solver/solverTypes';
import type { SolverState } from '@/thermal/types';

import { SolverValidationPanel } from './SolverValidationPanel';
import { STATUS_ZH, percent, timeOf } from './resultViewModel';

function MetaRow({ zh, value }: { zh: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-[10px] text-ink-500">{zh}</span>
      <span className="truncate text-right text-[10px] font-semibold tabular text-ink-800">
        {value}
      </span>
    </div>
  );
}

export function SolverStatusOverlay({
  state,
  stale,
  solution,
  issues,
  hasRun,
  onFocus,
  onNavigate,
}: {
  state: SolverState;
  stale: boolean;
  solution: ThermalSolution | null;
  issues: SolverIssue[];
  hasRun: boolean;
  onFocus: (issue: SolverIssue) => void;
  onNavigate: (screen: '05' | '06') => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = stale ? 'DIRTY' : state;
  const errors = issues.filter((entry) => entry.severity === 'error').length;
  const warnings = issues.filter((entry) => entry.severity === 'warning').length;
  const infos = issues.length - errors - warnings;

  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[24rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border border-line bg-surface/95 shadow-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="求解狀態與訊息"
        className="flex w-full shrink-0 items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span
          className={`text-[11px] font-bold ${
            shown === 'FAILED'
              ? 'text-danger-600'
              : shown === 'SOLVED'
                ? 'text-ok-600'
                : shown === 'DIRTY' || shown === 'WARNING'
                  ? 'text-warn-600'
                  : 'text-ink-700'
          }`}
        >
          {STATUS_ZH[shown] ?? shown}
          <span className="ml-1 font-semibold text-ink-400">求解訊息</span>
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] font-bold">
          <span className="flex items-center gap-1 text-danger-600">
            <CircleAlert size={12} /> {errors}
          </span>
          <span className="flex items-center gap-1 text-warn-600">
            <AlertTriangle size={12} /> {warnings}
          </span>
          <span className="flex items-center gap-1 text-accent-600">
            <Info size={12} /> {infos}
          </span>
        </span>
        <ChevronDown size={13} className={`shrink-0 text-ink-400 ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="min-h-0 overflow-y-auto border-t border-line px-2.5 py-1.5">
          <MetaRow zh="上次求解" value={timeOf(solution?.solved_at)} />
          <MetaRow
            zh="求解時間"
            value={solution ? `${solution.metadata.solve_time_ms.toFixed(1)} ms` : '—'}
          />
          <MetaRow
            zh="矩陣"
            value={
              solution
                ? `${solution.metadata.matrix_size} × ${solution.metadata.matrix_size}・${solution.metadata.solved_nodes} 個節點／${solution.metadata.solved_edges} 條連線`
                : '—'
            }
          />
          <MetaRow
            zh="最大節點失衡"
            value={solution ? `${solution.metadata.max_node_residual_W.toExponential(1)} W` : '—'}
          />
          <MetaRow
            zh="能量殘差"
            value={solution ? percent(solution.energy_balance.error_pct) : '—'}
          />

          <div className="mt-1.5 border-t border-line pt-1.5">
            <SolverValidationPanel
              issues={issues}
              hasRun={hasRun}
              onFocus={onFocus}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
