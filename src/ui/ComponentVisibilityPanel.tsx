import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { powerWOf, type Component } from '@/domain/component';

/**
 * View-only component filtering, over a graph canvas.
 *
 * A fully wired RRU draws fifty nodes converging on one bus, and reading one
 * part's chain means being able to put the other nine away for a moment. This
 * panel does that and nothing else: it never mutates topology, never touches
 * the solver input, and never changes a KPI — Screen 07 in particular still
 * solves and reports the whole network while a component is switched off here.
 *
 * `placement` exists because the two screens have different corners free.
 * Screen 05 opens it top-left over its fullscreen canvas; Screen 07's top-left
 * already carries the legend, so it opens bottom-left there.
 */
export function ComponentVisibilityPanel({
  components,
  hiddenIds,
  onToggleVisible,
  onShowAll,
  onClose,
  placement = 'top-left',
}: {
  components: Component[];
  hiddenIds: ReadonlySet<string>;
  onToggleVisible: (componentId: string) => void;
  onShowAll: () => void;
  onClose: () => void;
  placement?: 'top-left' | 'bottom-left';
}) {
  const [query, setQuery] = useState('');
  const visibleComponents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return components;
    return components.filter(
      (component) =>
        component.name.toLowerCase().includes(needle) ||
        component.category.toLowerCase().includes(needle),
    );
  }, [components, query]);

  return (
    <section
      data-fullscreen-component-panel
      aria-label="Component Visibility / 元件顯示"
      className={`absolute left-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(20rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl ${
        placement === 'bottom-left' ? 'bottom-3' : 'top-3'
      }`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-bold text-ink-900">Component Visibility</h2>
          <p className="text-[10px] text-ink-400">元件顯示</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close component visibility / 關閉元件顯示"
          title="Close / 關閉"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-surface-muted hover:text-ink-900"
        >
          <X size={15} />
        </button>
      </header>

      <div className="relative mx-3 mt-3 shrink-0">
        <Search size={13} className="absolute top-2.5 left-2.5 text-ink-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search components…"
          aria-label="Search modeled components / 搜尋已建模元件"
          className="h-8 w-full rounded-md border border-line-strong bg-surface pl-7 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <ul className="m-3 min-h-0 flex-1 overflow-y-auto rounded-md border border-line">
        {visibleComponents.map((component) => {
          const shown = !hiddenIds.has(component.id);
          return (
            <li key={component.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onToggleVisible(component.id)}
                aria-pressed={shown}
                aria-label={
                  shown
                    ? `Hide ${component.name} in the graph`
                    : `Show ${component.name} in the graph`
                }
                title={
                  shown
                    ? `Hide ${component.name} in the graph / 在熱網路中隱藏`
                    : `Show ${component.name} in the graph / 在熱網路中顯示`
                }
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-muted ${
                  shown ? '' : 'opacity-50'
                }`}
              >
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full border transition-colors ${
                    shown
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-line-strong bg-transparent'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink-900">
                    {component.name}
                  </span>
                  <span className="block truncate text-[10px] text-ink-400">
                    {component.category} · ×{component.qty} · {powerWOf(component).toFixed(2)} W
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {visibleComponents.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-ink-400">
            No modeled components match / 沒有符合的已建模元件
          </li>
        )}
      </ul>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-muted px-3 py-2">
        <span className="text-[10px] text-ink-500">
          {hiddenIds.size} hidden / 已隱藏 {hiddenIds.size} 個
        </span>
        <button
          type="button"
          onClick={onShowAll}
          disabled={hiddenIds.size === 0}
          className="rounded border border-line-strong bg-surface px-2 py-1 text-[10px] font-semibold text-ink-700 hover:border-ink-400 disabled:cursor-default disabled:opacity-40"
        >
          Show all / 全部顯示
        </button>
      </footer>
    </section>
  );
}
