/**
 * The bar across the top of 07 求解與結果: one button to solve, and the four
 * numbers that say what the solve found (07 §59).
 *
 * It replaces three things that each said part of this: the KPI row (heat in,
 * heat out, residual, max ambient), the Solver Settings panel down the left,
 * and the verdict cards of the old 09. What is read on every solve is on the
 * bar — which part is tightest, how much hotter the air can get, how much heat
 * there is and whether the books balance. What is read once in a while — the
 * engine, the matrix, the pivot tolerance, the energy-balance thresholds, the
 * pre-solve check and Reset — is under 求解細節, closed by default.
 *
 * Still the direct solver's own facts and nothing else: no iteration count,
 * no convergence history (07 §57 — the engine factors the matrix once).
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, Play, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

import { Button, NumberInput } from '@/ui/primitives';
import type { SolverSettings } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import { SOLVER_VERSION } from '@/thermal/solver/solverTypes';
import type { AmbientHeadroom } from '@/thermal/analysis/ambientHeadroom';
import type { PowerSlice } from '@/thermal/overview/powerByCategory';

import { num, percent, signed, timeOf, type ResultTreeGroupRow } from './resultViewModel';
import { T07 } from './tooltips';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  neutral: 'text-ink-900',
};

function Tile({
  label,
  value,
  note,
  tone = 'neutral',
  title,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <div className="min-w-0 border-l-2 border-line pl-3" title={title}>
      <span className="block text-[11px] font-medium text-ink-500">{label}</span>
      <span className={`block text-[17px] leading-snug font-bold tabular ${TONE_TEXT[tone]}`}>
        {value}
      </span>
      {note != null && (
        <span className="block truncate text-[11px] text-ink-400">{note}</span>
      )}
    </div>
  );
}

function marginTone(margin_C: number): Tone {
  if (margin_C < 0) return 'danger';
  return margin_C <= 5 ? 'warn' : 'ok';
}

function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="whitespace-nowrap" title={title}>
      <span className="text-ink-400">{label}</span>{' '}
      <span className="font-semibold tabular text-ink-800">{value}</span>
    </span>
  );
}

export function SolveBar({
  solution,
  stale,
  tightest,
  headroom,
  power,
  settings,
  powerScale,
  readOnly,
  canSolve,
  blocking,
  solving,
  onSolve,
  onPreSolveCheck,
  onReset,
  onSettings,
}: {
  solution: ThermalSolution | null;
  stale: boolean;
  /** The first row of the component list: the part with the least margin. */
  tightest: ResultTreeGroupRow | null;
  headroom: AmbientHeadroom | null;
  /** The heat split by category, for the total's tooltip. */
  power: PowerSlice[];
  settings: SolverSettings;
  powerScale: number;
  readOnly: boolean;
  canSolve: boolean;
  /** Pre-solve errors, which are what keep the button disabled. */
  blocking: number;
  solving: boolean;
  onSolve: () => void;
  onPreSolveCheck: () => void;
  onReset: () => void;
  onSettings: (patch: Partial<SolverSettings>) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // A stale or failed solve is not the current answer (07 §38), so nothing on
  // the bar quotes it.
  const current = solution && !stale && solution.status !== 'FAILED' ? solution : null;
  const balance = current?.energy_balance ?? null;
  const waiting = stale ? '結果已失效' : solution?.status === 'FAILED' ? '求解失敗' : '求解後顯示';

  const tightestReady = current && tightest?.margin_C != null;
  const headroomReady = current && headroom != null;

  const split =
    power.length > 0
      ? power.map((slice) => `${slice.zh} ${slice.watts.toFixed(1)} W（${slice.share_pct.toFixed(0)} %）`).join('、')
      : '';

  return (
    <div className="rounded-lg border border-line bg-surface" data-testid="solve-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-2.5">
        <Button
          variant="primary"
          icon={solution ? <RefreshCw size={15} /> : <Play size={15} />}
          disabled={readOnly || solving || !canSolve}
          title={
            readOnly
              ? '唯讀模式不能求解'
              : !canSolve
                ? `求解前檢查有 ${blocking} 項錯誤，修正後才能求解`
                : solution
                  ? T07.action.reSolve
                  : T07.action.solve
          }
          onClick={onSolve}
          className="shrink-0"
        >
          {solving ? '求解中…' : solution ? '重新求解' : '求解'}
        </Button>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2 xl:grid-cols-4">
          <Tile
            label="最緊的元件"
            value={tightestReady ? `${signed(tightest!.margin_C, 1)} °C` : '—'}
            tone={tightestReady ? marginTone(tightest!.margin_C!) : 'neutral'}
            note={
              tightestReady
                ? `${[tightest!.limit_type, `${num(tightest!.judged_C, 1)} / ${num(tightest!.limit_C, 0)}`].filter(Boolean).join(' ')} · ${tightest!.name}`
                : current
                  ? '沒有元件設定限溫'
                  : waiting
            }
            title={
              tightestReady
                ? `餘裕最小的元件：${tightest!.name}。限溫 ${num(tightest!.limit_C, 0)} °C（${tightest!.limit_type ?? '—'}），限溫位置 ${num(tightest!.judged_C, 1)} °C。`
                : '餘裕＝限溫 − 限溫位置的溫度，最小的那一顆。'
            }
          />
          <Tile
            label="環溫還能升"
            value={headroomReady ? `${signed(headroom!.headroom_C, 1)} °C` : '—'}
            tone={headroomReady ? marginTone(headroom!.headroom_C) : 'neutral'}
            note={
              headroomReady
                ? `到 ${headroom!.max_ambient_C.toFixed(1)} °C${headroom!.assumes_uniform_rise ? '' : '（有固定溫度節點，僅供參考）'}`
                : current
                  ? '沒有元件設定限溫'
                  : waiting
            }
            title={T07.kpi.maxAmbient}
          />
          <Tile
            label="總發熱"
            value={balance ? num(balance.generated_W, 1, 'W') : '—'}
            note={
              balance
                ? balance.solar_W > 0
                  ? `元件 ${balance.component_W.toFixed(1)} · 日照 ${balance.solar_W.toFixed(1)}`
                  : `元件發熱${powerScale !== 1 ? `（× ${powerScale.toFixed(2)}）` : ''}`
                : waiting
            }
            title={`${T07.kpi.generatedHeat}${split ? `\n${split}` : ''}`}
          />
          <Tile
            label="能量平衡"
            value={balance ? percent(balance.error_pct) : '—'}
            tone={
              balance == null
                ? 'neutral'
                : balance.grade === 'green'
                  ? 'ok'
                  : balance.grade === 'warning'
                    ? 'warn'
                    : 'danger'
            }
            note={
              balance
                ? `排出 ${balance.rejected_W.toFixed(1)} W · ${
                    balance.grade === 'green' ? '良好' : balance.grade === 'warning' ? '偏大' : '過大'
                  }`
                : waiting
            }
            title={`${T07.kpi.energyResidual}\n< ${settings.energy_warn_pct} % 良好 · ${settings.energy_warn_pct}–${settings.energy_error_pct} % 偏大 · > ${settings.energy_error_pct} % 過大（門檻在「求解細節」）`}
          />
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
          aria-controls="solve-details"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-accent-700 hover:bg-accent-50"
        >
          求解細節
          <ChevronDown size={13} className={detailsOpen ? 'rotate-180' : ''} aria-hidden />
        </button>
      </div>

      {detailsOpen && (
        <div
          id="solve-details"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-3 py-2.5 text-[12px]"
        >
          <Fact
            label="求解引擎"
            value={`直接法 ${SOLVER_VERSION}（高斯消去）`}
            title={T07.field.solverEngine}
          />
          <Fact
            label="矩陣"
            value={current ? `${current.metadata.matrix_size} × ${current.metadata.matrix_size}` : '—'}
          />
          <Fact
            label="主元容許值"
            value="1e-14"
            title="小於此值的主元視為奇異矩陣，求解會中止並回報原因。"
          />
          <Fact label="功率倍率" value={`${powerScale.toFixed(2)} ×`} title={T07.field.powerScale} />
          <Fact label="上次求解" value={timeOf(solution?.solved_at)} />
          {solution && (
            <Fact label="求解時間" value={`${solution.metadata.solve_time_ms.toFixed(1)} ms`} />
          )}

          <span className="flex items-center gap-1.5" title={T07.field.energyWarnPct}>
            <label htmlFor="solver-warn-pct" className="text-ink-400">
              能量平衡警告門檻
            </label>
            <NumberInput
              id="solver-warn-pct"
              className="!h-7 !w-16 !px-2 !text-[12px]"
              step={0.1}
              min={0}
              value={settings.energy_warn_pct}
              disabled={readOnly}
              onChange={(event) => onSettings({ energy_warn_pct: Number(event.target.value) || 0 })}
            />
            <span className="text-ink-400">%</span>
          </span>
          <span className="flex items-center gap-1.5" title={T07.field.energyErrorPct}>
            <label htmlFor="solver-error-pct" className="text-ink-400">
              錯誤門檻
            </label>
            <NumberInput
              id="solver-error-pct"
              className="!h-7 !w-16 !px-2 !text-[12px]"
              step={0.1}
              min={0}
              value={settings.energy_error_pct}
              disabled={readOnly}
              onChange={(event) => onSettings({ energy_error_pct: Number(event.target.value) || 0 })}
            />
            <span className="text-ink-400">%</span>
          </span>

          <span className="ml-auto flex items-center gap-2">
            <Button
              icon={<ShieldCheck size={14} />}
              className="!h-7 !text-[12px]"
              disabled={solving}
              title={T07.action.preSolveCheck}
              onClick={onPreSolveCheck}
            >
              求解前檢查
            </Button>
            <Button
              variant="danger"
              icon={<RotateCcw size={14} />}
              className="!h-7 !text-[12px]"
              disabled={readOnly || !solution}
              title={T07.action.resetResults}
              onClick={onReset}
            >
              清除結果
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
