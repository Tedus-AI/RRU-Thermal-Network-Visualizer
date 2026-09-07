/**
 * The three segments worth arguing about, and what cutting them buys.
 *
 * Everything on this panel is a full network re-solve, live: move a control and
 * the number beside it, the projection in the header and the graph behind it
 * all come from a solve of the whole graph with that resistance reduced. At
 * this size a solve is well under a millisecond, so there is no reason to make
 * the reader press a button to find out.
 *
 * Two numbers per segment, because they answer different questions:
 *   "alone"  — what this segment is worth on its own, which is how you decide
 *              where to spend the effort;
 *   the header's total — what the current combination is worth, which is what
 *              you would actually be proposing.
 *
 * The step is 0.1 %. A 20 % stepper is a survey; 0.1 % is the resolution at
 * which "how much do I need out of this TIM" becomes a question with an answer.
 */

import { RotateCcw, Save } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import type { ChainSegment } from '@/thermal/analysis/whatIf';
import type { MarginRank } from '@/thermal/analysis/marginRanking';

import { num, rth, signed } from './analysisViewModel';

export const REDUCTION_STEP = 0.1;
export const REDUCTION_MAX = 90;

export function SegmentTuner({
  target,
  segments,
  reductions,
  soloGains,
  projected,
  readOnly,
  dirty,
  onReduction,
  onReset,
  onSave,
}: {
  target: MarginRank;
  segments: readonly ChainSegment[];
  reductions: Readonly<Record<string, number>>;
  /** Per segment: what that one alone buys the target part, °C. */
  soloGains: Readonly<Record<string, number>>;
  projected: { temperature_C: number; margin_C: number } | null;
  readOnly: boolean;
  dirty: boolean;
  onReduction: (edgeId: string, pct: number) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const gain = projected ? projected.margin_C - target.margin_C : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="shrink-0 rounded-md border border-line bg-surface-muted px-2.5 py-2">
        <p className="truncate text-[11px] font-semibold text-ink-700" title={target.name}>
          {target.name}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-x-3">
          <Reading
            label="Temperature"
            zh="溫度"
            before={num(target.temperature_C, 1, '°C')}
            after={projected ? num(projected.temperature_C, 1, '°C') : null}
            good={projected ? projected.temperature_C < target.temperature_C : false}
          />
          <Reading
            label={`Margin vs ${target.limit_C} °C`}
            zh={target.limit_type ? `餘裕（${target.limit_type}）` : '餘裕'}
            before={num(target.margin_C, 1, '°C')}
            after={projected ? num(projected.margin_C, 1, '°C') : null}
            good={gain > 0}
          />
        </div>
        {gain !== 0 && (
          <p
            className={`mt-1 text-[11px] font-bold ${gain > 0 ? 'text-ok-600' : 'text-danger-600'}`}
          >
            {signed(gain, 1, '°C')} margin
            <span className="ml-1 font-semibold text-ink-500">
              / 餘裕{gain > 0 ? '增加' : '減少'}
            </span>
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {segments.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-ink-400">
            This part has no adjustable segment on its path.
            <span className="block">此元件的熱路徑上沒有可調整的區段。</span>
          </p>
        ) : (
          <ul className="grid gap-2">
            {segments.map((segment, index) => (
              <SegmentRow
                key={segment.edge_id}
                rank={index + 1}
                segment={segment}
                reduction={reductions[segment.edge_id] ?? 0}
                soloGain={soloGains[segment.edge_id] ?? 0}
                readOnly={readOnly}
                onReduction={(pct) => onReduction(segment.edge_id, pct)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="primary"
          icon={<Save size={14} />}
          className="h-8 !text-[12px]"
          disabled={readOnly || !dirty}
          title={biTitle('Save this what-if as a study', '將此次調整存成分析紀錄')}
          onClick={onSave}
        >
          Save Study / 儲存
        </Button>
        <Button
          icon={<RotateCcw size={14} />}
          className="h-8 !text-[12px]"
          disabled={!dirty}
          title={biTitle('Back to the solved values', '回到求解結果')}
          onClick={onReset}
        >
          Reset / 歸零
        </Button>
      </div>
    </div>
  );
}

function Reading({
  label,
  zh,
  before,
  after,
  good,
}: {
  label: string;
  zh: string;
  before: string;
  after: string | null;
  good: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-[10px] text-ink-400">
        {label} <span className="text-ink-400">/ {zh}</span>
      </span>
      <span className="flex items-baseline gap-1 text-[13px] font-bold tabular">
        <span className={after ? 'text-ink-400 line-through' : 'text-ink-900'}>{before}</span>
        {after && (
          <>
            <span aria-hidden className="text-ink-400">
              →
            </span>
            <span className={good ? 'text-ok-600' : 'text-ink-900'}>{after}</span>
          </>
        )}
      </span>
    </div>
  );
}

function SegmentRow({
  rank,
  segment,
  reduction,
  soloGain,
  readOnly,
  onReduction,
}: {
  rank: number;
  segment: ChainSegment;
  reduction: number;
  soloGain: number;
  readOnly: boolean;
  onReduction: (pct: number) => void;
}) {
  const after = segment.rth_C_per_W * (1 - reduction / 100);

  return (
    <li className="rounded-md border border-line bg-surface px-2 py-1.5">
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-ink-700 text-[10px] font-bold text-white tabular">
          {rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-900" title={segment.label}>
          {segment.label}
        </span>
        {segment.shared && (
          <span
            title={biTitle(
              'Carries more than this component',
              '此區段承載的不只這顆元件的熱',
            )}
            className="shrink-0 rounded bg-accent-100 px-1 py-0.5 text-[9px] leading-none font-bold text-accent-700"
          >
            shared
          </span>
        )}
      </span>

      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[10px] text-ink-400">
        <span>{segment.edge_type}</span>
        <span className="tabular">ΔT {num(segment.delta_T_C, 1, '°C')}</span>
        <span className="tabular">Q {num(segment.heat_flow_W, 1, 'W')}</span>
        <span className="tabular">
          {rth(segment.rth_C_per_W)}
          {reduction > 0 && (
            <>
              <span aria-hidden> → </span>
              <span className="font-bold text-ink-700">{rth(after)}</span>
            </>
          )}
          {' °C/W'}
        </span>
      </span>

      <span className="mt-1 flex items-center gap-1.5">
        <input
          type="range"
          min={0}
          max={REDUCTION_MAX}
          step={REDUCTION_STEP}
          value={reduction}
          disabled={readOnly}
          aria-label={`Reduce ${segment.label} by percent`}
          onChange={(event) => onReduction(Number(event.target.value))}
          className="h-1.5 min-w-0 flex-1 accent-orange-600"
        />
        <input
          type="number"
          min={0}
          max={REDUCTION_MAX}
          step={REDUCTION_STEP}
          value={reduction}
          disabled={readOnly}
          aria-label={`Reduce ${segment.label} by percent, typed`}
          onChange={(event) => onReduction(Number(event.target.value))}
          className="h-6 w-14 shrink-0 rounded border border-line-strong bg-surface px-1 text-right text-[11px] font-bold tabular text-ink-900"
        />
        <span className="shrink-0 text-[10px] text-ink-400">%</span>
      </span>

      <span className="mt-0.5 block text-[10px] text-ink-400">
        Alone: <span className="font-bold tabular text-ink-700">{signed(soloGain, 2, '°C')}</span>
        <span className="ml-1">/ 單獨調整此段的效果</span>
      </span>
    </li>
  );
}
