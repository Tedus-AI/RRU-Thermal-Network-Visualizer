/**
 * The check step's summary — 02 §19–§22, on one line instead of three cards.
 *
 * The counts, the total power and the project impact used to be five stat cards,
 * a validation card that restated "10 rows ready" and a project-impact card,
 * all saying the same handful of numbers. They are now one line above the
 * table: the status counts filter it, and what the project will look like after
 * the import sits at its right end. What still needs a decision before applying
 * (an unmapped required column, a row with an error) gets its own panel, and
 * only then; duplicates get their bar only when there are duplicates.
 */

import { useMemo } from 'react';
import { CircleAlert, Copy } from 'lucide-react';
import { InfoTip } from '@/ui/primitives';
import { useComponentImportStore } from '@/data/componentImportStore';
import { useComponentStore } from '@/data/componentStore';
import { projectImpact, summarizeImport } from '@/importers/component/summarize';
import {
  DUPLICATE_POLICIES,
  REQUIRED_FIELDS,
  type DuplicatePolicy,
  type ImportSourceDescriptor,
  type RowIssue,
  type StagingRow,
} from '@/importers/component/types';

const SOURCE_LABEL: Record<ImportSourceDescriptor['source_type'], string> = {
  AIThermal: 'AI-Thermal',
  ExistingProject: '本工具專案',
  CSV: 'CSV 檔',
  Excel: 'Excel 檔',
  Paste: '貼上的表格',
  Manual: '手動',
  Library: '元件庫',
};

/** Where the staged rows came from, as one line. */
export function sourceLine(source: ImportSourceDescriptor | null): string {
  if (!source) return '';
  const kind = SOURCE_LABEL[source.source_type];
  const name = source.source_project_name ?? '';
  const file = source.source_file ? `（${source.source_file}）` : '';
  return `${kind}${name ? ` ${name}` : ''}${file}`;
}

/** A warning's short name, for the breakdown under the 警告 count. */
const ISSUE_SHORT: Partial<Record<RowIssue['field'], string>> = {
  R_jc: '缺 Rjc',
  'Limit(C)': '缺限溫',
  TIM_Type: '未指定 TIM',
  Heat_Path: '散熱路徑推定',
  Source_L: '缺熱源面尺寸',
  Source_W: '缺熱源面尺寸',
  Package_L: '缺熱源面尺寸',
  Package_W: '缺熱源面尺寸',
  'Power(W)': '功耗 0 W',
  Category: '未指定類別',
  Package: '封裝無法辨識',
};

/** "缺熱源面尺寸 2・散熱路徑推定 1" — counted per row, from the rows' own warnings. */
export function warningBreakdown(rows: StagingRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.include || row.status === 'ERROR') continue;
    const seen = new Set<string>();
    for (const issue of row.issues) {
      if (issue.severity !== 'warning') continue;
      const label = ISSUE_SHORT[issue.field] ?? issue.message_zh ?? issue.message;
      if (seen.has(label)) continue;
      seen.add(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([label, count]) => `${label} ${count}`).join('・');
}

export function ReviewStatsLine() {
  const rows = useComponentImportStore((s) => s.rows);
  const source = useComponentImportStore((s) => s.source);
  const statusFilter = useComponentImportStore((s) => s.statusFilter);
  const setStatusFilter = useComponentImportStore((s) => s.setStatusFilter);
  const sessionPolicy = useComponentImportStore((s) => s.sessionPolicy);
  const existing = useComponentStore((s) => s.components);
  const summary = useMemo(() => summarizeImport(rows), [rows]);
  const impact = useMemo(() => projectImpact(rows, existing, sessionPolicy), [rows, existing, sessionPolicy]);
  const pieces = rows.reduce((sum, row) => sum + (row.include && row.status !== 'ERROR' ? (row.qty ?? 0) : 0), 0);
  const warnings = warningBreakdown(rows);

  const counts: Array<{ status: StagingRow['status']; label: string; value: number; tone: string; title?: string }> = [
    { status: 'VALID', label: '有效', value: summary.valid_rows, tone: 'text-ok-600' },
    {
      status: 'WARNING',
      label: '警告',
      value: summary.warning_rows,
      tone: summary.warning_rows > 0 ? 'text-warn-600' : 'text-ink-400',
      title: warnings ? `${warnings}（不會擋下匯入，可在 04 補齊）` : undefined,
    },
    {
      status: 'ERROR',
      label: '錯誤',
      value: summary.error_rows,
      tone: summary.error_rows > 0 ? 'text-danger-600' : 'text-ink-400',
    },
    {
      status: 'DUPLICATE',
      label: '重複',
      value: summary.duplicate_rows,
      tone: summary.duplicate_rows > 0 ? 'text-accent-700' : 'text-ink-400',
    },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {source && (
        <p className="text-[12px] text-ink-500">
          來源：<span className="font-semibold text-ink-700">{sourceLine(source)}</span>
        </p>
      )}
      <div className="tabular flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-700">
        <span className="font-semibold">
          {summary.detected_rows} 種・{pieces} 顆：
        </span>
        {counts.map((entry) => {
          const active = statusFilter === entry.status;
          return (
            <button
              key={entry.status}
              type="button"
              aria-pressed={active}
              title={entry.title ?? (active ? '取消篩選' : `只看${entry.label}`)}
              onClick={() => setStatusFilter(active ? 'ALL' : entry.status)}
              className={`rounded-full border px-2 py-0.5 transition-colors ${
                active ? 'border-accent-600 bg-accent-50' : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              {entry.label} <span className={`font-bold ${entry.tone}`}>{entry.value}</span>
            </button>
          );
        })}
        <span className="text-ink-300" aria-hidden>
          ｜
        </span>
        {/* 02 §19 / §34 — a component dissipation summary, never edge heat flow. */}
        <span title="Σ 數量 × 單顆功耗（勾選、沒有錯誤的列）。元件功耗加總，不是熱網路邊的熱流 Q。">
          <span className="font-bold text-ink-900">{summary.total_power_W.toFixed(1)} W</span>
        </span>
        <span className="text-ink-300" aria-hidden>
          ｜
        </span>
        <span className="text-ink-500">
          匯入後 <span className="font-semibold text-ink-700">{impact.projected_total} 種</span>・
          <span className="font-semibold text-ink-700">{impact.projected_power_W.toFixed(1)} W</span>
          {(impact.replaced > 0 || impact.skipped > 0) && (
            <span className="ml-1 text-ink-400">
              （{impact.replaced > 0 ? `取代 ${impact.replaced}` : ''}
              {impact.replaced > 0 && impact.skipped > 0 ? '・' : ''}
              {impact.skipped > 0 ? `略過 ${impact.skipped}` : ''}）
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * What blocks the import — an unmapped required column, rows with an error.
 * Nothing to act on renders nothing: the per-row reasons are on the rows.
 */
export function BlockingIssuesPanel() {
  const rows = useComponentImportStore((s) => s.rows);
  const mapping = useComponentImportStore((s) => s.mapping);
  const setStep = useComponentImportStore((s) => s.setStep);
  const setStatusFilter = useComponentImportStore((s) => s.setStatusFilter);
  const setSearch = useComponentImportStore((s) => s.setSearch);
  const unmapped = useMemo(() => REQUIRED_FIELDS.filter((field) => !mapping.includes(field)), [mapping]);
  const errors = rows.filter((row) => row.include && row.status === 'ERROR');
  if (unmapped.length === 0 && errors.length === 0) return null;

  return (
    <div className="rounded-lg border border-danger-500/40 bg-surface px-4 py-3 text-[12.5px]">
      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-danger-600">
        <CircleAlert size={15} aria-hidden />
        要先處理才能套用
      </p>
      <ul className="flex flex-col gap-1">
        {unmapped.length > 0 && (
          <li>
            <button type="button" className="text-left text-danger-600 hover:underline" onClick={() => setStep('mapping')}>
              必要欄位還沒對應：{unmapped.join('、')} →
            </button>
          </li>
        )}
        {errors.map((row) => (
          <li key={row.row_id}>
            <button
              type="button"
              className="text-left text-danger-600 hover:underline"
              onClick={() => {
                setStatusFilter('ERROR');
                setSearch(row.name);
              }}
            >
              {row.name || row.row_id}：{row.issues.find((issue) => issue.severity === 'error')?.message_zh ??
                row.issues.find((issue) => issue.severity === 'error')?.message}
            </button>
          </li>
        ))}
      </ul>
      {errors.length > 0 && (
        <p className="mt-1.5 text-ink-400">有錯誤的列不會匯入；改好或取消勾選即可套用其他列。</p>
      )}
    </div>
  );
}

export const DUPLICATE_COPY: Record<DuplicatePolicy, { label: string; detail: string }> = {
  MERGE_NON_EMPTY: { label: '合併非空欄位', detail: '匯入有值的欄位覆蓋現有的，匯入空白的欄位保留現有的。' },
  REPLACE: { label: '取代現有資料', detail: '以匯入的值覆蓋元件欄位；不認得的附加資料保留。' },
  SKIP: { label: '跳過（保留現有）', detail: '現有元件不動，這一列不匯入。' },
  NEW_VARIANT: { label: '另建一顆', detail: '匯入成另一顆元件，名稱加上「(Imported)」。' },
};

/** Only when there are duplicates: how the rows that match an existing component are handled. */
export function DuplicateBar() {
  const rows = useComponentImportStore((s) => s.rows);
  const sessionPolicy = useComponentImportStore((s) => s.sessionPolicy);
  const setSessionPolicy = useComponentImportStore((s) => s.setSessionPolicy);
  const duplicates = rows.filter((row) => row.duplicate_of != null && row.include).length;
  const overrides = rows.filter((row) => row.duplicate_of != null && row.duplicate_action != null).length;
  if (duplicates === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-600/30 bg-accent-50/60 px-4 py-2.5 text-[12.5px] text-ink-700">
      <Copy size={14} className="text-accent-600" aria-hidden />
      <span>
        重複 <strong>{duplicates}</strong> 顆（名稱＋類別與專案裡的元件相同）：處理方式
      </span>
      <label htmlFor="dup-policy" className="sr-only">
        重複的處理方式
      </label>
      <select
        id="dup-policy"
        value={sessionPolicy}
        onChange={(event) => setSessionPolicy(event.target.value as DuplicatePolicy)}
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12.5px]"
      >
        {DUPLICATE_POLICIES.map((policy) => (
          <option key={policy} value={policy}>
            {DUPLICATE_COPY[policy].label}
          </option>
        ))}
      </select>
      <InfoTip text={DUPLICATE_POLICIES.map((policy) => `${DUPLICATE_COPY[policy].label}：${DUPLICATE_COPY[policy].detail}`).join('\n')} />
      <span className="text-ink-500">{DUPLICATE_COPY[sessionPolicy].detail}</span>
      {overrides > 0 && <span className="text-accent-700">（{overrides} 列另外指定）</span>}
    </div>
  );
}
