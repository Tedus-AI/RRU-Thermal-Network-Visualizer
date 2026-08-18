/**
 * Section B — Product & Thermal Context (01 §7).
 *
 * These fields are an architecture SUMMARY only. 01 §45 and 00 §53 forbid this
 * screen from turning any of them into thermal nodes or edges — topology is
 * built in Screen 05 from architecture templates.
 *
 * Cooling Architecture and Main Heat Rejection are deliberately split along
 * mechanism vs surface: the first says how heat is moved and shed, the second
 * says where it leaves. Before that split they overlapped — a heat pipe and a
 * fan were options in both — so the same fact could be recorded twice, or in
 * neither.
 */

import { ChipMultiSelect, Field, SectionCard, Select } from '@/ui/primitives';
import {
  COOLING_ARCHITECTURES,
  DEPLOYMENTS_BY_PRODUCT,
  ENCLOSURE_TYPES,
  FREQUENCY_RANGES,
  MAIN_HEAT_REJECTIONS,
  PRODUCT_TYPES,
  defaultDeploymentFor,
} from '@/domain/project';
import type {
  CoolingArchitecture,
  Deployment,
  EnclosureType,
  FrequencyRange,
  MainHeatRejection,
  ProductType,
} from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';

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

  return (
    <SectionCard step={2} title="Product & Thermal Context" subtitle="產品與熱設計背景">
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

        <div className="lg:col-span-3">
          <Field
            label="Cooling Architecture"
            zh="散熱方式"
            hint="How heat is moved and shed — pick every mechanism in use."
            hintZh="熱如何被帶走與散出：請勾選所有實際採用的方式，可複選。"
            tip="專案層級的散熱手段摘要，例如自然對流搭配熱管與均熱板。實際熱路徑於 Screen 05 定義，本頁不建立任何 Node/Edge。"
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

        <div className="lg:col-span-3">
          <Field
            label="Main Heat Rejection"
            zh="主要散熱面"
            hint="Where heat finally leaves the product — the surfaces, not the mechanisms."
            hintZh="熱最終從哪些表面離開產品；這裡填「位置」，方式請填上方的散熱方式。"
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
