/**
 * Section B — Product & Thermal Context (01 §7).
 *
 * These fields are an architecture SUMMARY only. 01 §45 and 00 §53 forbid this
 * screen from turning any of them into thermal nodes or edges — topology is
 * built in Screen 05 from architecture templates.
 */

import { ChipMultiSelect, Field, SectionCard, Select } from '@/ui/primitives';
import {
  BASE_ARCHITECTURES,
  COOLING_ARCHITECTURES,
  ENCLOSURE_TYPES,
  FREQUENCY_RANGES,
  MAIN_HEAT_REJECTIONS,
  PRODUCT_TYPES,
} from '@/domain/project';
import type {
  BaseArchitecture,
  CoolingArchitecture,
  EnclosureType,
  MainHeatRejection,
  ProductType,
} from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';

export function ProductThermalContextForm({ readOnly }: { readOnly: boolean }) {
  const draft = useProjectStore((s) => s.draft);
  const patchContext = useProjectStore((s) => s.patchContext);

  if (!draft) return null;
  const context = draft.project_context;

  return (
    <SectionCard step={2} title="Product & Thermal Context" subtitle="產品與熱設計背景">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-3">
        <Field label="Product Type" zh="產品類型" htmlFor="product_type">
          <Select
            id="product_type"
            options={PRODUCT_TYPES}
            value={context.product_type}
            disabled={readOnly}
            onChange={(event) => patchContext({ product_type: event.target.value as ProductType })}
          />
        </Field>

        <Field
          label="Frequency Range"
          zh="頻段範圍"
          htmlFor="frequency_range"
          hint="V1 targets FR1 only."
          hintZh="V1 僅支援 FR1。"
        >
          <Select
            id="frequency_range"
            options={FREQUENCY_RANGES}
            value={context.frequency_range}
            disabled
          />
        </Field>

        <Field
          label="Cooling Architecture"
          zh="散熱架構"
          htmlFor="cooling_architecture"
          tip="專案層級的散熱策略摘要。實際熱路徑於 Screen 05 熱路徑建立中定義，本頁不建立任何 Node/Edge。"
        >
          <Select
            id="cooling_architecture"
            options={COOLING_ARCHITECTURES}
            value={context.cooling_architecture}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ cooling_architecture: event.target.value as CoolingArchitecture })
            }
          />
        </Field>

        <Field label="Enclosure Type" zh="機殼型式" htmlFor="enclosure_type">
          <Select
            id="enclosure_type"
            options={ENCLOSURE_TYPES}
            value={context.enclosure_type}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ enclosure_type: event.target.value as EnclosureType })
            }
          />
        </Field>

        <Field
          label="Base Architecture"
          zh="基座架構"
          htmlFor="base_architecture"
          tip="機構基座的高階結構摘要，本身不會產生任何熱網路拓樸。"
        >
          <Select
            id="base_architecture"
            options={BASE_ARCHITECTURES}
            value={context.base_architecture}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ base_architecture: event.target.value as BaseArchitecture })
            }
          />
        </Field>

        <div className="lg:col-span-3">
          <Field
            label="Main Heat Rejection"
            zh="主要散熱路徑"
            hint="Select every path this product uses to reject heat."
            hintZh="請勾選此產品所有的散熱途徑。"
          >
            <ChipMultiSelect
              label="Main Heat Rejection"
              options={MAIN_HEAT_REJECTIONS}
              value={context.main_heat_rejection}
              disabled={readOnly}
              onChange={(next) =>
                patchContext({ main_heat_rejection: next as MainHeatRejection[] })
              }
            />
          </Field>
        </div>
      </div>
    </SectionCard>
  );
}
