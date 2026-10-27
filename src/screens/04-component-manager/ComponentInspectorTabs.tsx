/**
 * Component inspector: the Overview, Architecture Prep (建模偏好), Source and
 * External Mapping tabs. Thermal Spec and Geometry have files of their own.
 * External Mapping is not offered while Screen 03 is deferred; the tab stays
 * here so the stored aliases have somewhere to be edited once it is.
 */

import { CircleCheck } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextArea, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import {
  COMPONENT_CATEGORIES,
  QTY_MODELS,
  QTY_MODEL_LABELS,
  componentTotalPowerW,
  type BaseZone,
  type Component,
  type ComponentCategory,
  type QtyModel,
} from '@/domain/component';
import type { DataSource } from '@/thermal/types';
import { dataSourceLabelZh } from '@/ui/dataSourceLabels';
import { tip } from '@/i18n/componentManagerCopy';
import { SourcedNumberField, sourceOptions } from './ComponentInspectorFields';
import { AiOwned } from './AiLocked';
import type { InspectorTabProps } from './componentInspectorModel';

interface SourceTabProps extends InspectorTabProps {
  librarySavedAt: number;
  onLibrarySaved: (at: number) => void;
  onSaveToLibrary: (component: Component) => void;
}

/** Name, category, reference designator, quantity and notes. */
export function OverviewTab({ component, readOnly, onPatch }: InspectorTabProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <FieldLabel label="Component Name" zh="元件名稱" htmlFor="ins-name" />
        <TextInput
          id="ins-name"
          value={component.name}
          disabled={readOnly}
          onChange={(event) => onPatch(component.id, { name: event.target.value }, ['name'])}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel label="Category" zh="分類" htmlFor="ins-category" />
          <Select
            id="ins-category"
            options={COMPONENT_CATEGORIES}
            value={component.category}
            disabled={readOnly}
            onChange={(event) =>
              onPatch(component.id, { category: event.target.value as ComponentCategory }, [
                'category',
              ])
            }
          />
        </div>
        <AiOwned
          component={component}
          field="qty"
          readOnly={readOnly}
          onPatch={onPatch}
          label="Qty"
          zh="數量"
          tooltip={tip('Qty')}
          id="ins-qty"
          text={component.qty}
        >
          <FieldLabel label="Qty" zh="數量" htmlFor="ins-qty" tooltip={tip('Qty')} />
          <NumberInput
            id="ins-qty"
            value={component.qty}
            disabled={readOnly}
            onChange={(event) =>
              onPatch(component.id, { qty: Number(event.target.value) }, ['qty'])
            }
          />
        </AiOwned>
        <AiOwned
          component={component}
          field="power"
          readOnly={readOnly}
          onPatch={onPatch}
          label="Power"
          zh="單顆功耗"
          unit="W"
          tooltip={tip('Power')}
          id="ins-power"
          text={component.power_W.value ?? '—'}
        >
          <SourcedNumberField
            id="ins-power"
            label="Power"
            zh="單顆功耗"
            unit="W"
            tooltip={tip('Power')}
            value={component.power_W}
            step="0.01"
            readOnly={readOnly}
            onChange={(next) =>
              onPatch(component.id, { power_W: next ?? component.power_W }, ['power_W'])
            }
          />
        </AiOwned>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-start-3">
          <AiOwned
            component={component}
            field="power_rt"
            readOnly={readOnly}
            onPatch={onPatch}
            label="Power RT"
            zh="常溫功耗"
            unit="W"
            tooltip={tip('Power RT')}
            id="ins-power-rt"
            text={component.power_rt_W?.value ?? '—'}
          >
            <SourcedNumberField
              id="ins-power-rt"
              label="Power RT"
              zh="常溫功耗"
              unit="W"
              tooltip={tip('Power RT')}
              value={component.power_rt_W ?? null}
              placeholder="同單顆功耗"
              step="0.01"
              readOnly={readOnly}
              onChange={(next) => {
                // Empty means "not stated" — the key goes, so a room-temperature
                // scenario falls back to the hot power instead of solving with 0.
                onPatch(
                  component.id,
                  { power_rt_W: next?.value == null ? undefined : next },
                  ['power_rt_W'],
                );
              }}
            />
          </AiOwned>
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
        <div className="flex items-baseline justify-between">
          <BilingualTooltip zh={tip('Total Power') ?? ''} align="left">
            <span className="text-[12px] text-ink-500">總功耗</span>
          </BilingualTooltip>
          <span className="tabular text-[14px] font-bold">
            {componentTotalPowerW(component).toFixed(2)} W
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel label="Notes" zh="備註" htmlFor="ins-notes" />
        <TextArea
          id="ins-notes"
          rows={3}
          value={component.notes ?? ''}
          disabled={readOnly}
          onChange={(event) =>
            onPatch(component.id, { notes: event.target.value }, ['notes'])
          }
        />
      </div>
    </>
  );
}

/** Base zone and the other placement hints Screen 05 starts from. */
export function ArchitectureTab({ component, readOnly, derived }: InspectorTabProps) {
  const { patchPrep, prep, zoneOptions } = derived;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <FieldLabel
          label="Preferred Base Zone"
          zh="偏好基座區域"
          htmlFor="ins-zone"
          tooltip={tip('Preferred Base Zone')}
        />
        <Select
          id="ins-zone"
          // The zones this project's base structure actually has (01 §2),
          // rather than a fixed list that fitted only one of the six.
          items={zoneOptions}
          value={prep.preferred_base_zone}
          disabled={readOnly}
          onChange={(event) =>
            patchPrep({ preferred_base_zone: event.target.value as BaseZone })
          }
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          label="Qty Modeling Preference"
          zh="數量建模偏好"
          htmlFor="ins-qtymodel"
          tooltip={tip('Qty Modeling')}
        />
        <Select
          id="ins-qtymodel"
          items={QTY_MODELS.map((model) => ({
            value: model,
            label: QTY_MODEL_LABELS[model],
          }))}
          value={prep.qty_model_preference}
          disabled={readOnly || component.qty <= 1}
          onChange={(event) =>
            patchPrep({ qty_model_preference: event.target.value as QtyModel })
          }
        />
        {component.qty <= 1 && (
          <p className="text-[11px] text-ink-400">
            數量大於 1 時才適用。
          </p>
        )}
      </div>

      {/* The template used to be a third question here. It is not one:
          the heat path already decides it, and asking twice let the two
          disagree. Screen 05 is where a template is genuinely chosen. */}
      <div className="rounded-md border border-line bg-surface-muted px-3 py-2 text-[12px]">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-500">架構模板</span>
          <span className="font-semibold text-ink-900">{prep.template_preference}</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-400">由散熱路徑決定，可在 05 覆寫。</p>
      </div>
    </>
  );
}

/** Where each number came from, and saving the thermal spec to the
 * component library. */
export function SourceTab({
  component,
  readOnly,
  onPatch,
  derived,
  librarySavedAt,
  onLibrarySaved: setLibrarySavedAt,
  onSaveToLibrary,
}: SourceTabProps) {
  const { patchSpec, spec, surfaceReferenced } = derived;
  return (
    <>
      <dl className="flex flex-col gap-1.5 text-[12px]">
        {(
          [
            ['資料來源', dataSourceLabelZh(component.provenance.source_type)],
            [
              '原始專案',
              component.provenance.source_project_name ??
                component.provenance.source_project_id,
            ],
            ['來源檔案', component.provenance.source_file],
            ['最後修改', component.provenance.last_modified_at?.slice(0, 19).replace('T', ' ')],
          ] as const
        )
          // A row of dashes is not information. Only what is known shows.
          .filter(([, value]) => value != null && value !== '')
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-ink-500">{label}</dt>
              <dd className="text-right font-medium text-ink-900">{value}</dd>
            </div>
          ))}
      </dl>

      {/* Provenance is edited here rather than beside every number, so
          one place answers "where did this come from" for all of them. */}
      <div className="border-t border-line pt-2.5">
        <h4 className="mb-1.5 text-[11px] font-bold text-ink-700">各欄位資料來源</h4>
        <div className="flex flex-col gap-2">
          {(
            [
              ['功耗', component.power_W, 'power_W'],
              ['溫度上限', spec.limit_C, 'limit_C'],
              ['Rjc', spec.r_jc_C_per_W, 'r_jc_C_per_W'],
            ] as const
          )
            .filter(([, , field]) => !(surfaceReferenced && field === 'r_jc_C_per_W'))
            .map(([label, sv, field]) => (
            <div key={field} className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-500">{label}</span>
              <Select
                aria-label={`${label}資料來源`}
                className="h-8 w-40 text-[12px]"
                // The stored value is always offered, even when the
                // app assigned it, so the picker never misreports what
                // a field currently claims.
                items={sourceOptions(sv?.source)}
                value={sv?.source ?? 'Manual'}
                disabled={readOnly}
                onChange={(event) => {
                  const next = {
                    value: sv?.value ?? null,
                    source: event.target.value as DataSource,
                    reference: sv?.reference,
                    confidence: sv?.confidence,
                    updated_at: new Date().toISOString(),
                  };
                  if (field === 'power_W') {
                    onPatch(component.id, { power_W: next }, ['power_W']);
                  } else {
                    patchSpec({ [field]: next }, [field]);
                  }
                }}
              />
            </div>
            ))}
        </div>
      </div>

      {component.metadata && Object.keys(component.metadata).length > 0 && (
        <div className="border-t border-line pt-2.5">
          <h4 className="mb-1.5 text-[11px] font-bold text-ink-700">保留的原始欄位</h4>
          <dl className="flex flex-col gap-1 text-[12px]">
            {Object.entries(component.metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt className="truncate text-ink-500">{key}</dt>
                <dd className="truncate text-right font-mono text-[11px] text-ink-700">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={readOnly}
          onClick={() => {
            onSaveToLibrary(component);
            setLibrarySavedAt(Date.now());
          }}
        >
          存入元件庫
        </Button>
        {librarySavedAt > 0 && (
          <span
            role="status"
            aria-live="polite"
            className="flex items-center gap-1 text-[12px] font-semibold text-ok-600"
          >
            <CircleCheck size={14} aria-hidden />
            已存入元件庫
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-ink-400">
        元件庫只存熱規格；基座區域與求解結果屬於專案，不會存入。
      </p>
    </>
  );
}

/** FloTHERM aliases, kept as plain text while Screen 03 is deferred. */
export function ExternalMappingTab({ component, readOnly, onPatch }: InspectorTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <BilingualTooltip zh={tip('External Mapping') ?? ''} align="left">
          <span className="text-[13px] font-semibold text-ink-900">FloTHERM</span>
        </BilingualTooltip>
        <Badge tone="neutral">
          {component.external_mappings.flotherm?.mapping_status === 'mapped'
            ? '已映射'
            : '未映射'}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel label="Object aliases" zh="物件別名" htmlFor="ins-flo-alias" />
        <TextArea
          id="ins-flo-alias"
          rows={2}
          className="font-mono text-[12px]"
          placeholder="RF_Board/PA1/Package"
          value={(component.external_mappings.flotherm?.object_aliases ?? []).join('\n')}
          disabled={readOnly}
          onChange={(event) =>
            onPatch(
              component.id,
              {
                external_mappings: {
                  ...component.external_mappings,
                  flotherm: {
                    ...component.external_mappings.flotherm,
                    object_aliases: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  },
                },
              },
              // Aliases are metadata: no solver or topology consequence.
              ['flotherm_alias'],
            )
          }
        />
      </div>

      {/*
        04 §33 — this panel deliberately has no upload, no column detection
        and no parser. Screen 03 is deferred until the real FloTHERM export
        schema is validated, and guessing it here would be worse than waiting.
      */}
      <p className="rounded-md border border-line bg-surface-muted p-2.5 text-[11px] leading-relaxed text-ink-500">
        03 FloTHERM 匯入尚未開放；別名只以純文字保存，不解析也不驗證。
      </p>
    </>
  );
}
