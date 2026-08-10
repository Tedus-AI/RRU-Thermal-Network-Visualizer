/**
 * Step 2 — Architecture Templates (05 §8–§12).
 *
 * A template is data (`templateRegistry`), never a hard-coded React path. The
 * preview shows the prototype chain, the inputs the template needs, the inputs
 * the selected component is missing, and the PORTS the subgraph will expose —
 * a template never names a Main Base (05 §10, §61).
 */

import { AlertTriangle, ArrowDown, Check, PlugZap } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import { BilingualTooltip } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import type { Component } from '@/domain/component';
import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';
import type { ThermalTemplate } from '@/thermal/templates/types';
import { missingRequirements } from '@/thermal/graph/networkBuilder';

function MiniSubgraph({ template }: { template: ThermalTemplate }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      {template.nodes.map((proto, index) => {
        const outgoing = template.edges.find((edge) => edge.fromRole === proto.role);
        return (
          <div key={proto.role} className="flex flex-col items-start gap-0.5">
            <span
              className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${
                proto.heatSource
                  ? 'border-danger-500/60 bg-danger-100 text-danger-600'
                  : 'border-warn-500/50 bg-warn-100 text-warn-600'
              }`}
            >
              {proto.label} / {proto.labelZh}
            </span>
            {outgoing && (
              <span className="flex items-center gap-1 pl-2 text-[9px] text-ink-400">
                <ArrowDown size={10} />
                {outgoing.label}
              </span>
            )}
            {index === template.nodes.length - 1 && null}
          </div>
        );
      })}

      {template.ports.map((port) => (
        <span
          key={port.kind}
          className="inline-flex items-center gap-1 rounded border border-dashed border-accent-500 bg-accent-100 px-2 py-0.5 text-[10px] font-bold text-accent-700"
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
  selectedTemplateId,
  component,
  hasSubgraph,
  readOnly,
  onSelectTemplate,
  onApply,
}: {
  selectedTemplateId: string;
  /** The component the preview is evaluated against, if one is selected. */
  component: Component | null;
  hasSubgraph: boolean;
  readOnly: boolean;
  onSelectTemplate: (templateId: string) => void;
  onApply: () => void;
}) {
  const template =
    TEMPLATE_LIST.find((entry) => entry.id === selectedTemplateId) ?? TEMPLATE_LIST[0];
  const missing = component ? missingRequirements(component, template) : [];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ul className="flex flex-col gap-1">
        {TEMPLATE_LIST.map((entry) => {
          const active = entry.id === template.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onSelectTemplate(entry.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  active
                    ? 'border-accent-500 bg-accent-100 font-semibold text-accent-700'
                    : 'border-line bg-surface text-ink-700 hover:bg-surface-muted'
                }`}
              >
                {active ? (
                  <Check size={13} className="shrink-0" />
                ) : (
                  <span className="size-[13px] shrink-0" />
                )}
                <span className="leading-tight">
                  <span className="block">{entry.name}</span>
                  <span className="block text-[10px] font-normal text-ink-400">{entry.nameZh}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-md border border-line bg-surface-muted p-2.5">
        <div className="flex items-start justify-between gap-2">
          <MiniSubgraph template={template} />
          <div className="min-w-0 text-[10px] text-ink-500">
            <p className="font-bold text-ink-700">Typical Use</p>
            {template.typicalUse.map((use) => (
              <p key={use}>• {use}</p>
            ))}
            <p className="mt-1.5 font-bold text-ink-700">Ports</p>
            <p>
              <BilingualTooltip zh={TOOLTIPS_ZH.thermalPort} align="left">
                <span>{template.ports.map((port) => port.kind).join(', ')}</span>
              </BilingualTooltip>
            </p>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-ink-500">{template.descriptionZh}</p>

        <div className="mt-2 border-t border-line pt-2">
          <p className="text-[10px] font-bold text-ink-700">
            Required inputs / 必要輸入 ({template.requiredComponentFields.length})
          </p>
          {template.requiredComponentFields.length === 0 ? (
            <p className="text-[10px] text-ink-400">None — parameters are entered per edge.</p>
          ) : (
            <ul className="mt-0.5 flex flex-wrap gap-1">
              {template.requiredComponentFields.map((field) => {
                const isMissing = missing.some((entry) => entry.path === field.path);
                return (
                  <li key={field.path}>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
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
              {missing.length} input{missing.length > 1 ? 's' : ''} missing on "{component.name}".
              The affected edges will be created UNRESOLVED, never zero. /
              缺少輸入的邊會以「未解析」建立，不會被填 0。
            </p>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <Button
            variant="primary"
            disabled={readOnly || !component}
            onClick={onApply}
            className="h-8 whitespace-nowrap"
          >
            Apply / 套用模板
          </Button>
          {hasSubgraph && <Badge tone="warn">Existing subgraph / 已有子圖</Badge>}
        </div>
        {!component && (
          <p className="mt-1.5 text-[10px] text-ink-400">
            Select a component first. / 請先選擇元件。
          </p>
        )}
      </div>
    </div>
  );
}
