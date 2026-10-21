/**
 * The status line at the top of Screen 04 (04 §6).
 *
 * It used to be six cards — components, heat sources, total power, ready,
 * warnings, errors — beside five category cards, which wrapped to two rows on
 * a laptop and said the same thing as the status dropdown, the completeness
 * dropdown and the Validate All button. It is one line now: the counts as text,
 * and the three statuses as chips that ARE the status filter.
 *
 * "6 種・12 顆" says both counts the old cards mixed up: records (what the
 * table lists and the category tabs count) and units (Σ qty).
 */

import { AlertTriangle, CircleCheck, CircleSlash, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ReadinessSummary } from '@/domain/componentReadiness';
import type { StatusFilter } from './ComponentToolbar';

const CHIP_TONE = {
  READY: 'text-ok-600',
  WARNING: 'text-warn-600',
  ERROR: 'text-danger-600',
  DISABLED: 'text-ink-500',
} as const;

function Chip({
  icon,
  label,
  count,
  status,
  active,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  status: Exclude<StatusFilter, 'ALL'>;
  active: boolean;
  onToggle: (status: Exclude<StatusFilter, 'ALL'>) => void;
}) {
  const tone = count > 0 ? CHIP_TONE[status] : 'text-ink-400';
  return (
    <button
      type="button"
      aria-pressed={active}
      title={active ? '取消篩選' : `只看${label}`}
      onClick={() => onToggle(status)}
      className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${
        active ? 'border-accent-600 bg-accent-50 ring-1 ring-accent-600/30' : 'border-line bg-surface hover:border-ink-400'
      } ${tone}`}
    >
      {icon}
      {label}
      <span className="tabular">{count}</span>
    </button>
  );
}

export function ComponentReadinessCards({
  summary,
  recordCount,
  statusFilter,
  onStatusFilter,
}: {
  summary: ReadinessSummary;
  /** Component records, as against `summary.components`, which is units. */
  recordCount: number;
  statusFilter: StatusFilter;
  onStatusFilter: (status: StatusFilter) => void;
}) {
  const toggle = (status: Exclude<StatusFilter, 'ALL'>) =>
    onStatusFilter(statusFilter === status ? 'ALL' : status);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="tabular text-[13px] text-ink-700">
        <span className="font-semibold text-ink-900">{recordCount}</span> 種・
        <span className="font-semibold text-ink-900">{summary.components}</span> 顆・熱源{' '}
        <span className="font-semibold text-ink-900">{summary.heat_sources}</span>・
        <span
          className="font-semibold text-ink-900"
          title="數量 × 單顆功耗的加總（停用的不計）；不是熱路徑上的熱流 Q。"
        >
          {summary.total_power_W.toFixed(1)} W
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          icon={<CircleCheck size={13} aria-hidden />}
          label="就緒"
          count={summary.ready}
          status="READY"
          active={statusFilter === 'READY'}
          onToggle={toggle}
        />
        <Chip
          icon={<AlertTriangle size={13} aria-hidden />}
          label="警告"
          count={summary.warnings}
          status="WARNING"
          active={statusFilter === 'WARNING'}
          onToggle={toggle}
        />
        <Chip
          icon={<XCircle size={13} aria-hidden />}
          label="錯誤"
          count={summary.errors}
          status="ERROR"
          active={statusFilter === 'ERROR'}
          onToggle={toggle}
        />
        {summary.disabled > 0 && (
          <Chip
            icon={<CircleSlash size={13} aria-hidden />}
            label="停用"
            count={summary.disabled}
            status="DISABLED"
            active={statusFilter === 'DISABLED'}
            onToggle={toggle}
          />
        )}
      </div>
    </div>
  );
}
