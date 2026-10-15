/**
 * Component inspector, Thermal Spec tab: heat path, mount, power and the
 * interface stack.
 */

import { NumberInput, Select, TextInput } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import {
  HEAT_PATH_LABELS,
  HEAT_PATH_TYPES,
  HEAT_PATH_PATCH_FIELDS,
  LIMIT_TYPES,
  LIMIT_TYPE_LABELS,
  METAL_BASE_SOURCE_MODELS,
  METAL_BASE_SOURCE_MODEL_LABELS,
  MODULE_REFERENCE_LOCATIONS,
  MODULE_REFERENCE_LOCATION_LABELS,
  heatPathPatch,
  normalizeModuleReferenceLocation,
  type HeatPathType,
  type LimitType,
  type ModuleReferenceLocation,
  type PackageType,
  MOUNT_ATTACHMENTS,
  MOUNT_ATTACHMENT_LABELS,
  MOUNT_TYPES,
  MOUNT_TYPE_LABELS,
  MOUNT_TYPE_HINTS,
  SPREADING_DOMAIN_HINTS,
  SPREADING_DOMAIN_LABELS,
  SPREADING_DOMAIN_MODES,
  mountAttachmentIsFixed,
  mountHasOwnBody,
  mountHasVendorResistance,
  type MountAttachment,
  type MountType,
  type SpreadingDomainMode,
} from '@/domain/component';
import { withValue } from '@/domain/sourcedValue';
import {
  DIRECT_CONTACT_TIM_ID,
  BUILTIN_TIM_IDS,
  MEASURED_INTERFACE_TIM_ID,
} from '@/domain/materials';
import { tip } from '@/i18n/componentManagerCopy';
import { SourcedNumberField, VIA_OVERRIDES, numberOrNull } from './ComponentInspectorFields';
import type { InspectorTabProps } from './componentInspectorModel';

/** Heat path, mount, power and the interface stack: everything the
 * solve reads about how heat leaves this part. */
export function ThermalSpecTab({ component, readOnly, onPatch, derived }: InspectorTabProps) {
  const {
    bltCustom,
    heatPath,
    materials,
    metalBase,
    metalBaseModel,
    mount,
    mountBlock,
    mountFootprint,
    packageOptions,
    patchHeatPathParameters,
    patchMount,
    patchSpec,
    patchSpecPrefillingCavityFilter,
    patchSpreadingDomain,
    resolvedTim,
    spec,
    spreadingDomain,
    baseAreaMm2,
    surfaceReferenced,
  } = derived;
  const domainArea = spreadingDomain.area_mm2;
  return (
    <>
      {/* Heat path first: it selects the whole chain, so everything
          below is read in its light. */}
      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-[12px] font-semibold text-ink-700">
          Heat Path / 主要散熱路徑
        </legend>
        <div className="flex flex-col gap-2">
          <Select
            id="ins-heat-path"
            aria-label="Heat path type"
            items={HEAT_PATH_TYPES.map((type) => ({
              value: type,
              label: `${HEAT_PATH_LABELS[type].en} / ${HEAT_PATH_LABELS[type].zh}`,
            }))}
            value={heatPath}
            disabled={readOnly}
            onChange={(event) => {
              const nextType = event.target.value as HeatPathType;
              const next = heatPathPatch(component, nextType);
              const fields = [...HEAT_PATH_PATCH_FIELDS];
              if (nextType === 'DirectMetal' && next.thermal_spec.tim.tim_id == null) {
                const defaultInterface =
                  materials.tim.find((material) => material.id === BUILTIN_TIM_IDS.grease) ??
                  materials.tim[0];
                if (defaultInterface) {
                  next.thermal_spec.tim = {
                    ...next.thermal_spec.tim,
                    tim_id: defaultInterface.id,
                  };
                  fields.push('tim.tim_id');
                }
              }
              if (
                nextType !== 'DirectMetal' &&
                next.thermal_spec.tim.tim_id === MEASURED_INTERFACE_TIM_ID
              ) {
                // Whole-joint characterization belongs to the Metal Base
                // model. Do not carry an invisible direct-Rth mode into a
                // board, coin or package-surface template.
                next.thermal_spec.tim = {
                  ...next.thermal_spec.tim,
                  tim_id: null,
                  measured_rth_C_per_W: null,
                };
                fields.push('tim.tim_id');
              }
              onPatch(component.id, next, fields);
            }}
          />
          {!spec.heat_path_confirmed && (
            <p className="text-[11px] text-warn-600">
              Assumed from category — it selects the whole resistance chain, so confirm it.
              <span className="block">依類別推定，它決定整條熱阻鏈，請確認。</span>
            </p>
          )}

          {/* Offered on every heat path. Which face heat leaves through
              and whether there is a junction behind it are separate
              questions, and answering the second with "Rjc = 0" builds a
              zero-resistance edge the solver has to reject. */}
          <div className="rounded-md border border-line bg-surface-muted p-2.5">
            <FieldLabel
              label="Heat Source Reference"
              zh="熱源基準"
              tooltip="決定 Screen 05 是否建立 Junction 與 Rjc；這是物理模型，不由 Limit Type 推定。等溫本體（環形器、濾波器、模組）請選本體型，不要用 Rjc = 0 表達。"
            />
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup">
              {METAL_BASE_SOURCE_MODELS.map((model) => {
                const label = METAL_BASE_SOURCE_MODEL_LABELS[model];
                const active = metalBaseModel.source_model === model;
                return (
                  <label
                    key={model}
                    className={`cursor-pointer rounded-md border p-2 text-[11px] leading-relaxed ${
                      active
                        ? 'border-accent-500 bg-accent-100 text-accent-700'
                        : 'border-line bg-surface text-ink-600'
                    } ${readOnly ? 'cursor-default opacity-60' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <input
                        type="radio"
                        name={`metal-base-source-${component.id}`}
                        value={model}
                        checked={active}
                        disabled={readOnly}
                        onChange={() =>
                          patchSpecPrefillingCavityFilter(
                            {
                              heat_path: {
                                ...spec.heat_path,
                                parameters: {
                                  ...spec.heat_path.parameters,
                                  source_model: model,
                                },
                              },
                            },
                            ['heat_path.parameters.source_model'],
                          )
                        }
                      />
                      {label.en} / {label.zh}
                    </span>
                    <span className="mt-1 block text-[10px] text-ink-400">
                      {label.description}
                      <span className="block">{label.descriptionZh}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* The via array's k and process derate are the PROJECT's
              (01 §4): one stack-up serves the whole board, so they are
              inherited by default and were read-only until now.

              But a part sitting over a locally denser via field is a
              real arrangement the project constant cannot describe, so
              either may be overridden here. Same idiom as the TIM bond
              line — inherit or state it — and the same rule: switching
              to Custom seeds the field with the inherited number, so it
              never blanks a value the reader was looking at.

              Count and inner diameter are still absent: they are not in
              the formula at all. */}
          {heatPath === 'Board' && (
            <div className="grid grid-cols-2 gap-2.5">
              {VIA_OVERRIDES.map((field) => {
                const inherited = materials[field.key].value;
                const stated = spec.heat_path.parameters?.[field.key];
                const custom = typeof stated === 'number' && Number.isFinite(stated);
                return (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <FieldLabel
                      label={field.label}
                      zh={field.zh}
                      unit={field.unit}
                      htmlFor={`hp-${field.key}`}
                    />
                    <div
                      role="radiogroup"
                      aria-label={`${field.label} source`}
                      className="flex flex-wrap gap-3 text-[12px]"
                    >
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`${field.key}-mode-${component.id}`}
                          className="size-3.5 accent-[var(--color-accent-600)]"
                          checked={!custom}
                          disabled={readOnly}
                          onChange={() =>
                            patchHeatPathParameters({ [field.key]: null }, ['heat_path'])
                          }
                        />
                        Screen 01 / 專案設定
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`${field.key}-mode-${component.id}`}
                          className="size-3.5 accent-[var(--color-accent-600)]"
                          checked={custom}
                          disabled={readOnly}
                          onChange={() =>
                            patchHeatPathParameters({ [field.key]: inherited }, [
                              'heat_path',
                            ])
                          }
                        />
                        Custom / 自訂
                      </label>
                    </div>
                    <NumberInput
                      id={`hp-${field.key}`}
                      step={field.step}
                      value={custom ? stated : (inherited ?? '')}
                      placeholder="—"
                      disabled={readOnly || !custom}
                      readOnly={!custom}
                      onChange={(event) =>
                        patchHeatPathParameters(
                          {
                            [field.key]:
                              event.target.value === '' ? null : Number(event.target.value),
                          },
                          ['heat_path'],
                        )
                      }
                    />
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      {custom ? field.customNote : field.inheritNote}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </fieldset>

      {/*
        The mount sits between HEAT_OUT and the shared base, so it is a
        separate question from the heat path and asked separately. The
        same four options apply whichever path is selected — that is
        what keeps four paths x four mounts from becoming sixteen
        templates.
      */}
      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-[12px] font-semibold text-ink-700">
          Mount to Structure / 與結構的接合方式
        </legend>
        <div className="flex flex-col gap-2">
          <Select
            id="ins-mount-type"
            aria-label="Mount type"
            items={MOUNT_TYPES.map((type) => ({
              value: type,
              label: `${MOUNT_TYPE_LABELS[type].en} / ${MOUNT_TYPE_LABELS[type].zh}`,
              hint: `${MOUNT_TYPE_HINTS[type].en}\n${MOUNT_TYPE_HINTS[type].zh}`,
            }))}
            value={mount.type}
            disabled={readOnly}
            onChange={(event) =>
              patchMount({ type: event.target.value as MountType })
            }
          />
          <p className="text-[11px] leading-relaxed text-ink-400">
            {MOUNT_TYPE_HINTS[mount.type].en}
            <span className="mt-0.5 block">{MOUNT_TYPE_HINTS[mount.type].zh}</span>
          </p>

          {mount.type !== 'Direct' && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface-muted p-2.5">
              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  label={`${mountFootprint.label} L`}
                  zh={`${mountFootprint.zh}長`}
                  unit="mm"
                  htmlFor="ins-mount-l"
                  tooltip={mountFootprint.tooltip}
                />
                <NumberInput
                  id="ins-mount-l"
                  value={mount.contact_L_mm ?? ''}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchMount({ contact_L_mm: numberOrNull(event.target.value) })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  label={
                    mount.type === 'EmbeddedHeatPipe'
                      ? 'Pipe W (one pipe)'
                      : `${mountFootprint.label} W`
                  }
                  zh={
                    mount.type === 'EmbeddedHeatPipe'
                      ? '單根熱管寬'
                      : `${mountFootprint.zh}寬`
                  }
                  unit="mm"
                  htmlFor="ins-mount-w"
                  tooltip={mountFootprint.tooltip}
                />
                <NumberInput
                  id="ins-mount-w"
                  value={mount.contact_W_mm ?? ''}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchMount({ contact_W_mm: numberOrNull(event.target.value) })
                  }
                />
              </div>

              {/*
                A groove takes one pipe, so two pipes is two grooves side
                by side. Storing the total width instead meant doing that
                multiplication by hand and keeping the answer rather than
                the design — and nobody reading it later could tell 13 mm
                apart from "two 6.5s".
              */}
              {mount.type === 'EmbeddedHeatPipe' && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    label="Pipes under source"
                    zh="熱源下方熱管根數"
                    htmlFor="ins-mount-pipes"
                    tooltip="熱源正下方有幾根熱管。根數同時作用在兩邊：銅的面積 = 長 × 單根寬 × 根數，熱管支路 = 單根熱阻 ÷ 根數。留空視為 1 根。"
                  />
                  <NumberInput
                    id="ins-mount-pipes"
                    step="1"
                    min="1"
                    value={mount.heat_pipe_count ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchMount({ heat_pipe_count: numberOrNull(event.target.value) })
                    }
                  />
                </div>
              )}

              {mountBlock && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    label={mount.type === 'Pedestal' ? 'Boss height' : 'Plate thickness'}
                    zh={mount.type === 'Pedestal' ? '凸台高度' : '基座厚度'}
                    unit="mm"
                    htmlFor="ins-mount-h"
                    tooltip={
                      mount.type === 'Pedestal'
                        ? '凸台從底座長出來的高度，就是這段的導熱長度。'
                        : '局部基座的厚度，熱往下穿過它的距離。'
                    }
                  />
                  <NumberInput
                    id="ins-mount-h"
                    value={mount.height_mm ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchMount({ height_mm: numberOrNull(event.target.value) })
                    }
                  />
                </div>
              )}

              {mountHasVendorResistance(mount.type) && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    label={
                      mount.type === 'VaporChamber'
                        ? 'Vapour chamber Rth'
                        : mount.type === 'EmbeddedHeatPipe'
                          ? 'Heat pipe Rth (one pipe)'
                          : 'Heat pipe Rth'
                    }
                    zh={
                      mount.type === 'VaporChamber'
                        ? '均熱板熱阻'
                        : mount.type === 'EmbeddedHeatPipe'
                          ? '單根熱管熱阻'
                          : '熱管熱阻'
                    }
                    unit="°C/W"
                    htmlFor="ins-mount-hp"
                    tooltip={
                      mount.type === 'VaporChamber'
                        ? '均熱板熱阻是原廠在特定功率與熱源尺寸下量測的數值，不是常數，也無法由幾何推導。未填則該段維持未解析。'
                        : mount.type === 'EmbeddedHeatPipe'
                          ? '熱管熱阻是原廠數值，無法由幾何推導，未填則該段維持未解析。這裡填「單根」的熱阻 —— 就是規格書上查到的那個數字。旁邊的根數會把它們並聯：熱管支路 = 單根熱阻 ÷ 根數。'
                          : '熱管熱阻是原廠數值，無法由幾何推導，未填則該段維持未解析。'
                    }
                  />
                  <NumberInput
                    id="ins-mount-hp"
                    value={mount.heat_pipe_R_C_per_W ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchMount({ heat_pipe_R_C_per_W: numberOrNull(event.target.value) })
                    }
                  />
                </div>
              )}

              {/*
                The vendor resistance only holds below the device's
                transport limit. The solve checks the heat it routes
                through the device against this; left blank, it says
                the limit was not checked rather than passing it.
              */}
              {mountHasVendorResistance(mount.type) && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    label={
                      mount.type === 'EmbeddedHeatPipe' ? 'Qmax (one pipe)' : 'Qmax'
                    }
                    zh={mount.type === 'EmbeddedHeatPipe' ? '單根最大傳熱量' : '最大傳熱量'}
                    unit="W"
                    htmlFor="ins-mount-qmax"
                    tooltip={
                      mount.type === 'EmbeddedHeatPipe'
                        ? '原廠在實際擺放方向與工作溫度下的最大傳熱量（毛細／乾涸極限），填「單根」的數值，會乘上根數。求解後會檢查流經熱管的熱量是否超過；超過時熱管乾涸、熱阻急遽上升，結果偏樂觀。'
                        : '原廠在實際擺放方向與工作溫度下的最大傳熱量（毛細／乾涸極限）。求解後會檢查流經此元件的熱量是否超過；超過時熱阻急遽上升，結果偏樂觀。'
                    }
                  />
                  <NumberInput
                    id="ins-mount-qmax"
                    value={mount.heat_pipe_qmax_W ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchMount({ heat_pipe_qmax_W: numberOrNull(event.target.value) })
                    }
                  />
                </div>
              )}

              {/*
                Machined or bolted. A vapour chamber is never milled out
                of the heat sink, so it is not asked — it is fixed.
              */}
              {!mountAttachmentIsFixed(mount.type) && (
                <div className="col-span-2 flex flex-col gap-1.5">
                  <FieldLabel
                    label="Attachment"
                    zh="結合方式"
                    htmlFor="ins-mount-attach"
                    tooltip="銑出＝與底座同一塊金屬，底下沒有接合面。後鎖＝獨立零件，有自己的材質與真實接合面。"
                  />
                  <Select
                    id="ins-mount-attach"
                    items={MOUNT_ATTACHMENTS.map((value) => ({
                      value,
                      label: `${MOUNT_ATTACHMENT_LABELS[value].en} / ${MOUNT_ATTACHMENT_LABELS[value].zh}`,
                      hint: `${MOUNT_ATTACHMENT_LABELS[value].description}\n${MOUNT_ATTACHMENT_LABELS[value].descriptionZh}`,
                    }))}
                    value={mount.attachment}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchMount({ attachment: event.target.value as MountAttachment })
                    }
                  />
                </div>
              )}

              {/* A bolted block can be another metal — a copper boss on
                  an aluminium base. Blank inherits the heat sink's. */}
              {mountBlock && mount.attachment === 'Bolted' && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    label="Block k"
                    zh="塊體導熱係數"
                    unit="W/m·K"
                    htmlFor="ins-mount-k"
                    tooltip="留空＝沿用 Screen 01 的底座材質。銅凸台請填 385 左右。"
                  />
                  <NumberInput
                    id="ins-mount-k"
                    value={mount.block_k_W_mK ?? ''}
                    placeholder={String(materials.hsk_base_k_W_mK.value ?? '')}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchMount({ block_k_W_mK: numberOrNull(event.target.value) })
                    }
                  />
                </div>
              )}

              {/* An embedded pipe has no body, so there is nothing
                  under it to join — the pipe is already in the base. */}
              {mountHasOwnBody(mount.type) && mount.attachment === 'Bolted' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel
                      label="Joint interface"
                      zh="接合面材料"
                      htmlFor="ins-mount-joint-tim"
                      tooltip="鎖上去的介面。選「乾接觸」則改用 Screen 01 的接觸導熱係數。"
                    />
                    <Select
                      id="ins-mount-joint-tim"
                      items={[
                        { value: '', label: 'Dry contact / 乾接觸' },
                        ...materials.tim.map((entry) => ({
                          value: entry.id,
                          label: `${entry.name}${
                            entry.k_W_mK.value != null
                              ? ` — k ${entry.k_W_mK.value} W/m·K`
                              : ''
                          }`,
                        })),
                      ]}
                      value={mount.joint_tim_id ?? ''}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchMount({ joint_tim_id: event.target.value || null })
                      }
                    />
                  </div>
                  {mount.joint_tim_id != null && (
                    <div className="flex flex-col gap-1.5">
                      <FieldLabel
                        label="Joint BLT"
                        zh="接合面壓合厚度"
                        unit="mm"
                        htmlFor="ins-mount-joint-blt"
                        tooltip="接合面壓合後的實際厚度。"
                      />
                      <NumberInput
                        id="ins-mount-joint-blt"
                        value={mount.joint_blt_mm ?? ''}
                        disabled={readOnly}
                        onChange={(event) =>
                          patchMount({ joint_blt_mm: numberOrNull(event.target.value) })
                        }
                      />
                    </div>
                  )}
                </>
              )}

              <p className="col-span-2 text-[10px] leading-relaxed text-ink-400">
                {mount.type === 'VaporChamber' ? (
                  <>
                    Its worth is the footprint it hands the base, not its own conductivity —
                    a chamber no bigger than the part only adds resistance. Anything left
                    empty leaves that step UNRESOLVED; Screen 05 still draws it. /
                    均熱板的價值在於交給底座的面積，不是它本身的導熱率 ——
                    若沒有比元件大就只是徒增熱阻。留空該段維持未解析，Screen 05 仍會畫出來。
                  </>
                ) : (
                  <>
                    A machined block is the heat sink&rsquo;s own metal, so its k comes from
                    Screen 01. Anything left empty leaves that step of the chain UNRESOLVED —
                    Screen 05 still draws it. / 銑出的塊體與散熱器同材，k 取自 Screen
                    01。留空該段維持未解析，Screen 05 仍會畫出來。
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </fieldset>

      {/*
        How much of the base the part spreads into. It sits after the mount
        because it is the same question one step further on: once the heat is
        in the base, how far does this part's own edge carry it.
      */}
      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-[12px] font-semibold text-ink-700">
          Spreading into the Base / 擴散範圍
        </legend>
        <div className="flex flex-col gap-2">
          <Select
            id="ins-spreading-domain"
            aria-label="Spreading domain"
            items={SPREADING_DOMAIN_MODES.map((mode) => ({
              value: mode,
              label: `${SPREADING_DOMAIN_LABELS[mode].en} / ${SPREADING_DOMAIN_LABELS[mode].zh}${
                mode === 'WholeBase' ? ' — default' : ''
              }`,
              hint: `${SPREADING_DOMAIN_HINTS[mode].en}\n${SPREADING_DOMAIN_HINTS[mode].zh}`,
            }))}
            value={spreadingDomain.mode}
            disabled={readOnly}
            onChange={(event) =>
              patchSpreadingDomain({ mode: event.target.value as SpreadingDomainMode })
            }
          />
          <p className="text-[11px] leading-relaxed text-ink-400">
            {SPREADING_DOMAIN_HINTS[spreadingDomain.mode].en}
            <span className="mt-0.5 block">{SPREADING_DOMAIN_HINTS[spreadingDomain.mode].zh}</span>
          </p>
          {spreadingDomain.mode === 'Manual' && (
            <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-muted p-2.5">
              <FieldLabel
                label="Area per device"
                zh="每顆擴散面積"
                unit="mm²"
                htmlFor="ins-spreading-area"
                tooltip="這顆元件在實際 layout 上可以獨佔的底座面積（每顆）。會限制在接觸面積與整片基座之間。"
              />
              <NumberInput
                id="ins-spreading-area"
                value={domainArea ?? ''}
                disabled={readOnly}
                onChange={(event) => patchSpreadingDomain({ area_mm2: numberOrNull(event.target.value) })}
              />
              {domainArea == null ? (
                <p className="text-[10px] leading-relaxed text-warn-600">
                  No area stated — this part spreads into the whole base until one is. /
                  尚未填面積——在填寫之前，這顆以整片基座計算。
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed text-ink-400">
                  {baseAreaMm2 != null
                    ? `${((100 * Math.min(domainArea, baseAreaMm2)) / baseAreaMm2).toFixed(1)} % of the ${Math.round(baseAreaMm2).toLocaleString('en-US')} mm² base${
                        domainArea > baseAreaMm2 ? ' — larger than the base, so the whole base is used' : ''
                      }. / 佔整片基座 ${Math.round(baseAreaMm2).toLocaleString('en-US')} mm² 的 ${((100 * Math.min(domainArea, baseAreaMm2)) / baseAreaMm2).toFixed(1)} %${
                        domainArea > baseAreaMm2 ? '，大於基座，以整片基座計算' : ''
                      }。`
                    : 'Screen 01 has no HSK base size yet, so the share cannot be shown. / Screen 01 尚未設定 HSK 基座尺寸，無法顯示比例。'}
                </p>
              )}
            </div>
          )}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel
            label="Limit Type"
            zh="限制類型"
            htmlFor="ins-limit-type"
            tooltip={tip('Limit Type')}
          />
          <Select
            id="ins-limit-type"
            items={LIMIT_TYPES.map((type) => ({
              value: type,
              label: `${type} — ${LIMIT_TYPE_LABELS[type].en} / ${LIMIT_TYPE_LABELS[type].zh}`,
            }))}
            value={spec.limit_type}
            disabled={readOnly}
            onChange={(event) =>
              patchSpec(
                // Picking it IS the confirmation.
                { limit_type: event.target.value as LimitType, limit_type_confirmed: true },
                ['limit_type'],
              )
            }
          />
          {!spec.limit_type_confirmed && (
            <p className="text-[11px] text-warn-600">
              Assumed — confirm against the datasheet.
              <span className="block">依類別推定，請對照規格書確認。</span>
            </p>
          )}
        </div>

        <SourcedNumberField
          id="ins-limit"
          label="Thermal Limit"
          zh="溫度上限"
          unit="°C"
          tooltip={tip('Limit')}
          value={spec.limit_C}
          readOnly={readOnly}
          onChange={(next) => patchSpec({ limit_C: next }, ['limit_C'])}
        />

        {surfaceReferenced && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <FieldLabel
              label="Reference Location"
              zh="原廠量測位置"
              htmlFor="ins-limit-reference"
              tooltip={tip('Reference Location')}
            />
            <Select
              id="ins-limit-reference"
              items={[
                { value: '', label: 'Select location / 請選擇位置' },
                ...MODULE_REFERENCE_LOCATIONS.map((location) => ({
                  value: location,
                  label: `${MODULE_REFERENCE_LOCATION_LABELS[location].en} / ${MODULE_REFERENCE_LOCATION_LABELS[location].zh}`,
                })),
              ]}
              value={normalizeModuleReferenceLocation(spec.limit_reference_note) ?? ''}
              disabled={readOnly}
              onChange={(event) =>
                patchSpec(
                  {
                    limit_reference_note: event.target.value as
                      | ModuleReferenceLocation
                      | '',
                  },
                  ['limit_reference_note'],
                )
              }
            />
            <p className="text-[11px] leading-relaxed text-ink-400">
              Choose the left, center or right reference point on the specified
              surface or body.
              <span className="block">
                選擇指定散熱面或本體上的左側、中央或右側量測位置。
              </span>
            </p>
          </div>
        )}

        {surfaceReferenced ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              label="Rjc"
              zh="接面-外殼熱阻"
              unit="°C/W"
              htmlFor="ins-rjc"
              tooltip={tip('Rjc')}
            />
            <TextInput id="ins-rjc" value="N/A — surface/body-reference model" disabled />
            <p className="text-[11px] leading-relaxed text-ink-400">
              No junction node or Rjc edge is created. / 不建立接面節點或 Rjc 熱阻邊。
            </p>
          </div>
        ) : (
          <SourcedNumberField
            id="ins-rjc"
            label="Rjc"
            zh="接面-外殼熱阻"
            unit="°C/W"
            tooltip={tip('Rjc')}
            value={spec.r_jc_C_per_W}
            placeholder="N/A"
            step="0.01"
            readOnly={readOnly}
            onChange={(next) => patchSpec({ r_jc_C_per_W: next }, ['r_jc_C_per_W'])}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            label="Package Type"
            zh="封裝型式"
            htmlFor="ins-package"
            tooltip={tip('Package')}
          />
          <Select
            id="ins-package"
            items={packageOptions}
            value={spec.package_type ?? 'Unknown'}
            disabled={readOnly}
            onChange={(event) =>
              patchSpecPrefillingCavityFilter(
                { package_type: event.target.value as PackageType },
                ['package_type'],
              )
            }
          />
        </div>
      </div>

      {/* --- Interface: material, dry contact or measured whole-joint Rth. --- */}
      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-[12px] font-semibold text-ink-700">
          {metalBase ? 'Interface / 接觸介面' : 'TIM / 熱介面材料'}
        </legend>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Material" zh="材料" htmlFor="ins-tim" tooltip={tip('TIM')} />
            <Select
              id="ins-tim"
              items={[
                { value: '', label: 'Not decided / 未指定' },
                // Not a material — a bolted joint with nothing in it,
                // which resolves through the project's contact
                // conductance rather than a k and a thickness.
                {
                  value: DIRECT_CONTACT_TIM_ID,
                  label: `Dry metal contact / 乾式金屬接觸 — h ${
                    materials.contact_conductance_W_m2K.value ?? '?'
                  } W/m²·K`,
                },
                ...(metalBase
                  ? [
                      {
                        value: MEASURED_INTERFACE_TIM_ID,
                        label: 'Measured interface Rth / 實測整體介面熱阻',
                      },
                    ]
                  : []),
                ...materials.tim.map((material) => ({
                  value: material.id,
                  label: `${material.name} — k ${material.k_W_mK.value ?? '?'} W/m·K`,
                })),
              ]}
              value={spec.tim.tim_id ?? ''}
              disabled={readOnly}
              onChange={(event) =>
                patchSpec({ tim: { ...spec.tim, tim_id: event.target.value || null } }, [
                  'tim.tim_id',
                ])
              }
            />
          </div>

          {/* A dangling reference is not the same as "no TIM", so it says so. */}
          {resolvedTim.missing && (
            <p className="text-[11px] leading-relaxed text-danger-600">
              This component points at a material the project no longer has. Pick another.
              <span className="block">
                此元件指向的材料已不存在於專案清單中，請重新選擇。
              </span>
            </p>
          )}

          {resolvedTim.directContact && (
            <p className="rounded-md border border-line bg-surface-muted p-2.5 text-[11px] leading-relaxed text-ink-500">
              Dry metal-to-metal joint, no TIM. The joint resistance is{' '}
              1 / (h · A) with h from Screen 01 — there is no bond line to state.
              <span className="block">
                乾式金屬接觸、無 TIM。介面熱阻為 1/(h·A)，h 取自 Screen 01，沒有壓合厚度。
              </span>
            </p>
          )}

          {resolvedTim.measuredInterface && (
            <div className="rounded-md border border-line bg-surface-muted p-2.5">
              <SourcedNumberField
                id="ins-interface-rth"
                label="Measured Interface Rth"
                zh="實測整體介面熱阻"
                unit="°C/W"
                step="0.001"
                value={spec.tim.measured_rth_C_per_W}
                readOnly={readOnly}
                onChange={(next) =>
                  patchSpec(
                    { tim: { ...spec.tim, measured_rth_C_per_W: next } },
                    ['tim.measured_rth_C_per_W'],
                  )
                }
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
                Characterized value for the complete installed joint; k and BLT are not used.
                <span className="block">代表完整安裝介面的量測值，不再使用 k 與 BLT 計算。</span>
              </p>
            </div>
          )}

          {!resolvedTim.directContact && !resolvedTim.measuredInterface && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel label="Bond Line (BLT)" zh="壓合厚度" unit="mm" htmlFor="ins-blt" />
            <div
              role="radiogroup"
              aria-label="Bond line source"
              className="flex flex-wrap gap-3 text-[12px]"
            >
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`blt-mode-${component.id}`}
                  className="size-3.5 accent-[var(--color-accent-600)]"
                  checked={!bltCustom}
                  disabled={readOnly || spec.tim.tim_id == null}
                  onChange={() => patchSpec({ tim: { ...spec.tim, blt_mm: null } }, ['tim'])}
                />
                Project default / 系統預設
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`blt-mode-${component.id}`}
                  className="size-3.5 accent-[var(--color-accent-600)]"
                  checked={bltCustom}
                  disabled={readOnly || spec.tim.tim_id == null}
                  onChange={() =>
                    patchSpec(
                      {
                        tim: {
                          ...spec.tim,
                          // Seeded with the inherited value so switching
                          // never blanks a field the user was reading.
                          blt_mm: withValue(
                            { value: null, source: 'Manual' },
                            resolvedTim.thickness_mm,
                          ),
                        },
                      },
                      ['tim'],
                    )
                  }
                />
                Custom / 自訂
              </label>
            </div>
            <NumberInput
              id="ins-blt"
              step="0.01"
              value={
                bltCustom ? (spec.tim.blt_mm?.value ?? '') : (resolvedTim.thickness_mm ?? '')
              }
              placeholder="—"
              disabled={readOnly || !bltCustom}
              readOnly={!bltCustom}
              onChange={(event) =>
                patchSpec(
                  {
                    tim: {
                      ...spec.tim,
                      blt_mm: withValue(
                        spec.tim.blt_mm ?? { value: null, source: 'Manual' },
                        event.target.value === '' ? null : Number(event.target.value),
                      ),
                    },
                  },
                  ['tim'],
                )
              }
            />
            <p className="text-[11px] leading-relaxed text-ink-400">
              {bltCustom
                ? 'A measured bond line for this build. k always comes from the material. / 此組裝的量測值；k 一律取自材料。'
                : `From ${resolvedTim.material?.name ?? 'the project material'} in Screen 01. / 取自 Screen 01 的材料設定。`}
            </p>
          </div>
          )}
          {metalBase && !resolvedTim.directContact && !resolvedTim.measuredInterface && (
            <p className="rounded-md border border-accent-500/20 bg-accent-100/40 p-2.5 text-[11px] leading-relaxed text-ink-500">
              Grease, PCM and thin pads are represented by the terminal TIM HEAT_OUT node in
              Screen 05. Use the installed compressed BLT, not the supplied sheet thickness.
              <span className="block">
                Grease、PCM 與薄型導熱片會在 Screen 05 以 TIM HEAT_OUT 端點表示；請填入實際壓合厚度。
              </span>
            </p>
          )}
        </div>
      </fieldset>
    </>
  );
}
