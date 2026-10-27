/**
 * Component inspector, 散熱路徑 tab: everything the solve reads about how heat
 * leaves this part, laid out in the order the heat crosses it.
 *
 * It replaces the 熱規格 and 幾何 tabs. Splitting by "spec" and "geometry"
 * made one layer's numbers live on two tabs — the E-PAD size on one, the board
 * thickness and via k it conducts through on the other — so the form is now one
 * card per layer, top to bottom: source and limit, package, the face heat
 * leaves through, coin or board, TIM, the joint to the heat sink, the base.
 *
 * Every control keeps the DOM id `issueTargets.ts` names for it, and the
 * behaviour behind each one is unchanged; only where it sits moved. Each field
 * also says which drawn layer it sets (`data-layer`) and, where it is a length,
 * which dimension (`data-dim`), so the drawing beside the form can follow the
 * caret.
 */

import type { ReactNode } from 'react';

import { Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import {
  HEAT_PATH_PATCH_FIELDS,
  HEAT_PATH_TYPES,
  LIMIT_TYPES,
  LIMIT_TYPE_LABELS,
  METAL_BASE_CONTACT_GEOMETRIES,
  METAL_BASE_CONTACT_GEOMETRY_LABELS,
  METAL_BASE_SOURCE_MODELS,
  METAL_BASE_SOURCE_MODEL_LABELS,
  MODULE_REFERENCE_LOCATIONS,
  MODULE_REFERENCE_LOCATION_LABELS,
  MOUNT_ATTACHMENTS,
  MOUNT_ATTACHMENT_LABELS,
  MOUNT_TYPES,
  MOUNT_TYPE_HINTS,
  SOURCE_FACE_LABELS,
  SPREADING_DOMAIN_HINTS,
  SPREADING_DOMAIN_LABELS,
  SPREADING_DOMAIN_MODES,
  heatPathPatch,
  mountAttachmentIsFixed,
  mountHasOwnBody,
  mountHasVendorResistance,
  normalizeModuleReferenceLocation,
  powerWOf,
  type HeatPathType,
  type LimitType,
  type ModuleReferenceLocation,
  type MountAttachment,
  type MountType,
  type PackageType,
} from '@/domain/component';
import { withValue } from '@/domain/sourcedValue';
import {
  BUILTIN_TIM_IDS,
  DIRECT_CONTACT_TIM_ID,
  MEASURED_INTERFACE_TIM_ID,
} from '@/domain/materials';
import { aiValueOf, formatAiValue, isAiLocked } from '@/domain/aiThermalLink';
import { tip } from '@/i18n/componentManagerCopy';
import { AI_HEAT_PATH_UNSTATED, AiLockLine, AiOwned, AiUnlockedNote, aiNotStated, timNameOf } from './AiLocked';
import {
  DerivedField,
  GeometryField,
  SourcedNumberField,
  VIA_OVERRIDES,
  numberOrNull,
} from './ComponentInspectorFields';
import type { InspectorTabProps } from './componentInspectorModel';
import { confirmAction } from './issueTargets';
import { HEAT_PATH_SHORT, MOUNT_SHORT, StackIcon } from './HeatPathIcons';
import { PATH_FACE_LABEL, type DimKey } from './heatPathDrawing';
import {
  formatArea,
  formatMm,
  formatR,
  type HeatLayer,
  type HeatPathView,
  type PathCardId,
  type SegmentId,
} from './heatPathModel';

interface PathTabProps extends InspectorTabProps {
  view: HeatPathView;
  /** The card the drawing is pointing at, lit while nothing has the caret. */
  hotCard: PathCardId | null;
}

/** A field that tells the drawing which layer (and dimension) it sets. */
function Fld({
  layer,
  dim,
  className = '',
  children,
}: {
  layer: HeatLayer;
  dim?: DimKey;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-layer={layer} data-dim={dim}>
      {children}
    </div>
  );
}

/** A value this card does not own: read here, edited where it says. */
function ReadRow({ children, from }: { children: ReactNode; from?: string }) {
  return (
    <div className="tabular flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-md border border-dashed border-line-strong bg-surface-muted px-2.5 py-1.5 text-[12.5px] text-ink-700">
      {children}
      {from && <span className="ml-auto text-[11px] text-ink-400">{from}</span>}
    </div>
  );
}

function Segmented<T extends string>({
  id,
  label,
  items,
  value,
  disabled,
  full,
  onChange,
}: {
  id?: string;
  label: string;
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  disabled: boolean;
  full?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={`${full ? 'flex' : 'inline-flex'} max-w-full flex-wrap overflow-hidden rounded-md border border-line-strong bg-surface`}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          aria-checked={item.value === value}
          disabled={disabled}
          onClick={() => onChange(item.value)}
          className={`h-8 border-r border-line px-2.5 text-[12px] whitespace-nowrap last:border-r-0 disabled:cursor-default ${
            full ? 'flex-1' : ''
          } ${
            item.value === value
              ? 'bg-accent-600 font-semibold text-white'
              : 'text-ink-700 hover:bg-surface-muted disabled:hover:bg-transparent'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** What a card's header says about its layer: its resistance, or what it lacks. */
function cardR(view: HeatPathView, ids: SegmentId[]): { text: string; tone: 'ok' | 'miss' | 'later' } {
  const list = view.segments.filter((segment) => ids.includes(segment.id));
  if (list.length === 0) return { text: '', tone: 'later' };
  const missing = list.flatMap((segment) => segment.missing);
  if (missing.length > 0) return { text: `缺 ${missing[0]}`, tone: 'miss' };
  if (list.every((segment) => segment.later)) return { text: '05 計算', tone: 'later' };
  return {
    text: `${list
      .filter((segment) => segment.R != null)
      .map((segment) => `${list.length > 1 ? `${segment.name} ` : ''}${formatR(segment.R)}`)
      .join(' ＋ ')} °C/W`,
    tone: 'ok',
  };
}

function Card({
  id,
  colors,
  title,
  small,
  r,
  hot,
  children,
}: {
  id: PathCardId;
  colors: string[];
  title: string;
  small?: string;
  r: { text: string; tone: 'ok' | 'miss' | 'later' };
  hot: boolean;
  children: ReactNode;
}) {
  return (
    <article
      id={`hp-card-${id}`}
      data-card={id}
      className={`hp-card rounded-lg border border-line bg-surface ${hot ? 'is-hot' : ''}`}
      style={{ ['--c' as string]: colors[0] }}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        {colors.map((color) => (
          <span key={color} className="hp-chip" style={{ ['--c' as string]: color }} />
        ))}
        <h4 className="min-w-0 flex-1 text-[13px] font-bold text-ink-900">
          {title}
          {small && <small className="ml-1.5 text-[11px] font-medium text-ink-400">{small}</small>}
        </h4>
        <span
          className={`tabular text-[12px] whitespace-nowrap ${
            r.tone === 'miss' ? 'font-bold text-danger-600' : r.tone === 'later' ? 'text-ink-400' : 'text-ink-700'
          }`}
        >
          {r.text}
        </span>
      </header>
      <div className="flex flex-col gap-2.5 px-3 pb-3">{children}</div>
    </article>
  );
}

/** Heat path, mount, limit, geometry and interface — one layer per card. */
export function PathTab({ component, readOnly, onPatch, derived, view, hotCard }: PathTabProps) {
  const {
    SOURCE_ORIGIN,
    baseAreaMm2,
    bltCustom,
    envelopeLabels,
    exposedArea,
    heatPath,
    materials,
    metalBase,
    metalBaseModel,
    mount,
    mountBlock,
    mountFootprint,
    packageOptions,
    patchGeometry,
    patchHeatPathParameters,
    patchMount,
    patchSpec,
    patchSpecPrefillingCavityFilter,
    patchSpreadingDomain,
    resolvedTim,
    rule,
    sourceArea,
    sourceFace,
    spec,
    spreadArea,
    spreadFace,
    spreadOrigin,
    spreadingDomain,
    surfaceReferenced,
  } = derived;
  const domainArea = spreadingDomain.area_mm2;
  const hot = (id: PathCardId) => hotCard === id;
  // AI-Thermal's values (aiThermalLink.ts): shown as references with a ✂.
  const aiLocked = {
    heatPath: isAiLocked(component, 'heat_path'),
    rjc: isAiLocked(component, 'rjc'),
    pkg: isAiLocked(component, 'package'),
    face: isAiLocked(component, 'source_face'),
    boardT: isAiLocked(component, 'board_thickness'),
    via: isAiLocked(component, 'via'),
    tim: isAiLocked(component, 'tim'),
  };
  const timName = timNameOf(materials);
  const ai = { component, readOnly, onPatch };

  const selectHeatPath = (nextType: HeatPathType) => {
    if (nextType === heatPath) {
      // Pressing the tile already shown is how an inferred path is confirmed.
      if (!spec.heat_path_confirmed) {
        const confirm = confirmAction(component, 'heat_path');
        onPatch(component.id, confirm.patch, confirm.fields);
      }
      return;
    }
    const next = heatPathPatch(component, nextType);
    const fields = [...HEAT_PATH_PATCH_FIELDS];
    if (nextType === 'DirectMetal' && next.thermal_spec.tim.tim_id == null) {
      const defaultInterface =
        materials.tim.find((material) => material.id === BUILTIN_TIM_IDS.grease) ?? materials.tim[0];
      if (defaultInterface) {
        next.thermal_spec.tim = { ...next.thermal_spec.tim, tim_id: defaultInterface.id };
        fields.push('tim.tim_id');
      }
    }
    if (nextType !== 'DirectMetal' && next.thermal_spec.tim.tim_id === MEASURED_INTERFACE_TIM_ID) {
      // Whole-joint characterization belongs to the Metal Base model. Do not
      // carry an invisible direct-Rth mode into a board, coin or package-surface
      // template.
      next.thermal_spec.tim = { ...next.thermal_spec.tim, tim_id: null, measured_rth_C_per_W: null };
      fields.push('tim.tim_id');
    }
    onPatch(component.id, next, fields);
  };

  const geometry = spec.geometry;
  const required = (value: number | null | undefined) => !(typeof value === 'number' && value > 0);

  return (
    <>
      {geometry.needs_review && (
        <div className="rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5">
          <p className="text-[11px] leading-relaxed text-warn-600">
            匯入的舊版幾何資料需人工確認（厚度與 Pad 可能沿用舊工具的定義）。
          </p>
          {/* The fix is a decision, not a value, so it is one click here. */}
          <Button className="mt-2 h-7" disabled={readOnly} onClick={() => patchGeometry({ needs_review: false })}>
            標記為已確認
          </Button>
        </div>
      )}

      {/* Heat path first: it selects the whole chain, so every card below is
          read in its light. */}
      <section>
        <h3 className="mb-2 text-[12px] font-bold text-ink-700">主要散熱路徑</h3>
        <div role="radiogroup" aria-label="主要散熱路徑" className="grid grid-cols-4 gap-2">
          {HEAT_PATH_TYPES.map((type) => {
            const active = heatPath === type;
            return (
              <button
                key={type}
                id={active ? 'ins-heat-path' : undefined}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readOnly || aiLocked.heatPath}
                onClick={() => selectHeatPath(type)}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1.5 text-center disabled:cursor-default ${
                  active
                    ? 'border-2 border-accent-600 bg-accent-50 pt-[7px] pb-[6px]'
                    : `border border-line-strong bg-surface pt-2 pb-[7px] hover:border-ink-400 ${aiLocked.heatPath ? 'opacity-50' : ''}`
                }`}
              >
                <StackIcon kind={type} className="h-[38px] w-full max-w-16" />
                <span className="text-[12px] leading-tight font-bold text-ink-900">
                  {HEAT_PATH_SHORT[type].name}
                </span>
                <span className="text-[10.5px] leading-tight text-ink-500">{HEAT_PATH_SHORT[type].sub}</span>
              </button>
            );
          })}
        </div>
        {!spec.heat_path_confirmed && (
          <p className="mt-1.5 text-[11px] text-warn-600">
            依類別推定，它決定整條熱阻鏈；請確認（再點一次目前的路徑即確認）。
          </p>
        )}
        {aiLocked.heatPath ? (
          <AiLockLine {...ai} field="heat_path">
            取自 AI-Thermal 的主散熱路徑（{HEAT_PATH_SHORT[heatPath].name}）
          </AiLockLine>
        ) : aiNotStated(component, 'heat_path') ? (
          <p className="mt-1.5 text-[11px] text-ink-400">{AI_HEAT_PATH_UNSTATED}</p>
        ) : (
          <div className="mt-1.5">
            <AiUnlockedNote {...ai} field="heat_path" />
          </div>
        )}
      </section>

      <div className="hp-flow">
        <p className="-mb-0.5 text-[11px] text-ink-400">由上到下＝熱流方向</p>

        {/* ---- Source and limit ---- */}
        <Card
          id="src"
          colors={['var(--hp-die)']}
          title={view.junction ? '熱源與限溫' : '本體熱源與限溫'}
          r={
            view.junction
              ? cardR(view, ['rjc'])
              : { text: '本體即熱源', tone: 'later' }
          }
          hot={hot('src')}
        >
          {/* Which face heat leaves through and whether there is a junction
              behind it are separate questions, and answering the second with
              "Rjc = 0" builds a zero-resistance edge the solver has to reject. */}
          <Fld layer="die">
            <FieldLabel
              label="Heat Source Reference"
              zh="熱源基準"
              tooltip="決定 05 是否建立 Junction 與 Rjc；這是物理模型，不由 Limit Type 推定。等溫本體（環形器、濾波器、模組）請選本體型，不要用 Rjc = 0 表達。"
            />
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup">
              {METAL_BASE_SOURCE_MODELS.map((model) => {
                const label = METAL_BASE_SOURCE_MODEL_LABELS[model];
                const active = metalBaseModel.source_model === model;
                return (
                  <label
                    key={model}
                    className={`cursor-pointer rounded-md border p-2 text-[11px] leading-relaxed ${
                      active ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border-line bg-surface text-ink-600'
                    } ${readOnly ? 'cursor-default opacity-60' : aiLocked.rjc ? `cursor-default ${active ? '' : 'opacity-50'}` : ''}`}
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <input
                        type="radio"
                        name={`metal-base-source-${component.id}`}
                        value={model}
                        checked={active}
                        disabled={readOnly || aiLocked.rjc}
                        onChange={() =>
                          patchSpecPrefillingCavityFilter(
                            {
                              heat_path: {
                                ...spec.heat_path,
                                parameters: { ...spec.heat_path.parameters, source_model: model },
                              },
                            },
                            ['heat_path.parameters.source_model'],
                          )
                        }
                      />
                      {label.zh}
                    </span>
                    <span className="mt-1 block text-[10px] text-ink-400">{label.descriptionZh}</span>
                  </label>
                );
              })}
            </div>
            {aiLocked.rjc && (
              <p className="mt-1.5 text-[11px] text-ink-400">依 AI-Thermal 的 Rjc 決定；要改請解開下方的 Rjc。</p>
            )}
          </Fld>

          <div className="grid grid-cols-2 gap-3">
            <Fld layer="probe">
              <AiOwned
                {...ai}
                field="limit_type"
                label="Limit Type"
                zh="限制類型"
                tooltip={tip('Limit Type')}
                id="ins-limit-type"
                text={`${spec.limit_type} — ${LIMIT_TYPE_LABELS[spec.limit_type].zh}`}
              >
                <FieldLabel label="Limit Type" zh="限制類型" htmlFor="ins-limit-type" tooltip={tip('Limit Type')} />
                <Select
                  id="ins-limit-type"
                  items={LIMIT_TYPES.map((type) => ({ value: type, label: `${type} — ${LIMIT_TYPE_LABELS[type].zh}` }))}
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
                  <p className="text-[11px] text-warn-600">依類別推定，請對照規格書確認。</p>
                )}
              </AiOwned>
            </Fld>

            <Fld layer="probe">
              <AiOwned
                {...ai}
                field="limit"
                label="Thermal Limit"
                zh="溫度上限"
                unit="°C"
                tooltip={tip('Limit')}
                id="ins-limit"
                text={spec.limit_C?.value ?? '—'}
              >
                <SourcedNumberField
                  id="ins-limit"
                  label="Thermal Limit"
                  zh="溫度上限"
                  unit="°C"
                  tooltip={tip('Limit')}
                  value={spec.limit_C}
                  readOnly={readOnly}
                  required
                  onChange={(next) => patchSpec({ limit_C: next }, ['limit_C'])}
                />
              </AiOwned>
            </Fld>

            {surfaceReferenced && (
              <Fld layer="probe" className="col-span-2 flex flex-col gap-1.5">
                <FieldLabel
                  label="Reference Location"
                  zh="原廠量測位置"
                  htmlFor="ins-limit-reference"
                  tooltip={tip('Reference Location')}
                />
                <Select
                  id="ins-limit-reference"
                  items={[
                    { value: '', label: '請選擇位置' },
                    ...MODULE_REFERENCE_LOCATIONS.map((location) => ({
                      value: location,
                      label: MODULE_REFERENCE_LOCATION_LABELS[location].zh,
                    })),
                  ]}
                  value={normalizeModuleReferenceLocation(spec.limit_reference_note) ?? ''}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchSpec(
                      { limit_reference_note: event.target.value as ModuleReferenceLocation | '' },
                      ['limit_reference_note'],
                    )
                  }
                />
                <p className="text-[11px] leading-relaxed text-ink-400">
                  選擇指定散熱面或本體上的左側、中央或右側量測位置。
                </p>
              </Fld>
            )}

            {aiLocked.rjc ? (
              <Fld layer="die" dim={surfaceReferenced ? undefined : 'rjc'}>
                <AiOwned
                  {...ai}
                  field="rjc"
                  label="Rjc"
                  zh="接面-外殼熱阻"
                  tooltip={tip('Rjc')}
                  id="ins-rjc"
                >
                  {null}
                </AiOwned>
              </Fld>
            ) : surfaceReferenced ? (
              <Fld layer="die" className="flex flex-col gap-1.5">
                <FieldLabel label="Rjc" zh="接面-外殼熱阻" unit="°C/W" htmlFor="ins-rjc" tooltip={tip('Rjc')} />
                <TextInput id="ins-rjc" value="不適用（表面／本體型）" disabled />
                <p className="text-[11px] leading-relaxed text-ink-400">不建立接面節點或 Rjc 熱阻邊。</p>
                <AiUnlockedNote {...ai} field="rjc" />
              </Fld>
            ) : (
              <Fld layer="die" dim="rjc">
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
                  required
                  onChange={(next) => patchSpec({ r_jc_C_per_W: next }, ['r_jc_C_per_W'])}
                />
                <div className="mt-1.5">
                  <AiUnlockedNote {...ai} field="rjc" />
                </div>
              </Fld>
            )}
          </div>

          <ReadRow from="在「概要」修改">
            功耗 <b className="font-semibold text-ink-900">{powerWOf(component)} W</b> ×{' '}
            <b className="font-semibold text-ink-900">{component.qty}</b> 顆
          </ReadRow>
        </Card>

        {/* ---- Package / body ---- */}
        <Card
          id="pkg"
          colors={['var(--hp-pkg)']}
          title={metalBase ? '本體' : '封裝本體'}
          r={
            view.pkg.L != null && view.pkg.W != null
              ? {
                  text: `${formatMm(view.pkg.L)} × ${formatMm(view.pkg.W)}${view.pkg.H != null ? ` × ${formatMm(view.pkg.H)}` : ''} mm`,
                  tone: 'ok',
                }
              : { text: '缺 長寬', tone: 'miss' }
          }
          hot={hot('pkg')}
        >
          <Fld layer="pkg" className="flex flex-col gap-1.5">
            <FieldLabel label="Package Type" zh="封裝型式" htmlFor="ins-package" tooltip={tip('Package')} />
            <Select
              id="ins-package"
              items={packageOptions}
              value={spec.package_type ?? 'Unknown'}
              disabled={readOnly}
              onChange={(event) =>
                patchSpecPrefillingCavityFilter({ package_type: event.target.value as PackageType }, ['package_type'])
              }
            />
          </Fld>
          {/* The envelope is the one thing every path needs, and two of the
              four take their heat-leaving face straight from it. */}
          {aiLocked.pkg ? (
            <Fld layer="pkg" dim="pkgL">
              <AiOwned {...ai} field="package" label="Size" zh={metalBase ? '本體大小' : '封裝大小'} id="geo-package_L_mm">
                {null}
              </AiOwned>
            </Fld>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    ['package_L_mm', envelopeLabels.L, 'pkgL'],
                    ['package_W_mm', envelopeLabels.W, 'pkgW'],
                    ['package_H_mm', envelopeLabels.H, 'pkgH'],
                  ] as const
                ).map(([field, label, dim]) => (
                  <Fld key={field} layer="pkg" dim={dim}>
                    <GeometryField
                      label={label.en}
                      zh={label.zh}
                      unit="mm"
                      field={field}
                      geometry={geometry}
                      readOnly={readOnly}
                      required={field !== 'package_H_mm'}
                      onChange={patchGeometry}
                    />
                  </Fld>
                ))}
              </div>
              <AiUnlockedNote {...ai} field="package" />
            </>
          )}
          {spec.package_type === 'Cavity Filter' && surfaceReferenced && (
            <p className="rounded-md border border-accent-500/20 bg-accent-100/40 p-2.5 text-[11px] leading-relaxed text-ink-500">
              腔體濾波器幾乎橫跨整片散熱器，本體長寬留空時會以 01 的散熱器底座外框預填；兩欄仍可修改（濾波器通常比底座略小）。
            </p>
          )}
        </Card>

        {/* ---- The face heat leaves through ---- */}
        <Card
          id="face"
          colors={['var(--hp-face)']}
          title={PATH_FACE_LABEL[heatPath]}
          small={heatPath === 'Board' ? '熱從這裡離開元件' : undefined}
          r={
            sourceArea != null
              ? { text: `${formatArea(sourceArea)} mm²`, tone: 'ok' }
              : { text: '缺 面積', tone: 'miss' }
          }
          hot={hot('face')}
        >
          {!metalBase && (
            <div className="grid grid-cols-2 gap-2.5">
              {rule.source === 'package' ? (
                <>
                  <Fld layer="face">
                    <DerivedField
                      id="geo-source_L_mm"
                      label={`${SOURCE_FACE_LABELS[heatPath].en} L`}
                      zh={`${SOURCE_FACE_LABELS[heatPath].zh}長`}
                      unit="mm"
                      value={sourceFace.L}
                      from={SOURCE_ORIGIN[heatPath as keyof typeof SOURCE_ORIGIN]}
                    />
                  </Fld>
                  <Fld layer="face">
                    <DerivedField
                      id="geo-source_W_mm"
                      label={`${SOURCE_FACE_LABELS[heatPath].en} W`}
                      zh={`${SOURCE_FACE_LABELS[heatPath].zh}寬`}
                      unit="mm"
                      value={sourceFace.W}
                      from=""
                    />
                  </Fld>
                </>
              ) : (
                aiLocked.face ? (
                  <Fld layer="face" dim="eL" className="col-span-2">
                    <AiOwned
                      {...ai}
                      field="source_face"
                      label={SOURCE_FACE_LABELS[heatPath].en}
                      zh={SOURCE_FACE_LABELS[heatPath].zh}
                      id="geo-source_L_mm"
                    >
                      {null}
                    </AiOwned>
                  </Fld>
                ) : (
                  <>
                    <Fld layer="face" dim="eL">
                      <GeometryField
                        label={`${SOURCE_FACE_LABELS[heatPath].en} L`}
                        zh={`${SOURCE_FACE_LABELS[heatPath].zh}長`}
                        unit="mm"
                        field="source_L_mm"
                        geometry={geometry}
                        readOnly={readOnly}
                        required
                        onChange={patchGeometry}
                      />
                    </Fld>
                    <Fld layer="face" dim="eW">
                      <GeometryField
                        label={`${SOURCE_FACE_LABELS[heatPath].en} W`}
                        zh={`${SOURCE_FACE_LABELS[heatPath].zh}寬`}
                        unit="mm"
                        field="source_W_mm"
                        geometry={geometry}
                        readOnly={readOnly}
                        required
                        onChange={patchGeometry}
                      />
                    </Fld>
                  </>
                )
              )}
            </div>
          )}
          {!metalBase && rule.source !== 'package' && <AiUnlockedNote {...ai} field="source_face" />}

          {metalBase && (
            <>
              <Fld layer="face" className="flex flex-col gap-1.5">
                <FieldLabel label="Contact Model" zh="接觸面模型" htmlFor="geo-metal-contact-model" />
                <Select
                  id="geo-metal-contact-model"
                  items={METAL_BASE_CONTACT_GEOMETRIES.map((model) => ({
                    value: model,
                    label: METAL_BASE_CONTACT_GEOMETRY_LABELS[model].zh,
                  }))}
                  value={metalBaseModel.contact_geometry}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchHeatPathParameters({ contact_geometry: event.target.value }, [
                      'heat_path.parameters.contact_geometry',
                    ])
                  }
                />
              </Fld>
              {metalBaseModel.contact_geometry === 'PerimeterFrame' && (
                <Fld layer="face" dim="landW" className="flex flex-col gap-1.5">
                  <FieldLabel label="Perimeter Land Width" zh="外圍接觸邊寬" unit="mm" htmlFor="geo-perimeter-land-width" />
                  <NumberInput
                    id="geo-perimeter-land-width"
                    step="0.1"
                    value={metalBaseModel.perimeter_land_width_mm ?? ''}
                    placeholder={metalBaseModel.perimeter_land_width_mm == null ? '必填' : '—'}
                    invalid={required(metalBaseModel.perimeter_land_width_mm)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchHeatPathParameters({ perimeter_land_width_mm: numberOrNull(event.target.value) }, [
                        'heat_path.parameters.perimeter_land_width_mm',
                      ])
                    }
                  />
                  <p className="text-[11px] text-ink-400">有效面積＝完整底面－中央開口。</p>
                </Fld>
              )}
              {metalBaseModel.contact_geometry === 'CustomArea' && (
                <Fld layer="face" dim="custom" className="flex flex-col gap-1.5">
                  <FieldLabel label="Custom Effective Area" zh="自訂有效接觸面積" unit="mm²" htmlFor="geo-custom-contact-area" />
                  <NumberInput
                    id="geo-custom-contact-area"
                    step="1"
                    value={metalBaseModel.custom_contact_area_mm2 ?? ''}
                    placeholder={metalBaseModel.custom_contact_area_mm2 == null ? '必填' : '—'}
                    invalid={required(metalBaseModel.custom_contact_area_mm2)}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchHeatPathParameters({ custom_contact_area_mm2: numberOrNull(event.target.value) }, [
                        'heat_path.parameters.custom_contact_area_mm2',
                      ])
                    }
                  />
                  <p className="text-[11px] text-ink-400">只計入實際壓緊區域，扣除噴漆、缺口與未壓縮墊片。</p>
                </Fld>
              )}

              <Fld layer="exposed">
                <label className="flex items-start gap-2 text-[12px] text-ink-700">
                  <input
                    id="geo-exposed-surface-enabled"
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                    checked={metalBaseModel.exposed_surface_enabled}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchHeatPathParameters({ exposed_surface_enabled: event.target.checked }, [
                        'heat_path.parameters.exposed_surface_enabled',
                      ])
                    }
                  />
                  <span>
                    另有暴露表面對流／輻射散熱
                    <span className="block text-[11px] text-ink-400">在 05 建立表面出口，並在 05 的散熱表面設定對流與輻射</span>
                  </span>
                </label>
              </Fld>
              {metalBaseModel.exposed_surface_enabled && (
                <div className="grid grid-cols-2 gap-2.5">
                  <Fld layer="exposed" className="col-span-2 flex flex-col gap-1.5">
                    <FieldLabel label="Exposed Area Source" zh="暴露面積來源" htmlFor="geo-exposed-area-mode" />
                    <Select
                      id="geo-exposed-area-mode"
                      items={[
                        { value: 'DerivedPackage', label: '封裝頂面＋四個側面' },
                        { value: 'Custom', label: '自訂暴露面積' },
                      ]}
                      value={metalBaseModel.exposed_area_mode}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchHeatPathParameters({ exposed_area_mode: event.target.value }, [
                          'heat_path.parameters.exposed_area_mode',
                        ])
                      }
                    />
                  </Fld>
                  {metalBaseModel.exposed_area_mode === 'Custom' ? (
                    <Fld layer="exposed" className="col-span-2 flex flex-col gap-1.5">
                      <FieldLabel label="Custom Exposed Area" zh="自訂暴露面積" unit="mm²" htmlFor="geo-custom-exposed-area" />
                      <NumberInput
                        id="geo-custom-exposed-area"
                        step="1"
                        value={metalBaseModel.custom_exposed_area_mm2 ?? ''}
                        placeholder="—"
                        disabled={readOnly}
                        onChange={(event) =>
                          patchHeatPathParameters({ custom_exposed_area_mm2: numberOrNull(event.target.value) }, [
                            'heat_path.parameters.custom_exposed_area_mm2',
                          ])
                        }
                      />
                    </Fld>
                  ) : (
                    <Fld layer="exposed" className="col-span-2">
                      <DerivedField
                        id="geo-derived-exposed-area"
                        label="Derived Exposed Area"
                        zh="推導暴露面積"
                        unit="mm²"
                        value={exposedArea}
                        from="頂面加四側，底面不重複計入"
                      />
                    </Fld>
                  )}
                </div>
              )}
            </>
          )}

          <ReadRow>
            <BilingualTooltip zh={tip('Source Area') ?? ''} align="left">
              <span className="text-ink-500">{metalBase ? '有效接觸面積' : '熱源面積'}</span>
            </BilingualTooltip>
            <b className="font-semibold text-ink-900">{sourceArea == null ? '—' : `${formatArea(sourceArea)} mm²`}</b>
          </ReadRow>
        </Card>

        {/* ---- Solder and coin ---- */}
        {heatPath === 'Coin' && (
          <Card
            id="coin"
            colors={['var(--hp-solder)', 'var(--hp-coin)']}
            title="焊料＋銅塊"
            small="01 專案設定"
            r={cardR(view, ['solder', 'coin'])}
            hot={hot('coin')}
          >
            <Fld layer="solder">
              <ReadRow from="在 01 修改">
                焊料 <b className="font-semibold text-ink-900">{formatMm(view.solder.t)} mm</b>・k{' '}
                <b className="font-semibold text-ink-900">{view.solder.k ?? '—'}</b>・有效焊接{' '}
                <b className="font-semibold text-ink-900">
                  {view.solder.voiding != null ? `${Math.round(view.solder.voiding * 100)}%` : '—'}
                </b>
              </ReadRow>
            </Fld>
            <div className="grid grid-cols-3 gap-2.5">
              <Fld layer="coin">
                <DerivedField id="geo-spread_L_mm" label="Coin L" zh="銅塊長" unit="mm" value={spreadFace.L} from={spreadOrigin} />
              </Fld>
              <Fld layer="coin">
                <DerivedField id="geo-spread_W_mm" label="Coin W" zh="銅塊寬" unit="mm" value={spreadFace.W} from="" />
              </Fld>
              <Fld layer="coin">
                <DerivedField
                  id="geo-coin_thickness_mm"
                  label="Coin Thickness"
                  zh="銅塊厚度"
                  unit="mm"
                  value={materials.coin_thickness_mm?.value ?? null}
                  from="取自 01"
                />
              </Fld>
            </div>
            <ReadRow>
              <span className="text-ink-500">銅 k</span>
              <b className="font-semibold text-ink-900">{view.coin.k ?? '—'} W/m·K</b>
              <span className="text-ink-500">銅塊面積</span>
              <b className="font-semibold text-ink-900">{spreadArea == null ? '—' : `${formatArea(spreadArea)} mm²`}</b>
            </ReadRow>
          </Card>
        )}

        {/* ---- Board and vias ---- */}
        {heatPath === 'Board' && (
          <Card
            id="board"
            colors={['var(--hp-pcb)', 'var(--hp-via)']}
            title="電路板與導熱孔"
            r={cardR(view, ['via'])}
            hot={hot('board')}
          >
            {rule.thickness === 'board' && (
              <Fld layer="pcb" dim="boardT">
                <AiOwned
                  {...ai}
                  field="board_thickness"
                  label="Board Thickness"
                  zh="板厚"
                  unit="mm"
                  id="geo-board_thickness_mm"
                  text={geometry.board_thickness_mm ?? '—'}
                >
                  <GeometryField
                    label="Board Thickness"
                    zh="板厚"
                    unit="mm"
                    field="board_thickness_mm"
                    geometry={geometry}
                    readOnly={readOnly}
                    required
                    onChange={patchGeometry}
                  />
                </AiOwned>
              </Fld>
            )}
            {/* The via k and process derate are the PROJECT's (01 §4) and
                inherited by default; a part over a locally denser via field
                may override either. Switching to 自訂 seeds the field with the
                inherited number so it never blanks a value being read. Count
                and inner diameter are absent: they are not in the formula. */}
            {aiLocked.via ? (
              <Fld layer="via" dim="via">
                <AiOwned
                  {...ai}
                  field="via"
                  label="Via effective k"
                  zh="導熱孔等效 k"
                  id="hp-via_effective_k_W_mK"
                  text={`${formatAiValue('via', aiValueOf(component, 'via'))}（AI-Thermal 的導熱孔設計）`}
                >
                  {null}
                </AiOwned>
              </Fld>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  {VIA_OVERRIDES.map((field) => {
                    const inherited = materials[field.key].value;
                    const stated = spec.heat_path.parameters?.[field.key];
                    const custom = typeof stated === 'number' && Number.isFinite(stated);
                    return (
                      <Fld key={field.key} layer="via" dim="via" className="flex flex-col gap-1.5">
                        <FieldLabel label={field.label} zh={field.zh} unit={field.unit} htmlFor={`hp-${field.key}`} />
                        <div role="radiogroup" aria-label={`${field.label} source`} className="flex flex-wrap gap-3 text-[12px]">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`${field.key}-mode-${component.id}`}
                              className="size-3.5 accent-[var(--color-accent-600)]"
                              checked={!custom}
                              disabled={readOnly}
                              onChange={() => patchHeatPathParameters({ [field.key]: null }, ['heat_path'])}
                            />
                            取自 01
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`${field.key}-mode-${component.id}`}
                              className="size-3.5 accent-[var(--color-accent-600)]"
                              checked={custom}
                              disabled={readOnly}
                              onChange={() => patchHeatPathParameters({ [field.key]: inherited }, ['heat_path'])}
                            />
                            自訂
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
                            patchHeatPathParameters({ [field.key]: numberOrNull(event.target.value) }, ['heat_path'])
                          }
                        />
                        <p className="text-[11px] leading-relaxed text-ink-400">
                          {custom ? field.customNote : field.inheritNote}
                        </p>
                      </Fld>
                    );
                  })}
                </div>
                <AiUnlockedNote {...ai} field="via" />
              </>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <Fld layer="via" dim="via">
                <DerivedField id="geo-spread_L_mm" label="Spread L" zh="擴散面長" unit="mm" value={spreadFace.L} from={spreadOrigin} />
              </Fld>
              <Fld layer="via" dim="via">
                <DerivedField id="geo-spread_W_mm" label="Spread W" zh="擴散面寬" unit="mm" value={spreadFace.W} from="" />
              </Fld>
            </div>
            <ReadRow>
              <BilingualTooltip zh={tip('Spread Area') ?? ''} align="left">
                <span className="text-ink-500">擴散面積</span>
              </BilingualTooltip>
              <b className="font-semibold text-ink-900">{spreadArea == null ? '—' : `${formatArea(spreadArea)} mm²`}</b>
            </ReadRow>
          </Card>
        )}

        {/* ---- Interface: material, dry contact or measured whole-joint Rth ---- */}
        <Card
          id="tim"
          colors={[resolvedTim.directContact ? 'var(--hp-dry)' : 'var(--hp-tim)']}
          title={metalBase ? '接觸介面' : '熱介面材料 TIM'}
          r={cardR(view, ['tim'])}
          hot={hot('tim')}
        >
          <Fld layer="tim">
            <AiOwned
              {...ai}
              field="tim"
              label="Material"
              zh="材料"
              tooltip={tip('TIM')}
              id="ins-tim"
              text={`${spec.tim.tim_id ? timName(spec.tim.tim_id) : '—'}${
                resolvedTim.directContact || resolvedTim.measuredInterface
                  ? ''
                  : `・BLT ${spec.tim.blt_mm?.value ?? resolvedTim.thickness_mm ?? '—'} mm${spec.tim.blt_mm?.value == null ? '（材料預設）' : ''}`
              }`}
              timName={timName}
            >
              <FieldLabel label="Material" zh="材料" htmlFor="ins-tim" tooltip={tip('TIM')} />
              <Select
                id="ins-tim"
                invalid={spec.tim.tim_id == null || resolvedTim.missing}
                items={[
                  { value: '', label: '未指定' },
                  // Not a material — a bolted joint with nothing in it, which
                  // resolves through the project's contact conductance.
                  {
                    value: DIRECT_CONTACT_TIM_ID,
                    label: `乾式金屬接觸 — h ${materials.contact_conductance_W_m2K.value ?? '?'} W/m²·K`,
                  },
                  ...(metalBase ? [{ value: MEASURED_INTERFACE_TIM_ID, label: '實測整體介面熱阻' }] : []),
                  ...materials.tim.map((material) => ({
                    value: material.id,
                    label: `${material.name} — k ${material.k_W_mK.value ?? '?'} W/m·K`,
                  })),
                ]}
                value={spec.tim.tim_id ?? ''}
                disabled={readOnly}
                onChange={(event) =>
                  patchSpec({ tim: { ...spec.tim, tim_id: event.target.value || null } }, ['tim.tim_id'])
                }
              />
            </AiOwned>
          </Fld>

          {/* A dangling reference is not the same as "no TIM", so it says so. */}
          {resolvedTim.missing && (
            <p className="text-[11px] leading-relaxed text-danger-600">此元件指向的材料已不在專案清單中，請重新選擇。</p>
          )}

          {resolvedTim.directContact && (
            <p className="text-[11px] leading-relaxed text-ink-500">
              金屬直接接觸、沒有 TIM：熱阻＝1／(h × 面積)，h 取自 01，沒有壓合厚度。
            </p>
          )}

          {resolvedTim.measuredInterface && (
            <Fld layer="tim">
              <SourcedNumberField
                id="ins-interface-rth"
                label="Measured Interface Rth"
                zh="實測整體介面熱阻"
                unit="°C/W"
                step="0.001"
                value={spec.tim.measured_rth_C_per_W}
                readOnly={readOnly}
                required
                onChange={(next) => patchSpec({ tim: { ...spec.tim, measured_rth_C_per_W: next } }, ['tim.measured_rth_C_per_W'])}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">代表完整安裝介面的量測值，不再使用 k 與 BLT 計算。</p>
            </Fld>
          )}

          {!resolvedTim.directContact && !resolvedTim.measuredInterface && !aiLocked.tim && (
            <Fld layer="tim" dim="blt" className="flex flex-col gap-1.5">
              <FieldLabel label="Bond Line (BLT)" zh="壓合厚度" unit="mm" htmlFor="ins-blt" />
              <div role="radiogroup" aria-label="Bond line source" className="flex flex-wrap gap-3 text-[12px]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`blt-mode-${component.id}`}
                    className="size-3.5 accent-[var(--color-accent-600)]"
                    checked={!bltCustom}
                    disabled={readOnly || spec.tim.tim_id == null}
                    onChange={() => patchSpec({ tim: { ...spec.tim, blt_mm: null } }, ['tim'])}
                  />
                  材料預設
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
                            blt_mm: withValue({ value: null, source: 'Manual' }, resolvedTim.thickness_mm),
                          },
                        },
                        ['tim'],
                      )
                    }
                  />
                  自訂
                </label>
              </div>
              <NumberInput
                id="ins-blt"
                step="0.01"
                value={bltCustom ? (spec.tim.blt_mm?.value ?? '') : (resolvedTim.thickness_mm ?? '')}
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
                  ? '此組裝的量測值；k 一律取自材料。填壓合後的實際厚度，不是原始片厚。'
                  : `取自 01 的材料設定（${resolvedTim.material?.name ?? '專案材料'}）。`}
              </p>
            </Fld>
          )}

          <ReadRow from={heatPath === 'Coin' ? '＝銅塊面' : heatPath === 'Board' ? '＝擴散面' : heatPath === 'TopSurface' ? '＝本體頂面' : '＝有效接觸面積'}>
            <span className="text-ink-500">作用面積</span>
            <b className="font-semibold text-ink-900">{view.timArea == null ? '—' : `${formatArea(view.timArea)} mm²`}</b>
          </ReadRow>
        </Card>

        {/* ---- The joint to the heat sink ----
            Between HEAT_OUT and the shared base, so a separate question from
            the heat path: the same five options apply whichever path is
            selected, which keeps four paths × five mounts from becoming
            twenty templates. */}
        <Card
          id="mount"
          colors={['var(--hp-mount)']}
          title="與散熱器的接合"
          r={mount.type === 'Direct' ? { text: '—', tone: 'later' } : cardR(view, ['block', 'vc', 'joint', 'pipe'])}
          hot={hot('mount')}
        >
          <div role="radiogroup" aria-label="與散熱器的接合方式" className="grid grid-cols-5 gap-1.5">
            {MOUNT_TYPES.map((type) => {
              const active = mount.type === type;
              return (
                <button
                  key={type}
                  id={active ? 'ins-mount-type' : undefined}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-layer="mount"
                  disabled={readOnly}
                  title={MOUNT_TYPE_HINTS[type].zh}
                  onClick={() => patchMount({ type: type as MountType })}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 text-center disabled:cursor-default ${
                    active
                      ? 'border-2 border-accent-600 bg-accent-50 pt-[6px] pb-[5px]'
                      : 'border border-line-strong bg-surface pt-[7px] pb-[6px] hover:border-ink-400'
                  }`}
                >
                  <StackIcon kind={type} className="h-8 w-full max-w-[54px]" />
                  <span className="text-[11.5px] leading-tight font-semibold text-ink-900">{MOUNT_SHORT[type]}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-ink-400">{MOUNT_TYPE_HINTS[mount.type].zh}</p>

          {mount.type !== 'Direct' && (
            <div className="grid grid-cols-2 gap-3">
              <Fld layer={mount.type === 'Pedestal' || mount.type === 'SmallBaseHeatPipe' ? 'mount' : 'pipe'} dim="mL" className="flex flex-col gap-1.5">
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
                  placeholder={mount.contact_L_mm == null ? '必填' : undefined}
                  invalid={required(mount.contact_L_mm)}
                  disabled={readOnly}
                  onChange={(event) => patchMount({ contact_L_mm: numberOrNull(event.target.value) })}
                />
              </Fld>
              <Fld layer={mount.type === 'Pedestal' || mount.type === 'SmallBaseHeatPipe' ? 'mount' : 'pipe'} dim="mW" className="flex flex-col gap-1.5">
                <FieldLabel
                  label={mount.type === 'EmbeddedHeatPipe' ? 'Pipe W (one pipe)' : `${mountFootprint.label} W`}
                  zh={mount.type === 'EmbeddedHeatPipe' ? '單根熱管寬' : `${mountFootprint.zh}寬`}
                  unit="mm"
                  htmlFor="ins-mount-w"
                  tooltip={mountFootprint.tooltip}
                />
                <NumberInput
                  id="ins-mount-w"
                  value={mount.contact_W_mm ?? ''}
                  placeholder={mount.contact_W_mm == null ? '必填' : undefined}
                  invalid={required(mount.contact_W_mm)}
                  disabled={readOnly}
                  onChange={(event) => patchMount({ contact_W_mm: numberOrNull(event.target.value) })}
                />
              </Fld>

              {/* A groove takes one pipe, so two pipes is two grooves side by
                  side; the count multiplies both the copper and the branch. */}
              {mount.type === 'EmbeddedHeatPipe' && (
                <Fld layer="pipe" className="flex flex-col gap-1.5">
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
                    onChange={(event) => patchMount({ heat_pipe_count: numberOrNull(event.target.value) })}
                  />
                </Fld>
              )}

              {mountBlock && (
                <Fld layer="mount" dim="mH" className="flex flex-col gap-1.5">
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
                    placeholder={mount.height_mm == null ? '必填' : undefined}
                    invalid={required(mount.height_mm)}
                    disabled={readOnly}
                    onChange={(event) => patchMount({ height_mm: numberOrNull(event.target.value) })}
                  />
                </Fld>
              )}

              {mountHasVendorResistance(mount.type) && (
                <Fld layer="pipe" className="flex flex-col gap-1.5">
                  <FieldLabel
                    label={
                      mount.type === 'VaporChamber'
                        ? 'Vapour chamber Rth'
                        : mount.type === 'EmbeddedHeatPipe'
                          ? 'Heat pipe Rth (one pipe)'
                          : 'Heat pipe Rth'
                    }
                    zh={
                      mount.type === 'VaporChamber' ? '均熱板熱阻' : mount.type === 'EmbeddedHeatPipe' ? '單根熱管熱阻' : '熱管熱阻'
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
                    placeholder={mount.heat_pipe_R_C_per_W == null ? '必填' : undefined}
                    invalid={required(mount.heat_pipe_R_C_per_W)}
                    disabled={readOnly}
                    onChange={(event) => patchMount({ heat_pipe_R_C_per_W: numberOrNull(event.target.value) })}
                  />
                </Fld>
              )}

              {/* The vendor resistance only holds below the transport limit.
                  The solve checks the heat it routes through the device
                  against this; blank says the limit was not checked. */}
              {mountHasVendorResistance(mount.type) && (
                <Fld layer="pipe" className="flex flex-col gap-1.5">
                  <FieldLabel
                    label={mount.type === 'EmbeddedHeatPipe' ? 'Qmax (one pipe)' : 'Qmax'}
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
                    onChange={(event) => patchMount({ heat_pipe_qmax_W: numberOrNull(event.target.value) })}
                  />
                </Fld>
              )}

              {/* Machined or bolted. A vapour chamber is never milled out of
                  the heat sink, so it is not asked — it is fixed. */}
              {!mountAttachmentIsFixed(mount.type) && (
                <Fld layer="mount" className="col-span-2 flex flex-col gap-1.5">
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
                      label: MOUNT_ATTACHMENT_LABELS[value].zh,
                      hint: `${MOUNT_ATTACHMENT_LABELS[value].description}\n${MOUNT_ATTACHMENT_LABELS[value].descriptionZh}`,
                    }))}
                    value={mount.attachment}
                    disabled={readOnly}
                    onChange={(event) => patchMount({ attachment: event.target.value as MountAttachment })}
                  />
                </Fld>
              )}

              {/* A bolted block can be another metal — a copper boss on an
                  aluminium base. Blank inherits the heat sink's. */}
              {mountBlock && mount.attachment === 'Bolted' && (
                <Fld layer="mount" className="flex flex-col gap-1.5">
                  <FieldLabel
                    label="Block k"
                    zh="塊體導熱係數"
                    unit="W/m·K"
                    htmlFor="ins-mount-k"
                    tooltip="留空＝沿用 01 的底座材質。銅凸台請填 385 左右。"
                  />
                  <NumberInput
                    id="ins-mount-k"
                    value={mount.block_k_W_mK ?? ''}
                    placeholder={String(materials.hsk_base_k_W_mK.value ?? '')}
                    disabled={readOnly}
                    onChange={(event) => patchMount({ block_k_W_mK: numberOrNull(event.target.value) })}
                  />
                </Fld>
              )}

              {/* An embedded pipe has no body, so there is nothing under it to
                  join — the pipe is already in the base. */}
              {mountHasOwnBody(mount.type) && mount.attachment === 'Bolted' && (
                <>
                  <Fld layer="joint" className="flex flex-col gap-1.5">
                    <FieldLabel
                      label="Joint interface"
                      zh="接合面材料"
                      htmlFor="ins-mount-joint-tim"
                      tooltip="鎖上去的介面。選「乾接觸」則改用 01 的接觸導熱係數。"
                    />
                    <Select
                      id="ins-mount-joint-tim"
                      items={[
                        { value: '', label: '乾接觸' },
                        ...materials.tim.map((entry) => ({
                          value: entry.id,
                          label: `${entry.name}${entry.k_W_mK.value != null ? ` — k ${entry.k_W_mK.value} W/m·K` : ''}`,
                        })),
                      ]}
                      value={mount.joint_tim_id ?? ''}
                      disabled={readOnly}
                      onChange={(event) => patchMount({ joint_tim_id: event.target.value || null })}
                    />
                  </Fld>
                  {mount.joint_tim_id != null && (
                    <Fld layer="joint" dim="jointBlt" className="flex flex-col gap-1.5">
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
                        placeholder={mount.joint_blt_mm == null ? '必填' : undefined}
                        invalid={required(mount.joint_blt_mm)}
                        disabled={readOnly}
                        onChange={(event) => patchMount({ joint_blt_mm: numberOrNull(event.target.value) })}
                      />
                    </Fld>
                  )}
                </>
              )}

              <p className="col-span-2 text-[10px] leading-relaxed text-ink-400">
                {mount.type === 'VaporChamber'
                  ? '均熱板的價值在於交給底座的面積，不是它本身的導熱率——沒有比元件大就只是徒增熱阻。留空的那一段維持未解析，05 仍會畫出來。'
                  : '銑出的塊體與散熱器同材，k 取自 01。留空的那一段維持未解析，05 仍會畫出來。'}
              </p>
            </div>
          )}
        </Card>

        {/* ---- The base ----
            How much of the base the part spreads into: the same question one
            step further on — once heat is in the base, how far does this
            part's own edge carry it. */}
        <Card id="base" colors={['var(--hp-base)']} title="散熱器底座" r={{ text: '05 計算', tone: 'later' }} hot={hot('base')}>
          <Fld layer="spread" dim="spread" className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-700">擴散範圍</span>
            <Segmented
              id="ins-spreading-domain"
              label="擴散範圍"
              full
              items={SPREADING_DOMAIN_MODES.map((mode) => ({
                value: mode,
                label: `${SPREADING_DOMAIN_LABELS[mode].zh}${mode === 'WholeBase' ? '（預設）' : ''}`,
              }))}
              value={spreadingDomain.mode}
              disabled={readOnly}
              onChange={(mode) => patchSpreadingDomain({ mode })}
            />
            <p className="text-[11px] leading-relaxed text-ink-400">{SPREADING_DOMAIN_HINTS[spreadingDomain.mode].zh}</p>
          </Fld>
          {spreadingDomain.mode === 'Manual' && (
            <Fld layer="spread" dim="spread" className="flex flex-col gap-1.5">
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
                invalid={domainArea == null}
                disabled={readOnly}
                onChange={(event) => patchSpreadingDomain({ area_mm2: numberOrNull(event.target.value) })}
              />
              {domainArea == null ? (
                <p className="text-[10px] leading-relaxed text-warn-600">尚未填面積；填寫前這顆以整片基座計算。</p>
              ) : (
                <p className="text-[10px] leading-relaxed text-ink-400">
                  {baseAreaMm2 != null
                    ? `佔整片基座 ${Math.round(baseAreaMm2).toLocaleString('en-US')} mm² 的 ${((100 * Math.min(domainArea, baseAreaMm2)) / baseAreaMm2).toFixed(1)} %${
                        domainArea > baseAreaMm2 ? '；大於基座，以整片基座計算' : ''
                      }。`
                    : '01 尚未設定 HSK 底座尺寸，無法顯示比例。'}
                </p>
              )}
            </Fld>
          )}
          <Fld layer="base">
            <ReadRow from="在 01 修改">
              底座{' '}
              <b className="font-semibold text-ink-900">
                {formatMm(view.base.L)} × {formatMm(view.base.W)} × {formatMm(view.base.t)} mm
              </b>
              ・k <b className="font-semibold text-ink-900">{view.base.k ?? '—'}</b>
            </ReadRow>
          </Fld>
          <Fld layer="fins">
            <p className="text-[11px] text-ink-400">鰭片在 05 的散熱表面設定，環境在 01 的情境。</p>
          </Fld>
        </Card>
      </div>
    </>
  );
}
