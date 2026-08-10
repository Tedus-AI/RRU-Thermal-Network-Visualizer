/**
 * Step 2 — Architecture Templates (05 §8–§12).
 *
 * A template is data (`templateRegistry`), never a hard-coded React path. The
 * preview shows the prototype chain, the inputs the template needs, the inputs
 * the selected component is missing, and the PORTS the subgraph will expose —
 * a template never names a Main Base (05 §10, §61).
 *
 * Layout note: one column, not two. The panel is ~300 px wide, and the mockup's
 * side-by-side list and preview clip badly at that width.
 */

import { AlertTriangle, ArrowDown, Check, PlugZap } from 'lucide-react';

import { Badge, Button, Select } from '@/ui/primitives';
import { Bi, BilingualTooltip, biTitle } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import type { Component } from '@/domain/component';
import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';
import type { ThermalTemplate } from '@/thermal/templates/types';
import { missingRequirements } from '@/thermal/graph/networkBuilder';
import type { QtyModel } from '@/thermal/graph/networkBuilder';
import { QTY_MODELS, type BuilderPref } from './ComponentPalette';

/** The prototype chain, drawn as a compact vertical path ending at its ports. */
function MiniSubgraph({ template }: { template: ThermalTemplate }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {template.nodes.map((proto) => {
        const outgoing = template.edges.find((edge) => edge.fromRole === proto.role);
        return (
          <span key={proto.role} className="flex items-center gap-1">
            <span
              title={biTitle(proto.label, proto.labelZh)}
              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                proto.heatSource
                  ? 'border-danger-500/60 bg-danger-100 text-danger-600'
                  : 'border-warn-500/50 bg-warn-100 text-warn-600'
              }`}
            >
              {proto.label}
            </span>
            {outgoing && (
              <ArrowDown
                size={10}
                aria-hidden
                className="-rotate-90 text-ink-400"
              />
            )}
          </span>
        );
      })}

      {template.ports.map((port) => (
        <span
          key={port.kind}
          title={biTitle('Thermal port', TOOLTIPS_ZH.thermalPort)}
          className="inline-flex items-center gap-1 rounded border border-dashed border-accent-500 bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-accent-700"
        >
          <PlugZap size={10} />
          {port.kind}
          {port.required && <span className="text-danger-600">*</span>}
        </span>
      ))}
    </div>
  );
}

export function TemplatePalette({
  component,
  pref,
  hasSubgraph,
  readOnly,
  onPrefChange,
  onApply,
}: {
  /** The component the preview is evaluated against, if one is selected. */
  component: Component | null;
  pref: BuilderPref | null;
  hasSubgraph: boolean;
  readOnly: boolean;
  onPrefChange: (next: BuilderPref) => void;
  onApply: () => void;
}) {
  const template =
    TEMPLATE_LIST.find((entry) => entry.id === pref?.templateId) ?? TEMPLATE_LIST[0];
  const missing = component ? missingRequirements(component, template) : [];

  return (
    <div className="flex flex-col gap-2.5">
      {component ? (
        <div className="flex items-center gap-2 rounded-md bg-surface-muted px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink-900">
            {component.name}
          </span>
          <span className="shrink-0 text-[10px] text-ink-400" title="Quantity / 數量">
            ×{component.qty}
          </span>
        </div>
      ) : (
        <p className="rounded-md bg-surface-muted px-2.5 py-1.5 text-[11px] text-ink-400">
          <Bi en="Select a component first." zh="請先於上方選擇元件。" inline />
        </p>
      )}

      <div>
        <label
          htmlFor="qty-model"
          title={biTitle('Qty Representation', TOOLTIPS_ZH.qtyRepresentation)}
          className="mb-1 block text-[11px] font-semibold text-ink-700"
        >
          Qty Representation <span className="font-normal text-ink-400">/ 數量表示</span>
        </label>
        <Select
          id="qty-model"
          className="h-8 w-full !text-[12px]"
          value={pref?.qtyModel ?? 'AGGREGATE'}
          disabled={readOnly || !pref}
          items={QTY_MODELS.map((model) => ({
            value: model.value,
            label: `${model.label} / ${model.zh}`,
          }))}
          onChange={(event) =>
            pref && onPrefChange({ ...pref, qtyModel: event.target.value as QtyModel })
          }
        />
      </div>

      <div>
        <p
          title={biTitle('Architecture Template', TOOLTIPS_ZH.architectureTemplate)}
          className="mb-1 text-[11px] font-semibold text-ink-700"
        >
          Architecture <span className="font-normal text-ink-400">/ 架構模板</span>
        </p>
        <ul className="grid grid-cols-2 gap-1">
          {TEMPLATE_LIST.map((entry) => {
            const active = entry.id === template.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={readOnly || !pref}
                  title={biTitle(entry.name, entry.nameZh)}
                  onClick={() => pref && onPrefChange({ ...pref, templateId: entry.id })}
                  className={`flex h-full w-full items-start gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-accent-500 bg-accent-100 font-bold text-accent-700'
                      : 'border-line bg-surface text-ink-700 hover:bg-surface-muted'
                  }`}
                >
                  {active ? (
                    <Check size={11} className="mt-px shrink-0" />
                  ) : (
                    <span className="mt-px size-[11px] shrink-0" />
                  )}
                  {entry.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-md border border-line bg-surface-muted p-2.5">
        <p className="mb-1.5 text-[10px] font-bold text-ink-700">
          Preview <span className="font-normal text-ink-400">/ 預覽</span>
        </p>
        <MiniSubgraph template={template} />

        <p className="mt-2 text-[10px] leading-relaxed text-ink-500">{template.descriptionZh}</p>

        <p className="mt-2 text-[10px] font-bold text-ink-700">
          Required inputs <span className="font-normal text-ink-400">/ 必要輸入</span> (
          {template.requiredComponentFields.length})
        </p>
        {template.requiredComponentFields.length === 0 ? (
          <p className="text-[10px] text-ink-400">
            <Bi
              en="None — parameters are entered per edge."
              zh="無，參數改由各連線輸入。"
              inline
            />
          </p>
        ) : (
          <ul className="mt-0.5 flex flex-wrap gap-1">
            {template.requiredComponentFields.map((field) => {
              const isMissing = missing.some((entry) => entry.path === field.path);
              return (
                <li key={field.path}>
                  <span
                    title={biTitle(field.label, field.labelZh)}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap ${
                      isMissing
                        ? 'bg-warn-100 font-semibold text-warn-600'
                        : 'bg-surface text-ink-500'
                    }`}
                  >
                    {isMissing && <AlertTriangle size={9} />}
                    {field.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {component && missing.length > 0 && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-warn-600">
            {missing.length} input{missing.length > 1 ? 's' : ''} missing. The affected edges are
            created UNRESOLVED, never zero.
            <span className="block text-ink-400">缺少輸入的邊會以「未解析」建立，不會被填 0。</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={readOnly || !component}
          title={biTitle('Apply Template', '套用模板')}
          onClick={onApply}
          className="h-8 flex-1"
        >
          Apply Template
        </Button>
        {hasSubgraph && (
          <BilingualTooltip zh="此元件已有子圖，重新套用時會先詢問如何處理。">
            <Badge tone="warn">Existing</Badge>
          </BilingualTooltip>
        )}
      </div>
    </div>
  );
}
