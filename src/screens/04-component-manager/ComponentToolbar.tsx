/**
 * Category tabs, filters and the actions on the table — 04 §8, §9.
 *
 * The filter row used to be five dropdowns, a checkbox and a Reset button, and
 * the status dropdown repeated the status chips above the table. Search stays
 * out in the open; status is the chips; the rarely used rest (heat source, data
 * source, completeness, show disabled) is behind 更多篩選, which says how many
 * of them are set. Reset only appears when something is filtered.
 *
 * The actions moved from under the table to its top-right corner, beside the
 * filters, where they are found before the table is scrolled past.
 * "Manage Library" is gone from here: the header's 元件庫 opens the same
 * dialog.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Layers, Library, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react';
import { Button } from '@/ui/primitives';
import { dataSourceLabelZh } from '@/ui/dataSourceLabels';
import { COMPONENT_CATEGORIES, type Component, type ComponentCategory } from '@/domain/component';
import { statusOf } from '@/domain/componentReadiness';

export type CategoryTab = 'All' | ComponentCategory;
export type StatusFilter = 'ALL' | 'READY' | 'WARNING' | 'ERROR' | 'DISABLED';
export type HeatSourceFilter = 'ALL' | 'HEAT' | 'PASSIVE';
export type CompletenessFilter = 'ALL' | 'COMPLETE' | 'INCOMPLETE';

export interface Filters {
  search: string;
  status: StatusFilter;
  heatSource: HeatSourceFilter;
  source: string;
  completeness: CompletenessFilter;
  showDisabled: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  search: '',
  status: 'ALL',
  heatSource: 'ALL',
  source: 'ALL',
  completeness: 'ALL',
  showDisabled: true,
};

/** How many of the folded-away filters are set. */
function moreFilterCount(filters: Filters): number {
  return (
    (filters.heatSource !== 'ALL' ? 1 : 0) +
    (filters.source !== 'ALL' ? 1 : 0) +
    (filters.completeness !== 'ALL' ? 1 : 0) +
    (filters.showDisabled !== DEFAULT_FILTERS.showDisabled ? 1 : 0)
  );
}

function isFiltered(filters: Filters, tab: CategoryTab): boolean {
  return (
    tab !== 'All' ||
    filters.search.trim() !== '' ||
    filters.status !== 'ALL' ||
    moreFilterCount(filters) > 0
  );
}

/** A button that opens a small panel under itself; closes on Esc or a click elsewhere. */
function Popover({
  label,
  icon,
  align = 'left',
  disabled,
  variant = 'secondary',
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  align?: 'left' | 'right';
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button
        variant={variant}
        className="h-8"
        icon={icon}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="true"
        trailingIcon={<ChevronDown size={13} className={open ? 'rotate-180' : ''} />}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </Button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-1 min-w-[15rem] rounded-lg border border-line bg-surface p-2 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const SELECT_CLASS = 'h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[12px]';

export function CategoryTabs({
  components,
  active,
  onChange,
}: {
  components: Component[];
  active: CategoryTab;
  onChange: (tab: CategoryTab) => void;
}) {
  const tabs: CategoryTab[] = ['All', ...COMPONENT_CATEGORIES];

  return (
    <div
      role="tablist"
      aria-label="元件分類"
      className="flex flex-wrap items-end gap-1 border-b border-line"
    >
      {tabs.map((tab) => {
        const scoped = tab === 'All' ? components : components.filter((c) => c.category === tab);
        if (tab !== 'All' && scoped.length === 0) return null;
        const errors = scoped.filter((c) => statusOf(c) === 'ERROR').length;
        const warnings = scoped.filter((c) => statusOf(c) === 'WARNING').length;
        const selected = active === tab;

        return (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              selected
                ? 'border-accent-600 text-accent-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {/* Category names stay English — RF / Digital / Power is how the
                parts are sorted on the floor. "All" is not a category. */}
            {tab === 'All' ? '全部' : tab}
            <span className="tabular font-normal text-ink-400">{scoped.length}</span>
            {errors > 0 ? (
              <span className="size-1.5 rounded-full bg-danger-500" title={`${errors} 個錯誤`} />
            ) : warnings > 0 ? (
              <span className="size-1.5 rounded-full bg-warn-500" title={`${warnings} 個警告`} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ComponentToolbar({
  filters,
  onFilters,
  sources,
  tab,
  onReset,
  actions,
}: {
  filters: Filters;
  onFilters: (next: Filters) => void;
  sources: string[];
  /** The category tab, so Reset can say whether anything is filtered at all. */
  tab: CategoryTab;
  /** Clears the filters and the category tab together. */
  onReset: () => void;
  /** The table actions, shown at the right end of the row. */
  actions?: ReactNode;
}) {
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
  const more = moreFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="搜尋元件"
        placeholder="搜尋元件、代號或封裝…"
        value={filters.search}
        onChange={(event) => set({ search: event.target.value })}
        className="h-8 w-56 rounded-md border border-line-strong bg-surface px-2.5 text-[12px]"
      />

      <Popover
        icon={<SlidersHorizontal size={13} />}
        label={
          <>
            更多篩選
            {more > 0 && <span className="tabular font-normal text-accent-700">（{more}）</span>}
          </>
        }
      >
        {() => (
          <div className="flex flex-col gap-2.5 p-1">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
              熱源
              <select
                aria-label="依熱源篩選"
                value={filters.heatSource}
                onChange={(event) => set({ heatSource: event.target.value as HeatSourceFilter })}
                className={SELECT_CLASS}
              >
                <option value="ALL">不限</option>
                <option value="HEAT">只看熱源</option>
                <option value="PASSIVE">只看被動元件（0 W）</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
              資料來源
              <select
                aria-label="依資料來源篩選"
                value={filters.source}
                onChange={(event) => set({ source: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="ALL">不限</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {dataSourceLabelZh(source)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
              熱資料完整度
              <select
                aria-label="依熱資料完整度篩選"
                value={filters.completeness}
                onChange={(event) =>
                  set({ completeness: event.target.value as CompletenessFilter })
                }
                className={SELECT_CLASS}
              >
                <option value="ALL">不限</option>
                <option value="COMPLETE">已齊全</option>
                <option value="INCOMPLETE">未齊全</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-ink-700">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent-600)]"
                checked={filters.showDisabled}
                onChange={(event) => set({ showDisabled: event.target.checked })}
              />
              顯示停用的元件
            </label>
          </div>
        )}
      </Popover>

      {isFiltered(filters, tab) && (
        <Button variant="ghost" className="h-8" icon={<RotateCcw size={13} />} onClick={onReset}>
          清除篩選
        </Button>
      )}

      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The table actions. Duplicate and Delete are icons at the head of every row,
 * where they need no selection; what is left has no single row to sit on.
 * Bulk Edit says how many rows it would touch — the ones the filters show.
 */
export function ComponentActions({
  visibleCount,
  readOnly,
  onAdd,
  onAddFromLibrary,
  onSaveAllToLibrary,
  onBulkEdit,
  aiUpdate,
}: {
  visibleCount: number;
  readOnly: boolean;
  onAdd: () => void;
  onAddFromLibrary: () => void;
  onSaveAllToLibrary: () => void;
  onBulkEdit: () => void;
  /** Present when components are linked to AI-Thermal: 「從 AI-Thermal 更新」. */
  aiUpdate?: { pending: number; onOpen: () => void };
}) {
  const item =
    'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-[13px] text-ink-700 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <>
      {aiUpdate && (
        <Button
          className={`h-8 ${aiUpdate.pending > 0 ? 'border-warn-500/50 text-warn-600' : ''}`}
          icon={<RefreshCw size={13} />}
          title="讀 AI-Thermal 的資料庫，把它改過的欄位逐欄確認後更新到本工具"
          onClick={aiUpdate.onOpen}
        >
          從 AI-Thermal 更新
          {aiUpdate.pending > 0 && <span className="tabular font-normal">（{aiUpdate.pending}）</span>}
        </Button>
      )}
      <Button
        className="h-8"
        icon={<Layers size={13} />}
        disabled={readOnly || visibleCount === 0}
        title="同時修改目前列出的元件"
        onClick={onBulkEdit}
      >
        批次編輯
        <span className="tabular font-normal text-ink-400">（{visibleCount}）</span>
      </Button>
      <Popover variant="primary" icon={<Plus size={14} />} label="新增元件" align="right">
        {(close) => (
          <div className="flex flex-col">
            <button
              type="button"
              className={item}
              disabled={readOnly}
              onClick={() => {
                close();
                onAdd();
              }}
            >
              <Plus size={14} className="text-ink-400" />
              新增空白元件
            </button>
            <button
              type="button"
              className={item}
              disabled={readOnly}
              onClick={() => {
                close();
                onAddFromLibrary();
              }}
            >
              <Library size={14} className="text-ink-400" />
              從元件庫加入
            </button>
            {/* Files the listed rows into the catalogue. Gated on there being
                rows, not on write access: the catalogue is a different document
                from the project, and an archived project's parts are still
                worth keeping. */}
            <div className="my-1 border-t border-line" />
            <button
              type="button"
              className={item}
              disabled={visibleCount === 0}
              onClick={() => {
                close();
                onSaveAllToLibrary();
              }}
            >
              <Upload size={14} className="text-ink-400" />
              把目前列出的 {visibleCount} 筆存入元件庫
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}

/** Applies the toolbar filters plus the active category tab. */
export function filterComponents(
  components: Component[],
  tab: CategoryTab,
  filters: Filters,
  isComplete: (component: Component) => boolean,
): Component[] {
  const needle = filters.search.trim().toLowerCase();

  return components.filter((component) => {
    if (tab !== 'All' && component.category !== tab) return false;
    if (!filters.showDisabled && !component.enabled) return false;
    if (filters.status !== 'ALL' && statusOf(component) !== filters.status) return false;

    if (filters.heatSource !== 'ALL') {
      const heat = (component.power_W.value ?? 0) > 0;
      if (filters.heatSource === 'HEAT' && !heat) return false;
      if (filters.heatSource === 'PASSIVE' && heat) return false;
    }

    if (filters.source !== 'ALL' && component.provenance.source_type !== filters.source) {
      return false;
    }

    if (filters.completeness !== 'ALL') {
      const complete = isComplete(component);
      if (filters.completeness === 'COMPLETE' && !complete) return false;
      if (filters.completeness === 'INCOMPLETE' && complete) return false;
    }

    if (needle) {
      const haystack = `${component.name} ${component.id} ${component.thermal_spec.package_type ?? ''}`;
      if (!haystack.toLowerCase().includes(needle)) return false;
    }

    return true;
  });
}
