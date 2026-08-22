/**
 * Right panel — Import Summary, Validation, Project Impact (02 §20, §21, §22).
 */

import { useMemo } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, CircleAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import { PanelCard } from '@/ui/primitives';
import { BilingualTooltip } from '@/ui/FieldLabel';
import { useComponentImportStore } from '@/data/componentImportStore';
import { useComponentStore } from '@/data/componentStore';
import { projectImpact, summarizeImport } from '@/importers/component/summarize';
import { REQUIRED_FIELDS } from '@/importers/component/types';
import { tip } from '@/i18n/componentImportCopy';
import type { StagingRow } from '@/importers/component/types';

function Row({
  label,
  zh,
  value,
  tone = 'text-ink-900',
  onClick,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <dt className="text-[12px] text-ink-500">
        {label}
        <span className="ml-1 text-ink-400">/ {zh}</span>
      </dt>
      <dd className={`tabular text-[13px] font-semibold ${tone}`}>{value}</dd>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-baseline justify-between gap-3 rounded px-1.5 py-[5px] text-left hover:bg-surface-muted"
      >
        {content}
      </button>
    );
  }
  return <div className="flex items-baseline justify-between gap-3 py-[5px]">{content}</div>;
}

/**
 * The import counts as one horizontal row above the table, rather than a card
 * docked down the right-hand side.
 *
 * Same reasoning as Screen 04's status band: the preview table is the widest
 * thing on this screen and every column of it is data an engineer reads across,
 * so a 24rem rail was taken out of the one place that needed the width. These
 * are six numbers; they fit on a line.
 */
export function ImportStatusBand() {
  const rows = useComponentImportStore((s) => s.rows);
  const statusFilter = useComponentImportStore((s) => s.statusFilter);
  const setStatusFilter = useComponentImportStore((s) => s.setStatusFilter);
  const summary = useMemo(() => summarizeImport(rows), [rows]);

  const counts: Array<{
    status: StagingRow['status'] | null;
    label: string;
    zh: string;
    value: number;
    tone: string;
  }> = [
    { status: null, label: 'Detected', zh: '偵測', value: summary.detected_rows, tone: 'text-ink-900' },
    { status: 'VALID', label: 'Valid', zh: '有效', value: summary.valid_rows, tone: 'text-ok-600' },
    {
      status: 'WARNING',
      label: 'Warnings',
      zh: '警告',
      value: summary.warning_rows,
      tone: summary.warning_rows > 0 ? 'text-warn-600' : 'text-ink-400',
    },
    {
      status: 'ERROR',
      label: 'Errors',
      zh: '錯誤',
      value: summary.error_rows,
      tone: summary.error_rows > 0 ? 'text-danger-600' : 'text-ink-400',
    },
    {
      status: 'DUPLICATE',
      label: 'Duplicates',
      zh: '重複',
      value: summary.duplicate_rows,
      tone: summary.duplicate_rows > 0 ? 'text-accent-700' : 'text-ink-400',
    },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {counts.map((entry) => {
        const active = entry.status != null && statusFilter === entry.status;
        const body = (
          <>
            <span className={`tabular text-[17px] leading-none font-bold ${entry.tone}`}>
              {entry.value}
            </span>
            <span className="mt-1 block text-[11px] leading-tight text-ink-500">
              {entry.label}
              <span className="block text-[10px] text-ink-400">{entry.zh}</span>
            </span>
          </>
        );

        // "Detected" is a total, not a subset, so it filters nothing.
        if (entry.status == null) {
          return (
            <div
              key={entry.label}
              className="min-w-[5.5rem] rounded-lg border border-line bg-surface px-3 py-2"
            >
              {body}
            </div>
          );
        }
        return (
          <button
            key={entry.label}
            type="button"
            aria-pressed={active}
            onClick={() => setStatusFilter(active ? 'ALL' : entry.status!)}
            className={`min-w-[5.5rem] rounded-lg border px-3 py-2 text-left transition-colors ${
              active
                ? 'border-accent-600 bg-accent-50/70'
                : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            {body}
          </button>
        );
      })}

      {/* 02 §19 / §34 — a component dissipation summary, never edge heat flow. */}
      <div className="ml-auto flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2">
        <div>
          <span className="tabular text-[17px] leading-none font-bold text-ink-900">
            {summary.total_power_W.toFixed(1)} W
          </span>
          <span className="mt-1 block text-[11px] leading-tight text-ink-500">
            <BilingualTooltip zh={tip('Total Power') ?? ''} align="left">
              Total Power
            </BilingualTooltip>
            <span className="block text-[10px] text-ink-400">總功耗（非邊熱流 Q）</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function ImportSummaryPanel() {
  const rows = useComponentImportStore((s) => s.rows);
  const summary = useMemo(() => summarizeImport(rows), [rows]);
  const setStatusFilter = useComponentImportStore((s) => s.setStatusFilter);

  const focus = (status: StagingRow['status']) => {
    setStatusFilter(status);
    document.getElementById('staging-preview')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <PanelCard title="Import Summary / 匯入摘要" icon={<BarChart3 size={15} />}>
      <dl>
        <Row label="Detected Rows" zh="偵測列數" value={String(summary.detected_rows)} />
        <Row label="Included Rows" zh="納入列數" value={String(summary.included_rows)} />
        <Row
          label="Valid"
          zh="有效"
          value={String(summary.valid_rows)}
          tone="text-ok-600"
          onClick={() => focus('VALID')}
        />
        <Row
          label="Warnings"
          zh="警告"
          value={String(summary.warning_rows)}
          tone={summary.warning_rows > 0 ? 'text-warn-600' : 'text-ink-900'}
          onClick={() => focus('WARNING')}
        />
        <Row
          label="Errors"
          zh="錯誤"
          value={String(summary.error_rows)}
          tone={summary.error_rows > 0 ? 'text-danger-600' : 'text-ink-900'}
          onClick={() => focus('ERROR')}
        />
        <Row
          label="Duplicates"
          zh="重複"
          value={String(summary.duplicate_rows)}
          tone={summary.duplicate_rows > 0 ? 'text-accent-700' : 'text-ink-900'}
          onClick={() => focus('DUPLICATE')}
        />
        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-line pt-2">
          <dt className="text-[12px] text-ink-500">
            <BilingualTooltip zh={tip('Total Power') ?? ''} align="left">
              Total Power <span className="text-ink-400">/ 總功耗</span>
            </BilingualTooltip>
          </dt>
          <dd className="tabular text-[14px] font-bold text-ink-900">
            {summary.total_power_W.toFixed(1)} W
          </dd>
        </div>
      </dl>

      {summary.category_breakdown.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <h4 className="mb-1.5 text-[11px] font-bold text-ink-700">
            Category Breakdown / 類別分佈
          </h4>
          <dl>
            {summary.category_breakdown.map((entry) => (
              <div
                key={entry.category}
                className="flex items-baseline justify-between gap-3 py-[3px] text-[12px]"
              >
                <dt className="text-ink-500">{entry.category}</dt>
                <dd className="tabular text-ink-700">
                  {entry.types} type{entry.types === 1 ? '' : 's'} /{' '}
                  <span className="font-semibold">{entry.power_W.toFixed(1)} W</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* 02 §19 / §34 — the number above is a component dissipation summary. */}
      <p className="mt-3 rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5 text-[11px] leading-relaxed text-warn-600">
        <AlertTriangle size={12} className="mr-1 inline" aria-hidden />
        Total Power is a component dissipation summary. It is <strong>not</strong> thermal edge
        heat flow (Q).
        <span className="mt-0.5 block">
          此為元件功耗摘要，非熱網路邊 (Edge) 的熱流 Q，不可作為熱流依據。
        </span>
      </p>
    </PanelCard>
  );
}

export function ValidationPanel() {
  const rows = useComponentImportStore((s) => s.rows);
  const mapping = useComponentImportStore((s) => s.mapping);
  const setStatusFilter = useComponentImportStore((s) => s.setStatusFilter);
  const setSearch = useComponentImportStore((s) => s.setSearch);

  const unmappedRequired = useMemo(
    () => REQUIRED_FIELDS.filter((field) => !mapping.includes(field)),
    [mapping],
  );

  const importable = rows.filter((row) => row.include && row.status !== 'ERROR').length;
  const missingRjc = rows.filter((row) => row.r_jc_C_per_W == null && row.status !== 'ERROR').length;
  const missingLimit = rows.filter((row) => row.limit_C == null && row.status !== 'ERROR').length;
  const invalidRows = rows.filter((row) => row.status === 'ERROR');

  const jumpTo = (status: StagingRow['status'], name?: string) => {
    setStatusFilter(status);
    if (name) setSearch(name);
    document.getElementById('staging-preview')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <PanelCard title="Validation / 驗證結果" icon={<ShieldCheck size={15} />}>
      <ul className="flex flex-col gap-1">
        <li className="flex items-start gap-2 py-1 text-[12px]">
          {unmappedRequired.length === 0 ? (
            <CheckCircle2 size={15} className="mt-px shrink-0 text-ok-600" aria-hidden />
          ) : (
            <CircleAlert size={15} className="mt-px shrink-0 text-danger-600" aria-hidden />
          )}
          <span className={unmappedRequired.length === 0 ? 'text-ink-700' : 'text-danger-600'}>
            {unmappedRequired.length === 0
              ? 'Required fields mapped / 必要欄位已對應'
              : `Unmapped required: ${unmappedRequired.join(', ')} / 必要欄位未對應`}
          </span>
        </li>

        <li className="flex items-start gap-2 py-1 text-[12px]">
          <CheckCircle2 size={15} className="mt-px shrink-0 text-ok-600" aria-hidden />
          <span className="text-ink-700">{importable} rows ready / {importable} 列可匯入</span>
        </li>

        {missingRjc > 0 && (
          <li>
            <button
              type="button"
              onClick={() => jumpTo('WARNING')}
              className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface-muted"
            >
              <AlertTriangle size={15} className="mt-px shrink-0 text-warn-600" aria-hidden />
              <span className="text-warn-600">
                {missingRjc} rows missing Rjc / {missingRjc} 列缺少 Rjc
              </span>
            </button>
          </li>
        )}

        {missingLimit > 0 && (
          <li>
            <button
              type="button"
              onClick={() => jumpTo('WARNING')}
              className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface-muted"
            >
              <AlertTriangle size={15} className="mt-px shrink-0 text-warn-600" aria-hidden />
              <span className="text-warn-600">
                {missingLimit} rows missing thermal limit / {missingLimit} 列缺少溫度上限
              </span>
            </button>
          </li>
        )}

        {invalidRows.map((row) => (
          <li key={row.row_id}>
            <button
              type="button"
              onClick={() => jumpTo('ERROR', row.name)}
              className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface-muted"
            >
              <CircleAlert size={15} className="mt-px shrink-0 text-danger-600" aria-hidden />
              <span className="text-danger-600">
                {row.row_id}: {row.issues.find((issue) => issue.severity === 'error')?.message}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {(missingRjc > 0 || missingLimit > 0) && (
        <p className="mt-2.5 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-400">
          Missing thermal fields do not block the import — complete them in Component Manager.
          <span className="block">缺少熱參數不會阻擋匯入，可於「元件管理」補齊。</span>
        </p>
      )}
    </PanelCard>
  );
}

export function ProjectImpactPanel() {
  const rows = useComponentImportStore((s) => s.rows);
  const sessionPolicy = useComponentImportStore((s) => s.sessionPolicy);
  const existing = useComponentStore((s) => s.components);
  const impact = useMemo(
    () => projectImpact(rows, existing, sessionPolicy),
    [rows, existing, sessionPolicy],
  );

  return (
    <PanelCard title="Project Impact / 專案影響預覽" icon={<TrendingUp size={15} />}>
      <dl>
        <Row
          label="Current Components"
          zh="目前元件數"
          value={String(impact.current_components)}
        />
        <Row
          label="New Components"
          zh="新增元件"
          value={`+${impact.new_components}`}
          tone="text-ok-600"
        />
        <Row
          label="Replaced"
          zh="將取代"
          value={String(impact.replaced)}
          tone={impact.replaced > 0 ? 'text-accent-700' : 'text-ink-900'}
        />
        <Row label="Skipped" zh="略過" value={String(impact.skipped)} tone="text-ink-500" />
        <div className="mt-1.5 border-t border-line pt-2">
          <Row
            label="Projected Total"
            zh="匯入後預計總數"
            value={String(impact.projected_total)}
          />
          <Row
            label="Projected Power"
            zh="匯入後總功耗"
            value={`${impact.projected_power_W.toFixed(1)} W`}
          />
        </div>
      </dl>
    </PanelCard>
  );
}
