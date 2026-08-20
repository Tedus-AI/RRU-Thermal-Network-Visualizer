/** Add Component and Bulk Edit dialogs — 04 §24, §25. */

import { useState } from 'react';
import { Button, Field, Modal, NumberInput, Select, TextInput } from '@/ui/primitives';
import {
  ARCHITECTURE_TEMPLATES,
  ARCHITECTURE_TEMPLATE_LABELS,
  BASE_ZONES,
  HEAT_PATH_TYPES,
  COMPONENT_CATEGORIES,
  LIMIT_TYPES,
  TIM_TYPES,
  type ArchitectureTemplate,
  type BaseZone,
  type HeatPathType,
  type Component,
  type ComponentCategory,
  type LimitType,
  type TimType,
} from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';

export interface NewComponentDraft {
  name: string;
  category: ComponentCategory;
  qty: number;
  power_W: number;
  limit_type: LimitType;
  limit_C: number | null;
}

/** 04 §25 — the minimum a hand-added component must state. */
export function AddComponentModal({
  onClose,
  onAdd,
  existingNames,
}: {
  onClose: () => void;
  onAdd: (draft: NewComponentDraft) => void;
  existingNames: string[];
}) {
  const [draft, setDraft] = useState<NewComponentDraft>({
    name: '',
    category: 'RF',
    qty: 1,
    power_W: 0,
    limit_type: 'Tj',
    limit_C: null,
  });

  const nameTaken = existingNames.some(
    (name) => name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
  );
  const error = !draft.name.trim()
    ? 'Component name is required.'
    : nameTaken
      ? 'A component with this name already exists.'
      : draft.qty <= 0 || !Number.isInteger(draft.qty)
        ? 'Qty must be a whole number greater than 0.'
        : draft.power_W < 0
          ? 'Power cannot be negative.'
          : null;

  return (
    <Modal
      title="Add Component / 新增元件"
      description="Minimum fields required to create a component. Thermal detail is completed in the inspector."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel / 取消</Button>
          <Button variant="primary" disabled={Boolean(error)} onClick={() => onAdd(draft)}>
            Add / 新增
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field
          label="Component Name / 元件名稱"
          htmlFor="add-name"
          required
          error={error ?? undefined}
        >
          <TextInput
            id="add-name"
            value={draft.name}
            invalid={Boolean(error)}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category / 分類" htmlFor="add-category">
            <Select
              id="add-category"
              options={COMPONENT_CATEGORIES}
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as ComponentCategory })
              }
            />
          </Field>
          <Field label="Qty / 數量" htmlFor="add-qty" required>
            <NumberInput
              id="add-qty"
              value={draft.qty}
              min={1}
              onChange={(event) => setDraft({ ...draft, qty: Number(event.target.value) })}
            />
          </Field>
          <Field label="Power / 單顆功耗" htmlFor="add-power" suffix="W" required>
            <NumberInput
              id="add-power"
              step="0.01"
              className="pr-8"
              value={draft.power_W}
              onChange={(event) => setDraft({ ...draft, power_W: Number(event.target.value) })}
            />
          </Field>
          <Field label="Limit Type / 限制類型" htmlFor="add-limit-type">
            <Select
              id="add-limit-type"
              options={LIMIT_TYPES}
              value={draft.limit_type}
              onChange={(event) =>
                setDraft({ ...draft, limit_type: event.target.value as LimitType })
              }
            />
          </Field>
          <Field label="Thermal Limit / 溫度上限" htmlFor="add-limit" suffix="°C">
            <NumberInput
              id="add-limit"
              className="pr-10"
              value={draft.limit_C ?? ''}
              placeholder="—"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  limit_C: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export interface BulkEditValues {
  category?: ComponentCategory;
  limit_type?: LimitType;
  heat_path?: HeatPathType;
  tim_type?: TimType;
  template?: ArchitectureTemplate;
  base_zone?: BaseZone;
  enabled?: boolean;
}

const UNCHANGED = '__unchanged__';

/**
 * 04 §24. Component Name is deliberately absent — bulk-renaming distinct parts
 * to one string destroys their identity.
 */
export function BulkEditModal({
  count,
  onClose,
  onApply,
}: {
  count: number;
  onClose: () => void;
  onApply: (values: BulkEditValues) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const pick = (key: string) => values[key] ?? UNCHANGED;
  const setPick = (key: string, value: string) => setValues({ ...values, [key]: value });

  const build = (): BulkEditValues => {
    const out: BulkEditValues = {};
    if (pick('category') !== UNCHANGED) out.category = pick('category') as ComponentCategory;
    if (pick('limit_type') !== UNCHANGED) out.limit_type = pick('limit_type') as LimitType;
    if (pick('heat_path') !== UNCHANGED) out.heat_path = pick('heat_path') as HeatPathType;
    if (pick('tim_type') !== UNCHANGED) out.tim_type = pick('tim_type') as TimType;
    if (pick('template') !== UNCHANGED) out.template = pick('template') as ArchitectureTemplate;
    if (pick('base_zone') !== UNCHANGED) out.base_zone = pick('base_zone') as BaseZone;
    if (pick('enabled') !== UNCHANGED) out.enabled = pick('enabled') === 'true';
    return out;
  };

  const nothingSelected = Object.keys(build()).length === 0;

  const row = (
    key: string,
    label: string,
    zh: string,
    options: readonly string[],
    labelFor?: (value: string) => string,
  ) => (
    <Field label={`${label} / ${zh}`} htmlFor={`bulk-${key}`}>
      <select
        id={`bulk-${key}`}
        value={pick(key)}
        onChange={(event) => setPick(key, event.target.value)}
        className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px]"
      >
        <option value={UNCHANGED}>— Leave unchanged / 不變更 —</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labelFor ? labelFor(option) : option}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Modal
      title={`Bulk Edit / 批次編輯 — ${count} components`}
      description="Only the fields you change are written. Component Name cannot be bulk-edited."
      width="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel / 取消</Button>
          <Button variant="primary" disabled={nothingSelected} onClick={() => onApply(build())}>
            Apply to {count} / 套用
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        {row('category', 'Category', '分類', COMPONENT_CATEGORIES)}
        {row('limit_type', 'Limit Type', '限制類型', LIMIT_TYPES)}
        {row('heat_path', 'Heat Path', '散熱路徑', HEAT_PATH_TYPES)}
        {row('tim_type', 'TIM', '導熱介質', TIM_TYPES)}
        {row(
          'template',
          'Architecture Template',
          '架構模板',
          ARCHITECTURE_TEMPLATES,
          (value) => ARCHITECTURE_TEMPLATE_LABELS[value as ArchitectureTemplate],
        )}
        {row('base_zone', 'Base Zone', '基座區域', BASE_ZONES)}
        {row('enabled', 'Enabled', '啟用', ['true', 'false'], (value) =>
          value === 'true' ? 'Enabled / 啟用' : 'Disabled / 停用',
        )}
      </div>
    </Modal>
  );
}

/** Turns the bulk selections into a component patch. */
export function bulkPatchFor(values: BulkEditValues) {
  return (component: Component): Partial<Component> => {
    const spec = component.thermal_spec;
    const patch: Partial<Component> = {};

    if (values.category) patch.category = values.category;
    if (values.enabled != null) patch.enabled = values.enabled;

    if (values.limit_type || values.heat_path || values.tim_type) {
      patch.thermal_spec = {
        ...spec,
        limit_type: values.limit_type ?? spec.limit_type,
        // Choosing a type in bulk edit is a decision, so it counts as confirmed.
        limit_type_confirmed: values.limit_type ? true : spec.limit_type_confirmed,
        heat_path: values.heat_path
          ? { ...spec.heat_path, type: values.heat_path }
          : spec.heat_path,
        // Choosing a path in bulk edit is a decision, so it counts as confirmed.
        heat_path_confirmed: values.heat_path ? true : spec.heat_path_confirmed,
        tim: values.tim_type ? { ...spec.tim, type: values.tim_type } : spec.tim,
      };
    }

    if (values.template || values.base_zone) {
      patch.architecture_prep = {
        ...component.architecture_prep,
        template_preference: values.template ?? component.architecture_prep.template_preference,
        preferred_base_zone: values.base_zone ?? component.architecture_prep.preferred_base_zone,
      };
    }

    return patch;
  };
}

export function bulkFieldsFor(values: BulkEditValues): string[] {
  const fields: string[] = [];
  if (values.category) fields.push('category');
  if (values.enabled != null) fields.push('enabled');
  if (values.limit_type) fields.push('limit_type');
  if (values.heat_path) fields.push('heat_path.type');
  if (values.tim_type) fields.push('tim.type');
  if (values.template || values.base_zone) fields.push('architecture_prep');
  return fields;
}

/** Power for a hand-added component is Manual by definition. */
export function draftPower(draft: NewComponentDraft) {
  return sourced(draft.power_W, 'Manual');
}
