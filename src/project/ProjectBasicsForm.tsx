/**
 * Section A — 基本資料 (01 §6 Project Identity + §7 Product & Thermal Context).
 *
 * The two sections used to be separate cards. They are one now: both are short,
 * filled once, and read together.
 *
 * Of the product fields only Base Structure reaches anything downstream (the
 * HSK targets Screen 04 offers and the independent paths Screen 05 builds).
 * Product type, deployment, frequency range, enclosure type and the cooling
 * elements are recorded and shown, but no calculation, screen or report reads
 * them — the form says so rather than implying an effect they do not have.
 * 01 §45 / 00 §53 still hold: nothing here creates a thermal node or edge.
 */

import { Lock } from 'lucide-react';
import { ChipMultiSelect, Field, SectionCard, Select, TextArea, TextInput } from '@/ui/primitives';
import {
  COOLING_ARCHITECTURES,
  DEPLOYMENTS_BY_PRODUCT,
  ENCLOSURE_TYPES,
  FREQUENCY_RANGES,
  PRODUCT_TYPES,
  PROJECT_STAGES,
  defaultDeploymentFor,
  suggestProjectId,
} from '@/domain/project';
import type {
  CoolingArchitecture,
  Deployment,
  EnclosureType,
  FrequencyRange,
  ProductType,
  ProjectStage,
} from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';
import {
  PRESET_LABELS,
  STRUCTURE_PRESETS,
  presetZones,
  type StructurePreset,
} from '@/thermal/graph/sharedStructure';
import { useFormTouch, useSectionAlert, useVisibleError } from './formTouch';
import { AI_KEY, formatProjectAiValue } from '@/domain/projectAiLink';
import { ProjectAiLinkBar } from './ProjectAiLinkBar';
import { ProjectAiLockLine, ProjectAiOwned, ProjectAiUnlockedNote, useProjectAiLock } from './ProjectAiLocked';
import type { ProjectAiLinkState } from './useProjectAiLink';

/** The fields this section can fail validation on — see `useSectionAlert`. */
const IDENTITY_FIELDS = ['project_name', 'project_id'] as const;

const ENCLOSURE_ZH: Record<EnclosureType, string> = {
  'Double-sided Cooling': '雙面散熱',
  'Single-sided Cooling': '單面散熱',
};

const DEPLOYMENT_ZH: Record<Deployment, string> = {
  Indoor: '室內',
  Outdoor: '室外',
};

/** Die-casting and Embedded stay English: that is how the fin types are named on the floor. */
const COOLING_ZH: Record<CoolingArchitecture, string> = {
  'Natural Convection': '自然對流',
  'Forced Convection (Fan)': '風扇強制對流',
  'Die-casting Fin': 'Die-casting 鰭片',
  'Embedded Fin': 'Embedded 鰭片',
  'Heat Pipe': '熱管',
  'Vapor Chamber': '均熱板',
  'Liquid Cooling': '液冷',
};

/** The fin process is one of the cooling elements; the link owns exactly these two. */
const FIN_CHIPS: readonly CoolingArchitecture[] = ['Die-casting Fin', 'Embedded Fin'];

export function ProjectBasicsForm({
  errors,
  readOnly,
  ai,
  onOpenAiLink,
}: {
  errors: Record<string, string>;
  readOnly: boolean;
  ai: ProjectAiLinkState;
  onOpenAiLink: () => void;
}) {
  const draft = useProjectStore((s) => s.draft);
  const isNew = useProjectStore((s) => s.isNew);
  const patchProject = useProjectStore((s) => s.patchProject);
  const patchContext = useProjectStore((s) => s.patchContext);
  const touch = useFormTouch((s) => s.touch);
  const visibleError = useVisibleError(errors);
  const alert = useSectionAlert(errors, IDENTITY_FIELDS);
  const finLock = useProjectAiLock(AI_KEY.fin);

  if (!draft) return null;
  const context = draft.project_context;
  const allowedDeployments = DEPLOYMENTS_BY_PRODUCT[context.product_type];
  const zones = presetZones(context.base_structure);

  // 01 §6.2: after the first save the Project ID is the primary key and is no
  // longer editable through the ordinary form — renaming needs a clone workflow.
  const idLocked = readOnly || !isNew;

  const handleNameChange = (value: string) => {
    touch('project_name');
    if (isNew) touch('project_id');
    if (isNew) {
      const previousSuggestion = suggestProjectId(draft.project_name);
      // Keep auto-deriving the ID until the user types their own.
      if (!draft.project_id || draft.project_id === previousSuggestion) {
        patchProject({ project_name: value, project_id: suggestProjectId(value) });
        return;
      }
    }
    patchProject({ project_name: value });
  };

  return (
    <SectionCard
      title="基本資料"
      collapsible
      alert={alert}
      summary={
        <>
          {draft.project_name.trim() || '未命名'} · {draft.project_id.trim() || '無代號'} ·{' '}
          {context.project_stage} · {context.product_type} {DEPLOYMENT_ZH[context.deployment]}{' '}
          {context.frequency_range}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ProjectAiLinkBar ai={ai} readOnly={readOnly} isNew={isNew} onOpen={onOpenAiLink} />
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-3">
          <ProjectAiOwned aiKey={AI_KEY.name} readOnly={readOnly} label="Project Name" zh="專案名稱" id="project_name">
            <Field
              label="Project Name"
              zh="專案名稱"
              htmlFor="project_name"
              required
              error={visibleError('project_name')}
            >
              <TextInput
                id="project_name"
                value={draft.project_name}
                maxLength={80}
                disabled={readOnly}
                onBlur={() => touch('project_name')}
                invalid={Boolean(visibleError('project_name'))}
                placeholder="例：CBNG FR1 RRU EVT2"
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </Field>
          </ProjectAiOwned>

          <Field
            label="Project ID"
            zh="專案代號"
            htmlFor="project_id"
            required
            error={visibleError('project_id')}
            hintZh={idLocked ? undefined : '英數字、底線或連字號，3–64 字元；建立後不能改'}
          >
            <div
              className="relative"
              title={idLocked && !readOnly ? '建立後鎖定；要換代號請用「複製專案」' : undefined}
            >
              <TextInput
                id="project_id"
                value={draft.project_id}
                disabled={idLocked}
                invalid={Boolean(visibleError('project_id'))}
                placeholder="例：CBNG_FR1_RRU_EVT2"
                className={`font-mono ${idLocked ? 'pr-9' : ''}`}
                onBlur={() => touch('project_id')}
                onChange={(event) => {
                  touch('project_id');
                  patchProject({ project_id: event.target.value });
                }}
              />
              {idLocked && (
                <Lock
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-400"
                />
              )}
            </div>
          </Field>

          <Field label="Project Stage" zh="階段" htmlFor="project_stage">
            <Select
              id="project_stage"
              options={PROJECT_STAGES}
              value={context.project_stage}
              disabled={readOnly}
              onChange={(event) =>
                patchContext({ project_stage: event.target.value as ProjectStage })
              }
            />
          </Field>

          <Field label="Customer / Program" zh="客戶" htmlFor="customer">
            <TextInput
              id="customer"
              value={context.customer}
              disabled={readOnly}
              placeholder="建議填寫，報告會用到"
              onChange={(event) => patchContext({ customer: event.target.value })}
            />
          </Field>

          <Field label="Project Owner" zh="負責人" htmlFor="owner">
            <TextInput
              id="owner"
              value={context.owner}
              disabled={readOnly}
              placeholder="建議填寫，報告列為撰寫人"
              onChange={(event) => patchContext({ owner: event.target.value })}
            />
          </Field>

          <Field label="Description" zh="說明" htmlFor="description">
            {/* Same height as the inputs beside it; drag to grow. */}
            <TextArea
              id="description"
              rows={1}
              className="h-9"
              value={context.description}
              disabled={readOnly}
              placeholder="選填"
              onChange={(event) => patchContext({ description: event.target.value })}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <p className="text-[12px] text-ink-400">
            <span className="mr-2 font-semibold text-ink-700">產品</span>
            僅記錄，不影響計算（基座結構除外）
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-3 2xl:grid-cols-5">
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
              tip="AAU 只有室外型、Small Cell 只有室內型，RRU 兩者皆有。"
            >
              <Select
                id="deployment"
                items={allowedDeployments.map((entry) => ({
                  value: entry,
                  label: DEPLOYMENT_ZH[entry],
                }))}
                value={context.deployment}
                disabled={readOnly || allowedDeployments.length < 2}
                onChange={(event) => patchContext({ deployment: event.target.value as Deployment })}
              />
            </Field>

            <ProjectAiOwned aiKey={AI_KEY.band} readOnly={readOnly} label="Frequency Range" zh="頻段" id="frequency_range">
              <Field label="Frequency Range" zh="頻段" htmlFor="frequency_range">
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
            </ProjectAiOwned>

            <Field
              label="Enclosure Type"
              zh="機殼散熱"
              htmlFor="enclosure_type"
              tip="有幾面實際參與散熱。FR1 常見單面散熱：一面是腔體濾波器，只有另一面有散熱器。"
            >
              <Select
                id="enclosure_type"
                items={ENCLOSURE_TYPES.map((entry) => ({
                  value: entry,
                  label: ENCLOSURE_ZH[entry],
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
              tip="決定 03 元件可連接哪些散熱器底座，以及 04 建立幾條獨立散熱路徑。RF 與數位各用一個散熱器時選「雙獨立」，並在 04 分別設定兩組散熱表面。"
            >
              <Select
                id="base_structure"
                items={STRUCTURE_PRESETS.map((entry) => ({
                  value: entry,
                  label: PRESET_LABELS[entry].zh,
                }))}
                value={context.base_structure}
                disabled={readOnly}
                onChange={(event) =>
                  patchContext({ base_structure: event.target.value as StructurePreset })
                }
              />
              {/* Naming the zones is what makes the choice concrete: this is
                  exactly the list Screen 04 will offer per component. */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
                {`03 元件可連接：${zones.map((zone) => zone.zh).join('、')}`}
              </p>
            </Field>
          </div>

          <Field label="Cooling Architecture" zh="散熱方式（可複選）">
            <ChipMultiSelect
              label="散熱方式"
              options={COOLING_ARCHITECTURES}
              labels={COOLING_ZH}
              value={context.cooling_architecture}
              disabled={readOnly}
              locked={finLock?.locked ? FIN_CHIPS : []}
              lockedTitle={finLock?.title}
              onChange={(next) =>
                patchContext({ cooling_architecture: next as CoolingArchitecture[] })
              }
            />
            {finLock?.locked ? (
              <ProjectAiLockLine aiKey={AI_KEY.fin} lock={finLock} readOnly={readOnly} label="鰭片製程">
                鰭片製程取自 5G-RRU 的參數控制台（{formatProjectAiValue(AI_KEY.fin, finLock.linked)}）
              </ProjectAiLockLine>
            ) : (
              <div className="mt-1.5">
                <ProjectAiUnlockedNote aiKey={AI_KEY.fin} lock={finLock} readOnly={readOnly} />
              </div>
            )}
          </Field>
        </div>
      </div>
    </SectionCard>
  );
}
