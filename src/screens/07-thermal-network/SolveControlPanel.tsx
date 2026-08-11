/**
 * Solver Settings + Solve Controls — 07 §9, §14, PNG section 1.
 *
 * A deliberate departure from the mockup, stated rather than hidden: the PNG's
 * settings panel shows Convergence Tolerance, Max Iterations, Initial Guess and
 * an Under-Relaxation factor, and its status card reports "Converged in 27
 * iterations". Those belong to an ITERATIVE solver. This engine solves
 * [G][T] = [P] directly — assemble once, factor once, done — so there is no
 * iteration count, no convergence history and no relaxation factor to show.
 * Inventing them would put fabricated numbers on an engineering screen.
 *
 * What the panel shows instead is what the direct solver genuinely has: the
 * engine, the matrix size, the pivot tolerance, the energy-balance thresholds
 * that decide the result grade, and the scenario power scale.
 */

import { Play, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

import { Badge, Button, NumberInput } from '@/ui/primitives';
import { FieldLabel, biTitle } from '@/ui/FieldLabel';
import type { SolverSettings, SolverState } from '@/thermal/types';
import { SOLVER_ENGINE, SOLVER_VERSION } from '@/thermal/solver/solverTypes';

import { num } from './resultViewModel';
import { T07 } from './tooltips';

function Row({ label, zh, value, tooltip }: { label: string; zh: string; value: string; tooltip?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0"
      title={tooltip ? `${label} / ${zh} — ${tooltip}` : `${label} / ${zh}`}
    >
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">
        {label}
        <span className="ml-1 font-normal text-ink-400">/ {zh}</span>
      </span>
      <span className="shrink-0 text-[12px] font-bold text-ink-900 tabular">{value}</span>
    </div>
  );
}

export function SolveControlPanel({
  state,
  settings,
  matrixSize,
  powerScale,
  readOnly,
  canSolve,
  hasSolution,
  solving,
  onSettings,
  onPreSolveCheck,
  onSolve,
  onReset,
}: {
  state: SolverState;
  settings: SolverSettings;
  matrixSize: number | null;
  powerScale: number;
  readOnly: boolean;
  canSolve: boolean;
  hasSolution: boolean;
  solving: boolean;
  onSettings: (patch: Partial<SolverSettings>) => void;
  onPreSolveCheck: () => void;
  onSolve: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <Row
          label="Solver Engine"
          zh="求解引擎"
          value={`Direct · ${SOLVER_VERSION}`}
          tooltip={T07.field.solverEngine}
        />
        <Row label="Method" zh="方法" value="Gaussian elimination" tooltip={SOLVER_ENGINE} />
        <Row
          label="Matrix Size"
          zh="矩陣大小"
          value={matrixSize == null ? 'N/A' : `${matrixSize} × ${matrixSize}`}
        />
        <Row
          label="Pivot Tolerance"
          zh="主元容許值"
          value="1e-14"
          tooltip="小於此值的主元視為奇異矩陣，求解會中止並回報原因。"
        />
        <Row
          label="Power Scale"
          zh="功率縮放"
          value={`${powerScale.toFixed(2)} ×`}
          tooltip={T07.field.powerScale}
        />
      </div>

      <p
        className="rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-[11px] leading-snug text-ink-500"
        title={T07.field.solverEngine}
      >
        Direct solve — no iteration count.
        <span className="text-ink-400"> / 直接法，無迭代次數。</span>
      </p>

      <p className="-mb-1 text-[11px] font-semibold text-ink-700">
        Energy Balance Thresholds <span className="font-normal text-ink-400">/ 能量平衡門檻</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel
            label="Warn"
            zh="能量平衡警告門檻"
            inline={false}
            unit="%"
            htmlFor="solver-warn-pct"
            tooltip={T07.field.energyWarnPct}
          />
          <NumberInput
            id="solver-warn-pct"
            className="mt-1 h-8 !text-[12px]"
            step={0.1}
            min={0}
            value={settings.energy_warn_pct}
            disabled={readOnly}
            onChange={(event) =>
              onSettings({ energy_warn_pct: Number(event.target.value) || 0 })
            }
          />
        </div>
        <div>
          <FieldLabel
            label="Error"
            zh="能量平衡錯誤門檻"
            inline={false}
            unit="%"
            htmlFor="solver-error-pct"
            tooltip={T07.field.energyErrorPct}
          />
          <NumberInput
            id="solver-error-pct"
            className="mt-1 h-8 !text-[12px]"
            step={0.1}
            min={0}
            value={settings.energy_error_pct}
            disabled={readOnly}
            onChange={(event) =>
              onSettings({ energy_error_pct: Number(event.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Button
          variant="primary"
          icon={hasSolution ? <RefreshCw size={15} /> : <Play size={15} />}
          disabled={readOnly || solving || !canSolve}
          title={biTitle(
            hasSolution ? 'Re-solve the network' : 'Solve the network',
            hasSolution ? T07.action.reSolve : T07.action.solve,
          )}
          onClick={onSolve}
        >
          {solving ? 'Solving… / 求解中' : hasSolution ? 'Re-Solve / 重新求解' : 'Solve Network / 執行求解'}
        </Button>

        <Button
          icon={<ShieldCheck size={15} />}
          disabled={solving}
          title={biTitle('Run the pre-solve checks only', T07.action.preSolveCheck)}
          onClick={onPreSolveCheck}
        >
          Pre-Solve Check / 求解前檢查
        </Button>

        <Button
          variant="danger"
          icon={<RotateCcw size={15} />}
          disabled={readOnly || !hasSolution}
          title={biTitle('Clear this scenario analytical solution', T07.action.resetResults)}
          onClick={onReset}
        >
          Reset Results / 清除結果
        </Button>
      </div>

      {!canSolve && (
        <p className="flex items-start gap-1 text-[11px] font-medium text-danger-600">
          <span aria-hidden>⚠</span>
          <span>
            Pre-solve checks are blocking the solve. See Solver Messages below.
            <span className="block font-normal text-ink-400">
              求解前檢查未通過，請見下方求解訊息。
            </span>
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Badge tone={state === 'FAILED' ? 'danger' : state === 'SOLVED' ? 'ok' : 'warn'}>
          {state}
        </Badge>
        <span className="text-[11px] text-ink-400">
          Power scale × {num(powerScale, 2)} applied to component power only
        </span>
      </div>
    </div>
  );
}
