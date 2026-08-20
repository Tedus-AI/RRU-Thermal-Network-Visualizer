/**
 * Section C/F — Component Preview with search, filter, bulk actions and inline
 * editing (02 §9, §18, §19).
 *
 * Everything here mutates the staging store only. componentStore is untouched
 * until Apply (02 §8).
 */

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Copy, XCircle } from 'lucide-react';
import { Badge, Button, SectionCard } from '@/ui/primitives';
import { ColumnLabel } from '@/ui/FieldLabel';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/domain/component';
import { useComponentImportStore } from '@/data/componentImportStore';
import { rowTotalPowerW } from '@/importers/component/summarize';
import {
  DUPLICATE_POLICIES,
  type DuplicatePolicy,
  type StagingRow,
} from '@/importers/component/types';
import { ZH_NAMES, tip } from '@/i18n/componentImportCopy';

const STATUS_META: Record<
  StagingRow['status'],
  {
    label: string;
    zh: string;
    tone: 'ok' | 'warn' | 'danger' | 'accent' | 'neutral';
    icon: typeof CheckCircle2;
  }
> = {
  VALID: { label: 'Valid', zh: '有效', tone: 'ok', icon: CheckCircle2 },
  WARNING: { label: 'Warning', zh: '警告', tone: 'warn', icon: AlertTriangle },
  ERROR: { label: 'Error', zh: '錯誤', tone: 'danger', icon: XCircle },
  DUPLICATE: { label: 'Duplicate', zh: '重複', tone: 'accent', icon: Copy },
  EXCLUDED: { label: 'Excluded', zh: '排除', tone: 'neutral', icon: Circle },
};

const DUPLICATE_LABEL: Record<DuplicatePolicy, string> = {
  SKIP: 'Skip / 跳過',
  REPLACE: 'Replace / 取代',
  MERGE_NON_EMPTY: 'Merge / 合併',
  NEW_VARIANT: 'New Variant / 新版本',
};

function numberCell(value: number | null, digits = 2): string {
  return value == null ? '—' : value.toFixed(digits);
}

function StatusCell({ row }: { row: StagingRow }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  const errors = row.issues.filter((issue) => issue.severity === 'error');
  const warnings = row.issues.filter((issue) => issue.severity === 'warning');
  const detail = [...errors, ...warnings]
    .map((issue) => issue.message_zh ?? issue.message)
    .join('\n');

  return (
    <span
      className="inline-flex items-center gap-1.5"
      // Status is icon + text, never colour alone (02 §32).
      title={detail || undefined}
    >
      <Icon
        size={14}
        className={
          meta.tone === 'ok'
            ? 'text-ok-600'
            : meta.tone === 'warn'
              ? 'text-warn-600'
              : meta.tone === 'danger'
                ? 'text-danger-600'
                : meta.tone === 'accent'
                  ? 'text-accent-600'
                  : 'text-ink-400'
        }
        aria-hidden
      />
      <span className="text-[12px] font-medium whitespace-nowrap">
        {meta.label}
        <span className="ml-1 font-normal text-ink-400">{meta.zh}</span>
      </span>
    </span>
  );
}

const INPUT_CLASS =
  'tabular h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[12px] hover:border-line-strong focus:border-accent-500 focus:bg-surface focus:outline-none';

export function ComponentPreviewTable() {
  const allRows = useComponentImportStore((s) => s.rows);
  const search = useComponentImportStore((s) => s.search);
  const categoryFilter = useComponentImportStore((s) => s.categoryFilter);
  const statusFilter = useComponentImportStore((s) => s.statusFilter);
  const includedOnly = useComponentImportStore((s) => s.includedOnly);
  const sessionPolicy = useComponentImportStore((s) => s.sessionPolicy);

  const store = useComponentImportStore();

  // Filtering happens here rather than in a store selector so the subscription
  // snapshot stays referentially stable between renders.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (includedOnly && !row.include) return false;
      if (categoryFilter !== 'ALL' && (row.category ?? 'Other') !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [allRows, search, categoryFilter, statusFilter, includedOnly]);

  if (allRows.length === 0) return null;

  return (
    <SectionCard
      step={3}
      title="Staging Preview"
      subtitle={`預覽資料 — ${allRows.length} rows`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={store.includeAllValid}>Include All Valid / 全選有效</Button>
          <Button onClick={store.excludeErrors}>Exclude Errors / 排除錯誤</Button>
        </div>
      }
    >
      {/* Toolbar — 02 §18 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search components"
          placeholder="Search / 搜尋元件…"
          value={search}
          onChange={(event) => store.setSearch(event.target.value)}
          className="h-8 w-52 rounded-md border border-line-strong bg-surface px-2.5 text-[12px]"
        />
        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(event) =>
            store.setCategoryFilter(event.target.value as ComponentCategory | 'ALL')
          }
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
        >
          <option value="ALL">All categories / 全部類別</option>
          {COMPONENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) =>
            store.setStatusFilter(event.target.value as StagingRow['status'] | 'ALL')
          }
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
        >
          <option value="ALL">All statuses / 全部狀態</option>
          {Object.entries(STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label} / {meta.zh}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-700">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent-600)]"
            checked={includedOnly}
            onChange={(event) => store.setIncludedOnly(event.target.checked)}
          />
          Included only / 僅顯示已勾選
        </label>
        <Button className="h-8" onClick={store.resetFilters}>
          Reset / 重設
        </Button>
        <select
          aria-label="Set category for all rows"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) {
              store.setCategoryForAll(event.target.value as ComponentCategory);
              event.target.value = '';
            }
          }}
          className="ml-auto h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
        >
          <option value="">Set category for all… / 批次設定類別</option>
          {COMPONENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <thead className="bg-surface-muted">
            <tr className="border-b border-line text-[11px] font-semibold text-ink-700">
              <th scope="col" className="px-2 py-2">
                <span className="sr-only">Include</span>
              </th>
              <th scope="col" className="px-2 py-2">
                <ColumnLabel label="Status" zh={ZH_NAMES.Status} />
              </th>
              <th scope="col" className="px-2 py-2">
                <ColumnLabel label="Category" zh={ZH_NAMES.Category} tooltip={tip('Category')} />
              </th>
              <th scope="col" className="px-2 py-2">
                <ColumnLabel label="Component" zh={ZH_NAMES.Component} tooltip={tip('Component')} />
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                <ColumnLabel label="Qty" zh={ZH_NAMES.Qty} tooltip={tip('Qty')} />
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                <ColumnLabel label="Power" unit="W" zh={ZH_NAMES.Power} tooltip={tip('Power')} />
              </th>
              <th scope="col" className="bg-accent-50 px-2 py-2 text-right">
                <ColumnLabel
                  label="Total Power"
                  unit="W"
                  zh={ZH_NAMES['Total Power']}
                  tooltip={tip('Total Power')}
                />
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                <ColumnLabel label="Limit" unit="°C" zh={ZH_NAMES.Limit} tooltip={tip('Limit')} />
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                <ColumnLabel label="Rjc" unit="°C/W" zh={ZH_NAMES.Rjc} tooltip={tip('Rjc')} />
              </th>
              <th scope="col" className="px-2 py-2">
                <ColumnLabel
                  label="Heat Path"
                  zh={ZH_NAMES['Heat Path']}
                  tooltip={tip('Heat Path')}
                />
              </th>
              <th scope="col" className="px-2 py-2">
                <ColumnLabel label="TIM" zh={ZH_NAMES.TIM} tooltip={tip('TIM')} />
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                <ColumnLabel label="Source L / W" unit="mm" zh="熱源面長 / 寬" />
              </th>
              <th scope="col" className="px-2 py-2">
                <ColumnLabel
                  label="Duplicate Action"
                  zh={ZH_NAMES['Duplicate Action']}
                  tooltip={tip('Duplicate Policy')}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-[13px] text-ink-400">
                  No rows match the current filters. / 沒有符合篩選條件的資料。
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const total = rowTotalPowerW(row);
              const hasError = row.status === 'ERROR';
              return (
                <tr
                  key={row.row_id}
                  id={`row-${row.row_id}`}
                  className={`border-b border-line text-[12px] last:border-b-0 ${
                    hasError
                      ? 'bg-danger-100/40'
                      : row.status === 'DUPLICATE'
                        ? 'bg-accent-50/60'
                        : !row.include
                          ? 'bg-surface-muted text-ink-400'
                          : 'bg-surface'
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Include ${row.name || row.row_id}`}
                      className="size-4 accent-[var(--color-accent-600)]"
                      checked={row.include}
                      onChange={(event) => store.toggleInclude(row.row_id, event.target.checked)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusCell row={row} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      aria-label={`Category for ${row.name || row.row_id}`}
                      value={row.category ?? ''}
                      onChange={(event) =>
                        store.editRow(row.row_id, {
                          category: (event.target.value || null) as ComponentCategory | null,
                        })
                      }
                      className={`${INPUT_CLASS} w-24`}
                    >
                      <option value="">—</option>
                      {COMPONENT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Component name for ${row.row_id}`}
                      value={row.name}
                      onChange={(event) => store.editRow(row.row_id, { name: event.target.value })}
                      className={`${INPUT_CLASS} min-w-36 font-medium`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      aria-label={`Qty for ${row.name || row.row_id}`}
                      value={row.qty ?? ''}
                      onChange={(event) =>
                        store.editRow(row.row_id, {
                          qty: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${INPUT_CLASS} w-14 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Power for ${row.name || row.row_id}`}
                      value={row.power_W ?? ''}
                      onChange={(event) =>
                        store.editRow(row.row_id, {
                          power_W: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${INPUT_CLASS} w-20 text-right`}
                    />
                  </td>
                  {/* Qty × Power. A component dissipation summary, never edge Q. */}
                  <td className="tabular bg-accent-50/60 px-2 py-1.5 text-right font-semibold">
                    {numberCell(total)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      aria-label={`Limit for ${row.name || row.row_id}`}
                      value={row.limit_C ?? ''}
                      onChange={(event) =>
                        store.editRow(row.row_id, {
                          limit_C: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${INPUT_CLASS} w-16 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Rjc for ${row.name || row.row_id}`}
                      value={row.r_jc_C_per_W ?? ''}
                      placeholder="—"
                      onChange={(event) =>
                        store.editRow(row.row_id, {
                          r_jc_C_per_W:
                            event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${INPUT_CLASS} w-16 text-right`}
                    />
                  </td>
                  <td className="tabular px-2 py-1.5 whitespace-nowrap">{row.heat_path ?? '—'}</td>
                  <td className="tabular px-2 py-1.5 whitespace-nowrap">{row.tim_type ?? '—'}</td>
                  <td className="tabular px-2 py-1.5 text-right whitespace-nowrap">
                    {numberCell(row.source_L_mm, 1)} / {numberCell(row.source_W_mm, 1)}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.duplicate_of ? (
                      <select
                        aria-label={`Duplicate action for ${row.name || row.row_id}`}
                        value={row.duplicate_action ?? ''}
                        onChange={(event) =>
                          store.setRowDuplicateAction(
                            row.row_id,
                            (event.target.value || null) as DuplicatePolicy | null,
                          )
                        }
                        className={`${INPUT_CLASS} w-36 border-accent-600/40`}
                      >
                        <option value="">Session default / 採用全域</option>
                        {DUPLICATE_POLICIES.map((policy) => (
                          <option key={policy} value={policy}>
                            {DUPLICATE_LABEL[policy]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[12px] text-ink-400">New / 新增</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px] text-ink-500">
        <span>
          Showing {rows.length} of {allRows.length} rows / 顯示 {rows.length} 筆，共{' '}
          {allRows.length} 筆
        </span>
        {allRows.length > 500 && (
          <Badge tone="warn">Large import detected / 資料量偏大（&gt; 500 列）</Badge>
        )}
        <span className="ml-auto">
          Duplicate policy in effect / 目前重複策略：
          <strong className="ml-1 text-ink-700">{DUPLICATE_LABEL[sessionPolicy]}</strong>
        </span>
      </div>
    </SectionCard>
  );
}
