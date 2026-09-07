/**
 * Analysis Controls, Filters / Scope and Sensitivity Setup — 08 §10, §11, §2.
 * Laid out after the PNG's left column, top to bottom.
 *
 * The Rth reduction is a stepper (−/+ around the value) exactly as the mockup
 * draws it, clamped to the specification's 5–50 % in steps of 5.
 *
 * Three controls that were here are not any more, each measured on STARKCORE
 * before it went (see `analysisTypes.ts` for the scope and metric lists):
 *
 *   - Active Scenario was a `<select>` that was always disabled and always held
 *     exactly one item, naming the scenario the header badge already names.
 *   - Run Analysis and Re-run Analysis called the SAME handler; the second was
 *     only the first with an extra disabled condition. One button now, with the
 *     label saying which run it is.
 *   - Shared vs Local and Boundary vs Internal restated Candidate Scope: on
 *     STARKCORE `shared` selected the same 3 edges as the Shared Structure
 *     scope and `boundary` the same 2 as Boundary Path.
 */

import { Minus, Play, Plus, RotateCcw, Square } from 'lucide-react';

import { Button, Select } from '@/ui/primitives';
import { FieldLabel, biTitle } from '@/ui/FieldLabel';
import { dataSourceLabelZh } from '@/ui/dataSourceLabels';
import {
  CANDIDATE_SCOPES,
  CANDIDATE_SCOPE_LABELS,
  REDUCTION_LIMITS,
  TARGET_METRICS,
  TARGET_METRIC_LABELS,
  type AnalysisSettings,
  type AnalysisState,
  type CandidateFilters,
} from '@/thermal/analysis/analysisTypes';

import { T08 } from './tooltips';

const CONFIDENCES = ['All', 'high', 'medium', 'low'];

function withAll(values: string[]): Array<{ value: string; label: string }> {
  return [{ value: 'All', label: 'All' }, ...values.map((value) => ({ value, label: value }))];
}

export function AnalysisControlPanel({
  settings,
  state,
  running,
  progress,
  readOnly,
  canRun,
  hasAnalysis,
  onSettings,
  onRun,
  onCancel,
  onReset,
}: {
  settings: AnalysisSettings;
  state: AnalysisState;
  running: boolean;
  progress: { done: number; total: number };
  readOnly: boolean;
  canRun: boolean;
  hasAnalysis: boolean;
  onSettings: (patch: Partial<AnalysisSettings>) => void;
  onRun: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const step = (delta: number) => {
    const next = Math.min(
      REDUCTION_LIMITS.max,
      Math.max(REDUCTION_LIMITS.min, settings.reduction_pct + delta),
    );
    onSettings({ reduction_pct: next });
  };

  return (
    <div className="grid gap-2.5">
      <div>
        <FieldLabel
          label="Candidate Scope"
          zh="候選範圍"
          inline={false}
          htmlFor="ba-scope"
          tooltip={T08.field.scope}
        />
        <Select
          id="ba-scope"
          className="mt-1 h-8 !text-[12px]"
          value={settings.scope}
          disabled={readOnly || running}
          items={CANDIDATE_SCOPES.map((scope) => ({
            value: scope,
            label: CANDIDATE_SCOPE_LABELS[scope].label,
          }))}
          onChange={(event) =>
            onSettings({ scope: event.target.value as AnalysisSettings['scope'] })
          }
        />
      </div>

      <div>
        <FieldLabel
          label="Rth Reduction"
          zh="熱阻降低比例"
          inline={false}
          unit="%"
          tooltip={T08.reduction}
        />
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            title={biTitle('Decrease by 5 %', '減少 5%')}
            aria-label={biTitle('Decrease by 5 %', '減少 5%')}
            disabled={readOnly || running || settings.reduction_pct <= REDUCTION_LIMITS.min}
            onClick={() => step(-REDUCTION_LIMITS.step)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-500 hover:bg-surface-muted disabled:opacity-40"
          >
            <Minus size={13} />
          </button>
          <span className="flex h-8 flex-1 items-center justify-center rounded-md border border-line-strong bg-surface text-[13px] font-bold text-ink-900 tabular">
            {settings.reduction_pct}%
          </span>
          <button
            type="button"
            title={biTitle('Increase by 5 %', '增加 5%')}
            aria-label={biTitle('Increase by 5 %', '增加 5%')}
            disabled={readOnly || running || settings.reduction_pct >= REDUCTION_LIMITS.max}
            onClick={() => step(REDUCTION_LIMITS.step)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-500 hover:bg-surface-muted disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-ink-400">
          {REDUCTION_LIMITS.min}–{REDUCTION_LIMITS.max}% in steps of {REDUCTION_LIMITS.step}
        </p>
      </div>

      <div>
        <FieldLabel
          label="Target Metric"
          zh="目標指標"
          inline={false}
          htmlFor="ba-target"
          tooltip={T08.field.targetMetric}
        />
        <Select
          id="ba-target"
          className="mt-1 h-8 !text-[12px]"
          value={settings.target_metric}
          disabled={readOnly || running}
          items={TARGET_METRICS.map((metric) => ({
            value: metric,
            label: TARGET_METRIC_LABELS[metric].label,
          }))}
          onChange={(event) =>
            onSettings({ target_metric: event.target.value as AnalysisSettings['target_metric'] })
          }
        />
      </div>

      {running ? (
        <div className="grid gap-1.5">
          <div className="rounded-md border border-accent-500/40 bg-accent-100 px-2.5 py-2">
            <p className="text-[12px] font-bold text-accent-700 tabular">
              Analyzing {progress.done} / {progress.total}
              <span className="ml-1 font-normal text-ink-500">/ 分析中</span>
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full bg-accent-600 transition-[width]"
                style={{
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <Button
            variant="danger"
            icon={<Square size={14} />}
            title={biTitle('Cancel analysis', T08.action.cancel)}
            onClick={onCancel}
          >
            Cancel Analysis / 中止分析
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          icon={<Play size={14} />}
          disabled={readOnly || !canRun}
          title={biTitle(
            hasAnalysis ? 'Re-run analysis' : 'Run analysis',
            hasAnalysis ? T08.action.rerun : T08.action.run,
          )}
          onClick={onRun}
        >
          {hasAnalysis ? 'Re-run Analysis' : 'Run Analysis'}
        </Button>
      )}

      <Button
        variant="danger"
        icon={<RotateCcw size={14} />}
        className="h-8 !text-[12px]"
        disabled={readOnly || running || !hasAnalysis}
        title={biTitle('Reset analysis', T08.action.reset)}
        onClick={onReset}
      >
        Reset Analysis / 清除分析
      </Button>

      {!canRun && state === 'NOT_READY' && (
        <p className="flex items-start gap-1 text-[11px] font-medium text-danger-600">
          <span aria-hidden>⚠</span>
          <span>
            A valid Screen 07 solution is required before any sensitivity run.
            <span className="block font-normal text-ink-400">
              需要 07 有效且未失效的解才能進行敏感度分析。
            </span>
          </span>
        </p>
      )}
    </div>
  );
}

// --- Filters / Scope (08 §11, PNG left column second card) ------------------

export function FilterPanel({
  filters,
  options,
  disabled,
  onChange,
}: {
  filters: CandidateFilters;
  options: { edgeTypes: string[]; components: string[]; zones: string[]; sources: string[] };
  disabled: boolean;
  onChange: (patch: Partial<CandidateFilters>) => void;
}) {
  const cell = (
    label: string,
    zh: string,
    id: string,
    value: string,
    items: Array<{ value: string; label: string }>,
    onSelect: (value: string) => void,
  ) => (
    <div>
      <FieldLabel label={label} zh={zh} inline={false} htmlFor={id} />
      <Select
        id={id}
        className="mt-1 h-8 !text-[11px]"
        value={value}
        disabled={disabled}
        items={items}
        onChange={(event) => onSelect(event.target.value)}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {cell('Edge Type', '連線類型', 'ba-f-type', filters.edge_type, withAll(options.edgeTypes), (value) =>
        onChange({ edge_type: value }),
      )}
      {cell('Component', '元件', 'ba-f-comp', filters.component, withAll(options.components), (value) =>
        onChange({ component: value }),
      )}
      {/* Zone and Rth Source are shown only when this project HAS more than one
          of them. On STARKCORE every node is unzoned and every resistance is
          Analytical, so both selects held a single option and could not narrow
          anything — a control that cannot act is worse than no control. */}
      {options.zones.length > 0 &&
        cell('Zone', '區域', 'ba-f-zone', filters.zone, withAll(options.zones), (value) =>
          onChange({ zone: value }),
        )}
      {options.sources.length > 1 &&
        cell('Rth Source', '熱阻來源', 'ba-f-src', filters.rth_source, [
          { value: 'All', label: '全部' },
          ...options.sources.map((value) => ({ value, label: dataSourceLabelZh(value) })),
        ], (value) =>
          onChange({ rth_source: value }),
        )}
      {cell(
        'Confidence',
        '信心度',
        'ba-f-conf',
        filters.confidence,
        CONFIDENCES.map((value) => ({ value, label: value })),
        (value) => onChange({ confidence: value }),
      )}
    </div>
  );
}

// --- Sensitivity Setup (08 §2, PNG left column third card) ------------------

export function SensitivitySetup({ reductionPct }: { reductionPct: number }) {
  return (
    <div className="grid gap-2">
      <p
        className="rounded-md border border-accent-500/30 bg-accent-100 px-2.5 py-2 text-[11px] leading-relaxed text-accent-700"
        title={T08.sensitivity}
      >
        Sensitivity method: reduce candidate Rth by {reductionPct}% and solve the
        full thermal network again.
        <span className="block text-ink-500">
          敏感度方法：將候選連線熱阻降低 {reductionPct}%，並重新求解完整熱網路。
        </span>
      </p>
      <p className="text-[11px] leading-relaxed text-ink-500" title={T08.field.fullResolve}>
        Full-network re-solve is used. Baseline Q is not reused.
        <span className="block text-ink-400">使用完整網路重新求解，不重用 baseline 的 Q。</span>
      </p>
      <p className="text-[11px] leading-relaxed text-ink-400">
        Nothing here changes the official network. The analysis solves on a copy.
        <span className="block">本分析在副本上求解，不會修改正式網路。</span>
      </p>
    </div>
  );
}
