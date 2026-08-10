/** Top KPI / readiness cards — 04 §6. */

import { AlertTriangle, Boxes, CircleCheck, Flame, PowerOff, XCircle, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { BilingualTooltip } from '@/ui/FieldLabel';
import { tip } from '@/i18n/componentManagerCopy';
import type { ReadinessSummary } from '@/domain/componentReadiness';

function Card({
  icon,
  label,
  zh,
  value,
  tone = 'text-ink-900',
  tooltip,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  tone?: string;
  tooltip?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {tooltip ? (
          <BilingualTooltip zh={tooltip} align="left">
            {label}
          </BilingualTooltip>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div className={`tabular mt-1 text-[22px] leading-none font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-ink-400">{zh}</div>
    </>
  );

  const className = `rounded-lg border bg-surface px-3.5 py-3 text-left transition-colors ${
    active ? 'border-accent-600 ring-1 ring-accent-600/30' : 'border-line'
  } ${onClick ? 'hover:border-ink-400' : ''}`;

  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function ComponentReadinessCards({
  summary,
  statusFilter,
  onStatusFilter,
}: {
  summary: ReadinessSummary;
  statusFilter: string;
  onStatusFilter: (status: 'ALL' | 'READY' | 'WARNING' | 'ERROR' | 'DISABLED') => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Card
        icon={<Boxes size={13} />}
        label="Components"
        zh="元件總數"
        value={String(summary.components)}
      />
      <Card
        icon={<Flame size={13} />}
        label="Heat Sources"
        zh="熱源數"
        value={String(summary.heat_sources)}
      />
      <Card
        icon={<Zap size={13} />}
        label="Total Power"
        zh="總功耗"
        value={`${summary.total_power_W.toFixed(1)} W`}
        tooltip={tip('Total Power')}
      />
      <Card
        icon={<CircleCheck size={13} />}
        label="Ready"
        zh="可進入建模"
        value={String(summary.ready)}
        tone="text-ok-600"
        active={statusFilter === 'READY'}
        onClick={() => onStatusFilter(statusFilter === 'READY' ? 'ALL' : 'READY')}
      />
      <Card
        icon={<AlertTriangle size={13} />}
        label="Warnings"
        zh="警告"
        value={String(summary.warnings)}
        tone={summary.warnings > 0 ? 'text-warn-600' : 'text-ink-900'}
        active={statusFilter === 'WARNING'}
        onClick={() => onStatusFilter(statusFilter === 'WARNING' ? 'ALL' : 'WARNING')}
      />
      <Card
        icon={summary.errors > 0 ? <XCircle size={13} /> : <PowerOff size={13} />}
        label="Errors"
        zh="錯誤"
        value={String(summary.errors)}
        tone={summary.errors > 0 ? 'text-danger-600' : 'text-ink-900'}
        active={statusFilter === 'ERROR'}
        onClick={() => onStatusFilter(statusFilter === 'ERROR' ? 'ALL' : 'ERROR')}
      />
    </div>
  );
}
