/**
 * Step 1 — Components (05 §6, §7).
 *
 * Reads Screen 04's records: readiness, template preference, qty modelling
 * preference and preferred base zone. Nothing here creates topology; it decides
 * how each component will be REPRESENTED once a template is applied.
 *
 * Layout note: the shell leaves this column ~300 px, so the eight fields 05 §6
 * lists are a LIST, not a table. The two editable ones (template, qty model)
 * live in the Templates panel next to the preview they change.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Badge } from '@/ui/primitives';
import { Bi, BilingualTooltip } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import { ARCHITECTURE_TEMPLATE_LABELS, powerWOf, type Component } from '@/domain/component';
import { statusOf } from '@/domain/componentReadiness';
import type { QtyModel } from '@/thermal/graph/networkBuilder';

export interface BuilderPref {
  templateId: string;
  qtyModel: QtyModel;
  groupCount: number;
}

/** Screen 04's preference is the default; the engineer confirms it here. */
export function defaultPrefFor(component: Component): BuilderPref {
  const preference = component.architecture_prep.template_preference;
  const qty = component.architecture_prep.qty_model_preference;
  return {
    templateId: preference === 'UNASSIGNED' ? 'CUSTOM' : preference,
    qtyModel: qty === 'DECIDE_LATER' ? 'AGGREGATE' : (qty as QtyModel),
    groupCount: 2,
  };
}

export const QTY_MODELS: Array<{ value: QtyModel; label: string; zh: string }> = [
  { value: 'AGGREGATE', label: 'Aggregate', zh: '合併為一個熱源' },
  { value: 'INDIVIDUAL', label: 'Individual', zh: '每顆各自建模' },
  { value: 'GROUPED', label: 'Grouped', zh: '分組建模' },
];

function readinessTone(component: Component) {
  const status = statusOf(component);
  if (status === 'ERROR') return { tone: 'danger' as const, label: 'ERROR', zh: '錯誤' };
  if (status === 'WARNING') return { tone: 'warn' as const, label: 'WARN', zh: '警告' };
  return { tone: 'ok' as const, label: 'READY', zh: '就緒' };
}

export function ComponentPalette({
  components,
  prefs,
  modeledIds,
  selectedId,
  hiddenIds,
  onSelect,
  onToggleVisible,
  onShowAll,
}: {
  components: Component[];
  prefs: Record<string, BuilderPref>;
  /** Components that already have a subgraph in the network. */
  modeledIds: Set<string>;
  selectedId: string | null;
  /** Components switched off in the graph. A view filter, never the model. */
  hiddenIds: ReadonlySet<string>;
  onSelect: (componentId: string) => void;
  onToggleVisible: (componentId: string) => void;
  onShowAll: () => void;
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return components;
    return components.filter(
      (component) =>
        component.name.toLowerCase().includes(needle) ||
        component.category.toLowerCase().includes(needle),
    );
  }, [components, query]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative mb-2">
        <Search size={13} className="absolute top-2.5 left-2.5 text-ink-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search components…"
          title="Search components / 搜尋元件"
          aria-label="Search components / 搜尋元件"
          className="h-8 w-full rounded-md border border-line-strong bg-surface pl-7 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <ul className="max-h-64 min-h-0 flex-1 overflow-y-auto rounded-md border border-line">
        {visible.map((component) => {
          const pref = prefs[component.id] ?? defaultPrefFor(component);
          const readiness = readinessTone(component);
          const selected = component.id === selectedId;
          const templateLabel =
            ARCHITECTURE_TEMPLATE_LABELS[
              component.architecture_prep.template_preference
            ] ?? pref.templateId;

          const shown = !hiddenIds.has(component.id);

          return (
            <li
              key={component.id}
              className={`flex items-start border-b border-line last:border-b-0 ${
                selected ? 'bg-accent-100/70' : 'hover:bg-surface-muted'
              }`}
            >
              {/*
                The dot is a sibling of the row button, not a child: a button
                inside a button is invalid, and the browser would have made
                clicking the dot select the component as well.
              */}
              <button
                type="button"
                onClick={() => onToggleVisible(component.id)}
                aria-pressed={shown}
                title={
                  shown
                    ? `Hide ${component.name} in the graph / 在熱網路中隱藏`
                    : `Show ${component.name} in the graph / 在熱網路中顯示`
                }
                aria-label={
                  shown
                    ? `Hide ${component.name} in the graph`
                    : `Show ${component.name} in the graph`
                }
                className="mt-2.5 ml-2 flex size-4 shrink-0 items-center justify-center rounded-full"
              >
                <span
                  className={`size-2.5 rounded-full border transition-colors ${
                    shown
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-line-strong bg-transparent hover:border-ink-400'
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => onSelect(component.id)}
                aria-current={selected}
                className={`min-w-0 flex-1 px-2 py-2 text-left transition-colors ${
                  component.enabled ? '' : 'opacity-50'
                } ${shown ? '' : 'opacity-45'}`}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink-900">
                    {component.name}
                  </span>
                  {modeledIds.has(component.id) && (
                    <span
                      title="Modeled — a subgraph exists / 已建立子圖"
                      className="shrink-0 text-[9px] font-bold text-ok-600"
                    >
                      ● modeled
                    </span>
                  )}
                  <Badge tone={readiness.tone}>{readiness.label}</Badge>
                </span>

                <span
                  className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-500"
                  title={`Category / 類別 · Qty / 數量 × Power per device / 每顆功耗`}
                >
                  <span className="rounded bg-surface-muted px-1 font-semibold">
                    {component.category}
                  </span>
                  <span className="tabular">
                    ×{component.qty} · {powerWOf(component).toFixed(2)} W
                  </span>
                </span>

                <span className="mt-0.5 block truncate text-[10px] text-ink-400">
                  <span title="Architecture template preference / 架構模板偏好">
                    {templateLabel}
                  </span>
                  <span aria-hidden> · </span>
                  <span title="Qty representation / 數量表示方式">{pref.qtyModel}</span>
                  <span aria-hidden> · </span>
                  <span title="Preferred base zone / 建議基座區域">
                    {component.architecture_prep.preferred_base_zone}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-ink-400">
            <Bi en="No components match this search." zh="沒有符合的元件。" inline />
          </li>
        )}
      </ul>

      {hiddenIds.size > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-line bg-surface-muted px-2 py-1.5">
          <span className="text-[10px] leading-tight text-ink-500">
            <Bi
              en={`${hiddenIds.size} hidden in the graph — the model is unchanged.`}
              zh={`${hiddenIds.size} 個元件在圖上隱藏，模型未變動。`}
              inline
            />
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 hover:border-ink-400"
          >
            Show all / 全部顯示
          </button>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
        <BilingualTooltip zh={TOOLTIPS_ZH.totalPower} align="left">
          <span>Qty × Power aggregates a source node only.</span>
        </BilingualTooltip>{' '}
        It is never an edge heat flow.
      </p>
    </div>
  );
}
