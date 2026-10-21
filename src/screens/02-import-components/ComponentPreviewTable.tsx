/**
 * Step 3 — the staged rows, with search, filter, bulk actions and inline
 * editing (02 §9, §18, §19).
 *
 * Everything here mutates the staging store only. componentStore is untouched
 * until Apply (02 §8).
 *
 * Read across, a row says what the part will arrive as: Tj or Tc beside the
 * limit (from the carried spec — AI-Thermal and project sources state it), 本體
 * in place of an Rjc a body source does not have, the heat path in words with
 * 推定 when it is only inferred, and the first reason a row is flagged on a
 * line of its own under it rather than in a tooltip on the status.
 */

import { Fragment, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Copy, XCircle } from 'lucide-react';
import { Badge, Button, SectionCard } from '@/ui/primitives';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@/domain/component';
import { useComponentImportStore } from '@/data/componentImportStore';
import { effectiveHeatPath, effectiveSourceFace } from '@/importers/component/buildStagingRows';
import {
  CARRIED_SPEC_COLUMN,
  carriedBodySource,
  carriedDirectContact,
  decodeCarriedSpec,
} from '@/importers/component/carriedSpec';
import { rowTotalPowerW } from '@/importers/component/summarize';
import { DUPLICATE_POLICIES, type DuplicatePolicy, type StagingRow } from '@/importers/component/types';
import { HEAT_PATH_SHORT } from '@/screens/04-component-manager/HeatPathIcons';
import { DUPLICATE_COPY } from './ImportSummaryPanel';

const STATUS_META: Record<
  StagingRow['status'],
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'accent' | 'neutral'; icon: typeof CheckCircle2 }
> = {
  VALID: { label: '有效', tone: 'ok', icon: CheckCircle2 },
  WARNING: { label: '警告', tone: 'warn', icon: AlertTriangle },
  ERROR: { label: '錯誤', tone: 'danger', icon: XCircle },
  DUPLICATE: { label: '重複', tone: 'accent', icon: Copy },
  EXCLUDED: { label: '不匯入', tone: 'neutral', icon: Circle },
};

const TONE_TEXT = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  accent: 'text-accent-600',
  neutral: 'text-ink-400',
} as const;

function numberCell(value: number | null, digits = 2): string {
  return value == null ? '—' : value.toFixed(digits);
}

function StatusCell({ row }: { row: StagingRow }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  // Status is icon + text, never colour alone (02 §32).
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon size={14} className={TONE_TEXT[meta.tone]} aria-hidden />
      <span className="text-[12px] font-medium">{meta.label}</span>
    </span>
  );
}

// No w-full here: a percentage width gives an input no minimum, and in an
// auto-layout table the number fields then collapse to nothing. Each input
// states its own width. The spinner arrows go: they reserve about 15 px of a
// 44 px field even while hidden, which cut "225" to "22".
const INPUT_CLASS =
  'tabular h-7 rounded border border-transparent bg-transparent px-1 text-[12px] [appearance:textfield] hover:border-line-strong focus:border-accent-500 focus:bg-surface focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** 20.57 → "20.6", 10 → "10": one decimal only where there is one. */
function mm(value: number | null): string {
  if (value == null) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function ComponentPreviewTable() {
  const allRows = useComponentImportStore((s) => s.rows);
  const search = useComponentImportStore((s) => s.search);
  const categoryFilter = useComponentImportStore((s) => s.categoryFilter);
  const statusFilter = useComponentImportStore((s) => s.statusFilter);
  const includedOnly = useComponentImportStore((s) => s.includedOnly);

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

  const filtered = search.trim() !== '' || categoryFilter !== 'ALL' || statusFilter !== 'ALL' || includedOnly;
  const showDuplicates = allRows.some((row) => row.duplicate_of != null);
  const columns = showDuplicates ? 13 : 12;

  return (
    <SectionCard
      title="檢查元件"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={store.includeAllValid}>全選有效</Button>
          <Button onClick={store.excludeErrors}>排除錯誤</Button>
        </div>
      }
    >
      {/* Toolbar — 02 §18. The status filter is the counts above the table. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="搜尋元件"
          placeholder="搜尋元件…"
          value={search}
          onChange={(event) => store.setSearch(event.target.value)}
          className="h-8 w-52 rounded-md border border-line-strong bg-surface px-2.5 text-[12px]"
        />
        <select
          aria-label="依分類篩選"
          value={categoryFilter}
          onChange={(event) => store.setCategoryFilter(event.target.value as ComponentCategory | 'ALL')}
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
        >
          <option value="ALL">全部分類</option>
          {COMPONENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
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
          只看要匯入的
        </label>
        {filtered && (
          <Button className="h-8" onClick={store.resetFilters}>
            清除篩選
          </Button>
        )}
        <select
          aria-label="設定顯示中各列的分類"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) {
              store.setCategoryFor(
                rows.map((row) => row.row_id),
                event.target.value as ComponentCategory,
              );
              event.target.value = '';
            }
          }}
          className="ml-auto h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
        >
          <option value="">{filtered ? `將顯示的 ${rows.length} 列分類設為…` : '將全部列的分類設為…'}</option>
          {COMPONENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-muted">
            <tr className="border-b border-line text-[11.5px] font-semibold whitespace-nowrap text-ink-700">
              <th scope="col" className="px-1.5 py-2">
                <span className="sr-only">匯入</span>
              </th>
              <th scope="col" className="px-1.5 py-2">狀態</th>
              <th scope="col" className="px-1.5 py-2">分類</th>
              <th scope="col" className="px-1.5 py-2">元件名稱</th>
              <th scope="col" className="px-1.5 py-2 text-right">數量</th>
              <th scope="col" className="px-1.5 py-2 text-right">
                單顆 <span className="font-normal text-ink-400">W</span>
              </th>
              <th
                scope="col"
                className="bg-accent-50 px-1.5 py-2 text-right"
                title="數量 × 單顆功耗。元件功耗加總，不是熱網路邊的熱流 Q。"
              >
                總功耗 <span className="font-normal text-ink-400">W</span>
              </th>
              <th scope="col" className="px-1.5 py-2 text-right">
                限溫 <span className="font-normal text-ink-400">°C</span>
              </th>
              <th scope="col" className="px-1.5 py-2 text-right">
                Rjc <span className="font-normal text-ink-400">°C/W</span>
              </th>
              <th scope="col" className="px-1.5 py-2">散熱路徑</th>
              <th scope="col" className="px-1.5 py-2">TIM</th>
              <th scope="col" className="px-1.5 py-2 text-right">
                熱源面 <span className="font-normal text-ink-400">mm</span>
              </th>
              {showDuplicates && (
                <th scope="col" className="px-1.5 py-2">
                  重複處理
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-6 text-center text-[13px] text-ink-400">
                  沒有符合篩選條件的列。
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const total = rowTotalPowerW(row);
              const hasError = row.status === 'ERROR';
              const carried = decodeCarriedSpec(row.extra[CARRIED_SPEC_COLUMN]);
              const heatPath = effectiveHeatPath(row);
              const body = carriedBodySource(carried, heatPath);
              const limitType = carried?.thermal_spec.limit_type ?? null;
              const face = effectiveSourceFace(row);
              const flagged = row.include && (row.status === 'WARNING' || row.status === 'ERROR');
              const issues = [
                ...row.issues.filter((issue) => issue.severity === 'error'),
                ...row.issues.filter((issue) => issue.severity === 'warning'),
              ];
              const rowTone = hasError
                ? 'bg-danger-100/40'
                : row.status === 'DUPLICATE'
                  ? 'bg-accent-50/60'
                  : !row.include
                    ? 'bg-surface-muted text-ink-400'
                    : 'bg-surface';
              const label = row.name || row.row_id;

              return (
                <Fragment key={row.row_id}>
                  <tr
                    id={`row-${row.row_id}`}
                    className={`text-[12px] ${flagged && issues.length > 0 ? '' : 'border-b border-line'} ${rowTone}`}
                  >
                    <td className="px-1.5 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`匯入 ${label}`}
                        className="size-4 accent-[var(--color-accent-600)]"
                        checked={row.include}
                        onChange={(event) => store.toggleInclude(row.row_id, event.target.checked)}
                      />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <StatusCell row={row} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <select
                        aria-label={`${label} 的分類`}
                        value={row.category ?? ''}
                        onChange={(event) =>
                          store.editRow(row.row_id, {
                            category: (event.target.value || null) as ComponentCategory | null,
                          })
                        }
                        className={`${INPUT_CLASS} w-[4.75rem]`}
                      >
                        <option value="">—</option>
                        {COMPONENT_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input
                        aria-label={`${row.row_id} 的元件名稱`}
                        title={row.name}
                        value={row.name}
                        onChange={(event) => store.editRow(row.row_id, { name: event.target.value })}
                        className={`${INPUT_CLASS} w-full min-w-[9.5rem] font-medium`}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 text-right">
                      <input
                        type="number"
                        aria-label={`${label} 的數量`}
                        value={row.qty ?? ''}
                        onChange={(event) =>
                          store.editRow(row.row_id, {
                            qty: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                        className={`${INPUT_CLASS} w-11 text-right`}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        aria-label={`${label} 的單顆功耗`}
                        value={row.power_W ?? ''}
                        onChange={(event) =>
                          store.editRow(row.row_id, {
                            power_W: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                        className={`${INPUT_CLASS} w-[3.75rem] text-right`}
                      />
                    </td>
                    {/* Qty × Power. A component dissipation summary, never edge Q. */}
                    <td className="tabular bg-accent-50/60 px-1.5 py-1.5 text-right font-semibold">
                      {numberCell(total)}
                    </td>
                    <td className="px-1.5 py-1.5 text-right">
                      <span className="inline-flex items-center justify-end">
                        {limitType && (
                          <span className="text-[11px] font-semibold text-ink-500" title="限溫對象（來源指定）">
                            {limitType}
                          </span>
                        )}
                        <input
                          type="number"
                          aria-label={`${label} 的限溫`}
                          value={row.limit_C ?? ''}
                          onChange={(event) =>
                            store.editRow(row.row_id, {
                              limit_C: event.target.value === '' ? null : Number(event.target.value),
                            })
                          }
                          className={`${INPUT_CLASS} w-11 text-left`}
                        />
                      </span>
                    </td>
                    <td className="px-1.5 py-1.5 text-right">
                      {body ? (
                        <span
                          className="text-[12px] text-ink-500"
                          title="本體型熱源：沒有接面，不用 Rjc（來源的 Rjc 是 0）"
                        >
                          本體
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`${label} 的 Rjc`}
                          value={row.r_jc_C_per_W ?? ''}
                          placeholder="—"
                          onChange={(event) =>
                            store.editRow(row.row_id, {
                              r_jc_C_per_W: event.target.value === '' ? null : Number(event.target.value),
                            })
                          }
                          className={`${INPUT_CLASS} w-[3.25rem] text-right`}
                        />
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 whitespace-nowrap">
                      {HEAT_PATH_SHORT[heatPath].name}
                      {row.heat_path == null && (
                        <span className="ml-1 text-[11px] text-warn-600" title="來源沒有寫，依分類推定">
                          推定
                        </span>
                      )}
                    </td>
                    <td className="max-w-[6.5rem] px-1.5 py-1.5 leading-tight">
                      {row.tim_name ?? (carriedDirectContact(carried) ? '乾式接觸' : '—')}
                    </td>
                    {/*
                      Which pair this is depends on the heat path (GEOMETRY_RULES):
                      a coin-soldered or top-cooled part takes its face from the
                      package outline, the other two state it. `effectiveSourceFace`
                      is the same resolver Apply uses, so what is shown here is what
                      the component gets.
                    */}
                    <td className="tabular px-1.5 py-1.5 text-right whitespace-nowrap">
                      {face.L == null && face.W == null ? (
                        '—'
                      ) : (
                        <>
                          {mm(face.L)}×{mm(face.W)}
                          <span className="ml-1 text-[10.5px] text-ink-400">
                            {face.from === 'package' ? '本體' : heatPath === 'Board' ? 'E-PAD' : '填寫'}
                          </span>
                        </>
                      )}
                    </td>
                    {showDuplicates && (
                      <td className="px-1.5 py-1.5">
                        {row.duplicate_of ? (
                          <select
                            aria-label={`${label} 的重複處理`}
                            value={row.duplicate_action ?? ''}
                            onChange={(event) =>
                              store.setRowDuplicateAction(
                                row.row_id,
                                (event.target.value || null) as DuplicatePolicy | null,
                              )
                            }
                            className={`${INPUT_CLASS} min-w-[8rem] border-accent-600/40`}
                          >
                            <option value="">依上方設定</option>
                            {DUPLICATE_POLICIES.map((policy) => (
                              <option key={policy} value={policy}>
                                {DUPLICATE_COPY[policy].label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[12px] text-ink-400">新增</span>
                        )}
                      </td>
                    )}
                  </tr>
                  {flagged && issues.length > 0 && (
                    <tr className={`border-b border-line ${rowTone}`}>
                      <td />
                      <td
                        colSpan={columns - 1}
                        className={`px-2 pb-1.5 text-[11.5px] ${hasError ? 'text-danger-600' : 'text-ink-500'}`}
                        title={issues.map((issue) => issue.message_zh ?? issue.message).join('\n')}
                      >
                        {issues[0].message_zh ?? issues[0].message}
                        {issues.length > 1 && <span className="ml-1 text-ink-400">（還有 {issues.length - 1} 項）</span>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px] text-ink-500">
        <span>
          顯示 {rows.length}／共 {allRows.length} 種
        </span>
        {allRows.length > 500 && <Badge tone="warn">資料量偏大（超過 500 列）</Badge>}
      </div>
    </SectionCard>
  );
}
