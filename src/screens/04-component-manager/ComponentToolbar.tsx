/** Category tabs, filters and actions — 04 §8, §9. */

import { Copy, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/ui/primitives';
import { COMPONENT_CATEGORIES, componentTotalPowerW, type Component, type ComponentCategory } from '@/domain/component';
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
    <div role="tablist" aria-label="Component categories" className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const scoped =
          tab === 'All' ? components : components.filter((c) => c.category === tab);
        if (tab !== 'All' && scoped.length === 0) return null;

        const power = scoped.reduce((sum, c) => sum + (c.enabled ? componentTotalPowerW(c) : 0), 0);
        const ready = scoped.filter((c) => statusOf(c) === 'READY').length;
        const attention = scoped.filter((c) => {
          const status = statusOf(c);
          return status === 'WARNING' || status === 'ERROR';
        }).length;
        const selected = active === tab;

        return (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              selected
                ? 'border-accent-600 bg-accent-50'
                : 'border-line bg-surface hover:border-ink-400'
            }`}
          >
            <span
              className={`block text-[13px] font-semibold ${
                selected ? 'text-accent-700' : 'text-ink-900'
              }`}
            >
              {tab}
              <span className="tabular ml-1.5 font-normal text-ink-400">{scoped.length}</span>
            </span>
            <span className="tabular mt-0.5 block text-[11px] text-ink-400">
              {power.toFixed(1)} W · {ready} ready
              {attention > 0 && <span className="text-warn-600"> · {attention} to fix</span>}
            </span>
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
  selectedCount,
  readOnly,
  onAdd,
  onDuplicate,
  onDelete,
  onBulkEdit,
}: {
  filters: Filters;
  onFilters: (next: Filters) => void;
  sources: string[];
  selectedCount: number;
  readOnly: boolean;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBulkEdit: () => void;
}) {
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="Search components"
        placeholder="Search / 搜尋元件…"
        value={filters.search}
        onChange={(event) => set({ search: event.target.value })}
        className="h-8 w-52 rounded-md border border-line-strong bg-surface px-2.5 text-[12px]"
      />

      <select
        aria-label="Filter by status"
        value={filters.status}
        onChange={(event) => set({ status: event.target.value as StatusFilter })}
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
      >
        <option value="ALL">All statuses / 全部狀態</option>
        <option value="READY">Ready / 就緒</option>
        <option value="WARNING">Warning / 警告</option>
        <option value="ERROR">Error / 錯誤</option>
        <option value="DISABLED">Disabled / 停用</option>
      </select>

      <select
        aria-label="Filter by heat source"
        value={filters.heatSource}
        onChange={(event) => set({ heatSource: event.target.value as HeatSourceFilter })}
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
      >
        <option value="ALL">Heat source: any / 熱源不限</option>
        <option value="HEAT">Heat sources / 熱源</option>
        <option value="PASSIVE">Passive / 被動元件</option>
      </select>

      <select
        aria-label="Filter by source"
        value={filters.source}
        onChange={(event) => set({ source: event.target.value })}
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
      >
        <option value="ALL">All sources / 全部來源</option>
        {sources.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by thermal completeness"
        value={filters.completeness}
        onChange={(event) => set({ completeness: event.target.value as CompletenessFilter })}
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12px]"
      >
        <option value="ALL">Completeness: any / 完整度不限</option>
        <option value="COMPLETE">Complete / 已完整</option>
        <option value="INCOMPLETE">Incomplete / 未完整</option>
      </select>

      <label className="flex items-center gap-1.5 text-[12px] text-ink-700">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent-600)]"
          checked={filters.showDisabled}
          onChange={(event) => set({ showDisabled: event.target.checked })}
        />
        Show disabled / 顯示停用
      </label>

      <Button className="h-8" icon={<RotateCcw size={13} />} onClick={() => onFilters(DEFAULT_FILTERS)}>
        Reset / 重設
      </Button>

      <div className="ml-auto flex flex-wrap gap-2">
        <Button className="h-8" icon={<Plus size={14} />} disabled={readOnly} onClick={onAdd}>
          Add Component / 新增
        </Button>
        <Button
          className="h-8"
          icon={<Copy size={13} />}
          disabled={readOnly || selectedCount === 0}
          onClick={onDuplicate}
        >
          Duplicate / 複製
        </Button>
        <Button className="h-8" disabled={readOnly || selectedCount === 0} onClick={onBulkEdit}>
          Bulk Edit / 批次編輯
        </Button>
        <Button
          className="h-8"
          variant="danger"
          icon={<Trash2 size={13} />}
          disabled={readOnly || selectedCount === 0}
          onClick={onDelete}
        >
          Delete / 刪除
        </Button>
      </div>
    </div>
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
