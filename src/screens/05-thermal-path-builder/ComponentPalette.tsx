/**
 * Step 1 — Components (05 §6, §7).
 *
 * Reads Screen 04's records: readiness, template preference, qty modelling
 * preference and preferred base zone. Nothing here creates topology; it decides
 * how each component will be REPRESENTED once a template is applied.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Badge, Select } from '@/ui/primitives';
import { BilingualTooltip, ColumnLabel } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import { ARCHITECTURE_TEMPLATE_LABELS, powerWOf, type Component } from '@/domain/component';
import { statusOf } from '@/domain/componentReadiness';
import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';
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

const QTY_MODELS: Array<{ value: QtyModel; label: string }> = [
  { value: 'AGGREGATE', label: 'Aggregate' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'GROUPED', label: 'Grouped' },
];

function readinessTone(component: Component) {
  const status = statusOf(component);
  if (status === 'ERROR') return { tone: 'danger' as const, label: 'ERROR' };
  if (status === 'WARNING') return { tone: 'warn' as const, label: 'WARNING' };
  return { tone: 'ok' as const, label: 'READY' };
}

export function ComponentPalette({
  components,
  prefs,
  modeledIds,
  selectedId,
  readOnly,
  onSelect,
  onPrefChange,
}: {
  components: Component[];
  prefs: Record<string, BuilderPref>;
  /** Components that already have a subgraph in the network. */
  modeledIds: Set<string>;
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (componentId: string) => void;
  onPrefChange: (componentId: string, next: BuilderPref) => void;
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
          placeholder="Search components… / 搜尋元件"
          aria-label="Search components"
          className="h-8 w-full rounded-md border border-line-strong bg-surface pl-7 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div className="max-h-56 min-h-0 flex-1 overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-surface-muted">
            <tr className="text-left text-ink-500">
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Name" zh="名稱" />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Type" zh="類別" />
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">
                <ColumnLabel label="Qty" zh="數量" />
              </th>
              <th className="px-2 py-1.5 text-right font-semibold">
                <ColumnLabel
                  label="Power"
                  zh="每顆功耗"
                  unit="W"
                  tooltip="每一顆元件的功耗。Qty × Power 只用於 source node 聚合，不可視為任何 Edge 的 Heat Flow Q。"
                />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel
                  label="Qty Model"
                  zh="數量表示"
                  tooltip={TOOLTIPS_ZH.qtyRepresentation}
                />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel
                  label="Template"
                  zh="架構模板"
                  tooltip={TOOLTIPS_ZH.architectureTemplate}
                />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Zone" zh="建議區域" />
              </th>
              <th className="px-2 py-1.5 font-semibold">
                <ColumnLabel label="Status" zh="狀態" />
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((component) => {
              const pref = prefs[component.id] ?? defaultPrefFor(component);
              const readiness = readinessTone(component);
              const selected = component.id === selectedId;

              return (
                <tr
                  key={component.id}
                  onClick={() => onSelect(component.id)}
                  className={`cursor-pointer border-t border-line ${
                    selected ? 'bg-accent-100/60' : 'hover:bg-surface-muted'
                  } ${component.enabled ? '' : 'opacity-50'}`}
                >
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelect(component.id)}
                      className="text-left font-semibold text-ink-900"
                    >
                      {component.name}
                    </button>
                    {modeledIds.has(component.id) && (
                      <span className="ml-1.5 align-middle text-[9px] font-bold text-ok-600">
                        ● modeled
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-ink-500">{component.category}</td>
                  <td className="px-2 py-1.5 text-right tabular text-ink-700">{component.qty}</td>
                  <td className="px-2 py-1.5 text-right tabular text-ink-700">
                    {powerWOf(component).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
                    <Select
                      value={pref.qtyModel}
                      disabled={readOnly}
                      aria-label={`Qty model for ${component.name}`}
                      items={QTY_MODELS}
                      onChange={(event) =>
                        onPrefChange(component.id, {
                          ...pref,
                          qtyModel: event.target.value as QtyModel,
                        })
                      }
                      className="h-7 !text-[11px]"
                    />
                  </td>
                  <td className="px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
                    <Select
                      value={pref.templateId}
                      disabled={readOnly}
                      aria-label={`Template for ${component.name}`}
                      items={TEMPLATE_LIST.map((template) => ({
                        value: template.id,
                        label: template.name,
                      }))}
                      onChange={(event) =>
                        onPrefChange(component.id, { ...pref, templateId: event.target.value })
                      }
                      className="h-7 !text-[11px]"
                    />
                    {component.architecture_prep.template_preference !== 'UNASSIGNED' && (
                      <span className="mt-0.5 block text-[9px] text-ink-400">
                        04 preference:{' '}
                        {ARCHITECTURE_TEMPLATE_LABELS[
                          component.architecture_prep.template_preference
                        ]}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-ink-500">
                    {component.architecture_prep.preferred_base_zone}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge tone={readiness.tone}>{readiness.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-ink-400">
            No components match this search. / 沒有符合的元件。
          </p>
        )}
      </div>

      <p className="mt-2 text-[11px] text-ink-400">
        <BilingualTooltip zh={TOOLTIPS_ZH.totalPower} align="left">
          <span>Qty × Power aggregates a source node only.</span>
        </BilingualTooltip>{' '}
        It is never an edge heat flow.
      </p>
    </div>
  );
}
