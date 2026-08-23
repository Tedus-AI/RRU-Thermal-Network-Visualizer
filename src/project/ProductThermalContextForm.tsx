/**
 * Section B — Product & Thermal Context (01 §7).
 *
 * These fields are an architecture SUMMARY only. 01 §45 and 00 §53 forbid this
 * screen from turning any of them into thermal nodes or edges — topology is
 * built in Screen 05 from architecture templates.
 *
 * Cooling Architecture is the single list describing the cooling solution.
 * A separate "Main Heat Rejection" field used to sit beside it, but the two
 * overlapped — a heat pipe and a fan were options in both — and the enclosure
 * type already records how many faces shed heat, so it was removed rather than
 * kept as a second place to say the same thing.
 */

import { ChipMultiSelect, Field, SectionCard, Select } from '@/ui/primitives';
import {
  COOLING_ARCHITECTURES,
  DEPLOYMENTS_BY_PRODUCT,
  ENCLOSURE_TYPES,
  FREQUENCY_RANGES,
  PRODUCT_TYPES,
  defaultDeploymentFor,
} from '@/domain/project';
import type {
  CoolingArchitecture,
  Deployment,
  EnclosureType,
  FrequencyRange,
  ProductType,
} from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';
import {
  PRESET_LABELS,
  STRUCTURE_PRESETS,
  presetZones,
  type StructurePreset,
} from '@/thermal/graph/sharedStructure';

/** zh-TW labels for the option sets whose English is not self-explanatory. */
const ENCLOSURE_ZH: Record<EnclosureType, string> = {
  'Double-sided Cooling': '雙面散熱',
  'Single-sided Cooling': '單面散熱',
};

const DEPLOYMENT_ZH: Record<Deployment, string> = {
  Indoor: '室內',
  Outdoor: '室外',
};

export function ProductThermalContextForm({ readOnly }: { readOnly: boolean }) {
  const draft = useProjectStore((s) => s.draft);
  const patchContext = useProjectStore((s) => s.patchContext);

  if (!draft) return null;
  const context = draft.project_context;
  const allowedDeployments = DEPLOYMENTS_BY_PRODUCT[context.product_type];
  const zones = presetZones(context.base_structure);

  return (
    <SectionCard
      step={2}
      title="Product & Thermal Context"
      subtitle="產品與熱設計背景"
      collapsible
      summary={
        <>
          {context.product_type} · {DEPLOYMENT_ZH[context.deployment]} · {context.frequency_range} ·{' '}
          {ENCLOSURE_ZH[context.enclosure_type]} ·{' '}
          {context.cooling_architecture.length === 0
            ? 'no cooling selected / 未選散熱方式'
            : context.cooling_architecture.join('、')}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-3">
        <Field label="Product Type" zh="產品類型" htmlFor="product_type">
          <Select
            id="product_type"
            options={PRODUCT_TYPES}
            value={context.product_type}
            disabled={readOnly}
            onChange={(event) => {
              const product = event.target.value as ProductType;
              // An AAU is outdoor and a small cell is indoor; changing the
              // product must not leave an installation that does not exist.
              const deployment = DEPLOYMENTS_BY_PRODUCT[product].includes(context.deployment)
                ? context.deployment
                : defaultDeploymentFor(product);
              patchContext({ product_type: product, deployment });
            }}
          />
        </Field>

        <Field
          label="Deployment"
          zh="安裝環境"
          htmlFor="deployment"
          tip="AAU 僅有室外型、Small Cell 僅有室內型，RRU 兩者皆有。室內外的環境假設差異極大，會直接影響 Screen 06 的邊界條件設定。"
        >
          <Select
            id="deployment"
            items={allowedDeployments.map((entry) => ({
              value: entry,
              label: `${entry} / ${DEPLOYMENT_ZH[entry]}`,
            }))}
            value={context.deployment}
            disabled={readOnly || allowedDeployments.length < 2}
            onChange={(event) => patchContext({ deployment: event.target.value as Deployment })}
          />
        </Field>

        <Field label="Frequency Range" zh="頻段範圍" htmlFor="frequency_range">
          <Select
            id="frequency_range"
            options={FREQUENCY_RANGES}
            value={context.frequency_range}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ frequency_range: event.target.value as FrequencyRange })
            }
          />
        </Field>

        <Field
          label="Enclosure Type"
          zh="機殼散熱型式"
          htmlFor="enclosure_type"
          tip="有多少面實際參與散熱。FR1 常見單面散熱：一面是整塊 cavity filter，只有另一面掛得上散熱器，可用散熱面積因此減半。"
        >
          <Select
            id="enclosure_type"
            items={ENCLOSURE_TYPES.map((entry) => ({
              value: entry,
              label: `${entry} / ${ENCLOSURE_ZH[entry]}`,
            }))}
            value={context.enclosure_type}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ enclosure_type: event.target.value as EnclosureType })
            }
          />
        </Field>

        <Field
          label="Base Structure"
          zh="基座結構"
          htmlFor="base_structure"
          tip="決定 Screen 04 的元件可連到哪些 HSK，以及 Screen 05 會建立幾條獨立散熱路徑。FR1 單面散熱通常選單一共用 HSK；FR2 若 RF 與 Digital 各自使用不同散熱器與鰭片面，選雙獨立 HSK，並在 Screen 06 分別設定兩個邊界。"
        >
          <Select
            id="base_structure"
            items={STRUCTURE_PRESETS.map((entry) => ({
              value: entry,
              label: `${PRESET_LABELS[entry].label} / ${PRESET_LABELS[entry].zh}`,
            }))}
            value={context.base_structure}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ base_structure: event.target.value as StructurePreset })
            }
          />
          {/* Naming the zones here is what makes the choice concrete: this is
              exactly the list Screen 04 will offer per component. */}
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
            {`HSK targets / 可連接散熱器：${zones.map((zone) => zone.zh).join('、')}`}
          </p>
        </Field>

        <div className="lg:col-span-3">
          <Field
            label="Cooling Architecture"
            zh="散熱方式"
            hint="Pick every element of the cooling solution."
            hintZh="請勾選此設計採用的所有散熱手段，可複選。"
            tip="專案層級的散熱方案摘要，例如壓鑄鰭片搭配自然對流與均熱板。實際熱路徑於 Screen 05 定義，本頁不建立任何 Node/Edge。"
          >
            <ChipMultiSelect
              label="Cooling Architecture"
              options={COOLING_ARCHITECTURES}
              value={context.cooling_architecture}
              disabled={readOnly}
              onChange={(next) =>
                patchContext({ cooling_architecture: next as CoolingArchitecture[] })
              }
            />
          </Field>
        </div>

      </div>
    </SectionCard>
  );
}
