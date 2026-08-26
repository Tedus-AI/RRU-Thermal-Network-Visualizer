/**
 * Component inspector — 04 §13–§21, §27, §33.
 *
 * Six tabs: Overview, Thermal Spec, Geometry, Architecture Prep, Source and
 * External Mapping. Nothing here creates a node or an edge (04 §19, §40).
 *
 * The screen owns the active tab rather than this component, because an issue
 * elsewhere on the page has to be able to open the tab that fixes it. Every
 * editable control carries the DOM id `issueTargets.ts` names for it.
 *
 * Two things are deliberately NOT asked for here:
 *   - a data source beside every number. Provenance still matters and is still
 *     stored, but it is edited in one place — the Source tab — instead of
 *     doubling the width of every field. A value still on `Assumed` says so.
 *   - an architecture template. The heat path already picks it (`heatPathPatch`).
 */

import { useEffect, useState } from 'react';
import { CircleCheck, CircleDashed, Info, Link2, Ruler, Share2, Thermometer } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextArea, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import {
  COMPONENT_CATEGORIES,
  HEAT_PATH_LABELS,
  HEAT_PATH_TYPES,
  HEAT_PATH_PATCH_FIELDS,
  LIMIT_TYPES,
  LIMIT_TYPE_LABELS,
  METAL_BASE_CONTACT_GEOMETRIES,
  METAL_BASE_CONTACT_GEOMETRY_LABELS,
  METAL_BASE_SOURCE_MODELS,
  METAL_BASE_SOURCE_MODEL_LABELS,
  MODULE_REFERENCE_LOCATIONS,
  MODULE_REFERENCE_LOCATION_LABELS,
  PACKAGE_TYPES,
  PACKAGE_TYPE_HINTS,
  QTY_MODELS,
  QTY_MODEL_LABELS,
  GEOMETRY_RULES,
  SOURCE_FACE_LABELS,
  componentTotalPowerW,
  heatPathPatch,
  metalBaseExposedAreaMm2,
  metalBaseParameters,
  normalizeModuleReferenceLocation,
  sourceAreaMm2,
  sourceFaceMm,
  spreadAreaMm2,
  spreadFaceMm,
  UNASSIGNED_ZONE,
  type BaseZone,
  type Component,
  type ComponentCategory,
  type ComponentGeometry,
  type HeatPathType,
  type LimitType,
  type ModuleReferenceLocation,
  type PackageType,
  type QtyModel,
  MOUNT_ATTACHMENTS,
  MOUNT_ATTACHMENT_LABELS,
  MOUNT_TYPES,
  MOUNT_TYPE_LABELS,
  MOUNT_TYPE_HINTS,
  mountSpec,
  mountAttachmentIsFixed,
  mountHasBlock,
  mountHasOwnBody,
  mountHasVendorResistance,
  type MountSpec,
  type MountAttachment,
  type MountType,
} from '@/domain/component';
import { withValue, type SourcedValue } from '@/domain/sourcedValue';
import {
  DIRECT_CONTACT_TIM_ID,
  BUILTIN_TIM_IDS,
  MEASURED_INTERFACE_TIM_ID,
  coinAreaMm2,
  defaultMaterials,
  resolveTim,
} from '@/domain/materials';
import { useProjectStore } from '@/data/projectStore';
import {
  DATA_SOURCE_LABELS,
  SELECTABLE_DATA_SOURCES,
  type DataSource,
} from '@/thermal/types';
import {
  COMPLETENESS_ITEMS,
  COMPLETENESS_ITEMS_ZH,
  completenessOf,
  completenessScore,
  validateComponent,
} from '@/domain/componentReadiness';
import { tip } from '@/i18n/componentManagerCopy';
import { presetZones } from '@/thermal/graph/sharedStructure';
import { confirmAction, issueTarget, type InspectorTab } from './issueTargets';

type Tab = InspectorTab;

const TABS: Array<{ id: Tab; label: string; zh: string; icon: typeof Info }> = [
  { id: 'overview', label: 'Overview', zh: '概要', icon: Info },
  { id: 'thermal', label: 'Thermal Spec', zh: '熱規格', icon: Thermometer },
  { id: 'geometry', label: 'Geometry', zh: '幾何', icon: Ruler },
  { id: 'architecture', label: 'Architecture Prep', zh: '架構準備', icon: Share2 },
  { id: 'source', label: 'Source', zh: '來源', icon: CircleDashed },
  { id: 'external', label: 'External Mapping', zh: '外部映射', icon: Link2 },
];

/** The five an engineer picks, plus whatever the field already says. */
function sourceOptions(current: DataSource | undefined) {
  const values: DataSource[] = [...SELECTABLE_DATA_SOURCES];
  if (current && !values.includes(current)) values.unshift(current);
  return values.map((value) => ({
    value,
    label: `${DATA_SOURCE_LABELS[value].en} / ${DATA_SOURCE_LABELS[value].zh}`,
  }));
}

/** A request to put the caret in one field; `nonce` lets the same field repeat. */
export interface FocusRequest {
  fieldId: string;
  nonce: number;
}

export interface InspectorProps {
  component: Component | null;
  readOnly: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Set by an issue link elsewhere on the screen. */
  focus?: FocusRequest | null;
  /** Opens a tab AND puts the caret in one of its fields. */
  onGoToField: (tab: Tab, fieldId: string) => void;
  onPatch: (id: string, patch: Partial<Component>, fields: string[]) => void;
  onSaveToLibrary: (component: Component) => void;
}

/**
 * A number that carries provenance. The source itself is edited on the Source
 * tab; the only thing said here is when a value is still a shipped guess, which
 * is the one state that changes how much you should trust the number.
 */
function SourcedNumberField({
  id,
  label,
  zh,
  unit,
  tooltip,
  value,
  placeholder = '—',
  step = 'any',
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  zh: string;
  unit?: string;
  tooltip?: string;
  value: SourcedValue<number> | null;
  placeholder?: string;
  step?: string | number;
  readOnly: boolean;
  onChange: (next: SourcedValue<number> | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} unit={unit} tooltip={tooltip} htmlFor={id} />
      <NumberInput
        id={id}
        step={step}
        value={value?.value ?? ''}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(event) =>
          onChange(withValue(value, event.target.value === '' ? null : Number(event.target.value)))
        }
      />
      {value?.value != null && value.source === 'Assumed' && (
        <p className="text-[11px] text-warn-600">Assumed / 推定值</p>
      )}
    </div>
  );
}

function GeometryField({
  label,
  zh,
  field,
  geometry,
  readOnly,
  onChange,
}: {
  label: string;
  zh: string;
  field: keyof ComponentGeometry;
  geometry: ComponentGeometry;
  readOnly: boolean;
  onChange: (patch: Partial<ComponentGeometry>) => void;
}) {
  const id = `geo-${String(field)}`;
  const value = geometry[field];
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} htmlFor={id} />
      <NumberInput
        id={id}
        step="any"
        value={typeof value === 'number' ? value : ''}
        placeholder="—"
        disabled={readOnly}
        onChange={(event) =>
          onChange({
            [field]: event.target.value === '' ? null : Number(event.target.value),
          } as Partial<ComponentGeometry>)
        }
      />
    </div>
  );
}

/** A dimension this component does not own: shown, never typed, and said why. */
function DerivedField({
  id,
  label,
  zh,
  value,
  from,
}: {
  id: string;
  label: string;
  zh: string;
  value: number | null;
  from: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} htmlFor={id} />
      <NumberInput id={id} value={value ?? ''} placeholder="—" disabled readOnly />
      <p className="text-[11px] text-ink-400">{from}</p>
    </div>
  );
}

/**
 * Puts the caret in the field an issue link named, and rings it briefly so the
 * eye lands in the same place the focus did.
 */
function useFocusField(focus: FocusRequest | null | undefined, tab: Tab) {
  useEffect(() => {
    if (!focus) return;
    // One frame, so the tab this field lives on has rendered first.
    const timer = window.setTimeout(() => {
      const element = document.getElementById(focus.fieldId);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (element as HTMLElement).focus({ preventScroll: true });
      element.classList.add('ring-2', 'ring-accent-500');
      window.setTimeout(() => element.classList.remove('ring-2', 'ring-accent-500'), 1600);
    }, 0);
    return () => window.clearTimeout(timer);
    // `tab` is a dependency because the focus request switches it first.
  }, [focus, tab]);
}

/** An empty box is "not stated", which is null — never 0 (04 §11). */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ComponentInspector({
  component,
  readOnly,
  tab,
  onTabChange,
  focus,
  onGoToField,
  onPatch,
  onSaveToLibrary,
}: InspectorProps) {
  const projectMaterials = useProjectStore((s) => s.draft?.materials);
  const projectContext = useProjectStore((s) => s.draft?.project_context);
  const [librarySavedAt, setLibrarySavedAt] = useState(0);
  useFocusField(focus, tab);

  // Keep the acknowledgement beside the action that caused it. The global
  // toast remains useful, but can be missed while the floating panel is open.
  useEffect(() => {
    if (librarySavedAt === 0) return;
    const timer = window.setTimeout(() => setLibrarySavedAt(0), 3000);
    return () => window.clearTimeout(timer);
  }, [librarySavedAt]);

  useEffect(() => setLibrarySavedAt(0), [component?.id]);

  if (!component) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-[13px] text-ink-500">Select a component to inspect it.</p>
        <p className="mt-1 text-[12px] text-ink-400">請於左側選擇一個元件。</p>
      </div>
    );
  }

  const spec = component.thermal_spec;
  const prep = component.architecture_prep;
  const materials = projectMaterials ?? defaultMaterials();
  const issues = validateComponent(component);
  const completeness = completenessOf(component);
  const score = completenessScore(completeness);

  const patchSpec = (patch: Partial<Component['thermal_spec']>, fields: string[]) =>
    onPatch(component.id, { thermal_spec: { ...spec, ...patch } }, fields);

  const patchGeometry = (patch: Partial<ComponentGeometry>) =>
    patchSpec({ geometry: { ...spec.geometry, ...patch } }, ['geometry']);

  const patchHeatPathParameters = (
    patch: Record<string, number | string | boolean | null>,
    fields: string[],
  ) =>
    patchSpec(
      {
        heat_path: {
          ...spec.heat_path,
          parameters: { ...spec.heat_path.parameters, ...patch },
        },
      },
      fields,
    );

  const patchPrep = (patch: Partial<Component['architecture_prep']>) =>
    onPatch(component.id, { architecture_prep: { ...prep, ...patch } }, ['architecture_prep']);

  const zones = presetZones(projectContext?.base_structure ?? 'SINGLE_MAIN_BASE');
  const zoneOptions = [
    { value: UNASSIGNED_ZONE, label: 'Unassigned / 未指定' },
    ...zones.map((zone) => ({ value: zone.key, label: `${zone.name} / ${zone.zh}` })),
  ];
  // A structure change can orphan a zone a component still points at; showing
  // it keeps the select honest about what the component actually says.
  const zoneOrphaned =
    prep.preferred_base_zone !== UNASSIGNED_ZONE &&
    !zones.some((zone) => zone.key === prep.preferred_base_zone);
  if (zoneOrphaned) {
    zoneOptions.push({
      value: prep.preferred_base_zone,
      label: `${prep.preferred_base_zone} — not in this structure / 不屬於目前基座結構`,
    });
  }

  const heatPath = spec.heat_path.type;
  const metalBase = heatPath === 'DirectMetal';
  const metalBaseModel = metalBaseParameters(spec);
  const envelopeLabels = metalBase
    ? {
        L: { en: 'Body / Base Outer L', zh: '本體／底面外框長' },
        W: { en: 'Body / Base Outer W', zh: '本體／底面外框寬' },
        H: { en: 'Body H', zh: '本體高度' },
      }
    : {
        L: { en: 'Package L', zh: '封裝長' },
        W: { en: 'Package W', zh: '封裝寬' },
        H: { en: 'Package H', zh: '封裝高' },
      };
  // Rjc applies unless the dissipation is referenced to the surface itself.
  // This used to be `moduleSurface || ...`; ModuleSurface folded into
  // DirectMetal, and SurfaceBodyBased is the accurate test — a JunctionBased
  // metal face (a flanged transistor) does have an Rjc.
  const surfaceReferenced = metalBase && metalBaseModel.source_model === 'SurfaceBodyBased';

  // SOT and QFP are no longer offered, but a project that stored one keeps it:
  // it is appended as an off-list row so the select shows the truth instead of
  // silently snapping to another package.
  const PACKAGE_TYPE_SET: ReadonlySet<string> = new Set<string>(PACKAGE_TYPES);
  const packageOptions = [
    ...PACKAGE_TYPES.map((type) => ({
      value: type,
      label: type,
      hint: `${PACKAGE_TYPE_HINTS[type].en}\n${PACKAGE_TYPE_HINTS[type].zh}`,
    })),
    ...(spec.package_type != null && !PACKAGE_TYPE_SET.has(spec.package_type)
      ? [
          {
            value: spec.package_type,
            label: `${spec.package_type} — no longer listed / 已不在清單`,
            hint: 'Stored by an earlier version. Pick the closest current package when you next review this part.\n由舊版存下的封裝型式。下次檢核這顆零件時，請改選目前清單中最接近的型式。',
          },
        ]
      : []),
  ];

  // How this part reaches the shared structure. Orthogonal to the heat path:
  // the same boss or heat pipe can sit under a coin, a via or a metal face.
  const mount = mountSpec(spec);
  const mountBlock = mountHasBlock(mount.type);
  /*
     What this pair of numbers actually is, which differs by mount.

     For a block it is the block's own footprint. For a heat pipe it is the
     CONDENSER's footprint where it meets the base — how much of the pipe is
     flattened or saddled in — and that has nothing to do with how big the part
     is: a 30x30 FPGA can feed a 6 mm pipe whose condenser section is 8 x 60.
     The field was labelled "Joint L/W" for both, which invited exactly that
     confusion.

     Either way it is the area the base spreads from, which is why it is the
     one number in the mount that always matters.
  */
  const mountFootprint =
    mount.type === 'VaporChamber'
      ? {
          label: 'Chamber',
          zh: '均熱板',
          tooltip:
            '均熱板貼在底座上的外形尺寸。這是底座擴散的起算面積 —— 均熱板的價值就在這裡，跟元件多大無關。',
        }
      : mount.type === 'EmbeddedHeatPipe'
        ? {
            label: 'Pipe under source',
            zh: '熱源下方熱管',
            tooltip:
              '熱管在熱源正下方那一段的壓平尺寸：長 = 穿越熱源的長度，寬 = 所有管子壓平寬度的總和（兩根 8 mm 就填 16）。這塊面積是銅，會從熱源接觸面裡扣掉，剩下的才是走鋁底座擴散的那條並聯支路。',
          }
        : {
            label: 'Mount',
            zh: '接合面',
            tooltip: '凸台／小基座貼在底座上的外形尺寸。這是底座擴散的起算面積。',
          };
  const patchMount = (patch: Partial<MountSpec>) =>
    patchSpec({ mount: { ...mount, ...patch } }, ['mount']);
  const rule = GEOMETRY_RULES[heatPath];
  const resolvedTim = resolveTim(spec.tim, materials);
  const projectCoin = {
    L: materials.coin_L_mm?.value ?? null,
    W: materials.coin_W_mm?.value ?? null,
  };
  const sourceFace = sourceFaceMm(spec.geometry, heatPath);
  const spreadFace = spreadFaceMm(spec.geometry, heatPath, projectCoin);
  const sourceArea = sourceAreaMm2(spec.geometry, heatPath, spec.heat_path.parameters);
  const spreadArea = spreadAreaMm2(
    spec.geometry,
    heatPath,
    coinAreaMm2(materials),
    spec.heat_path.parameters,
  );
  const exposedArea = metalBaseExposedAreaMm2(spec);
  // Blank BLT means "use the material's"; a stored one means the build was
  // measured. The radio below is just that distinction, made visible.
  const bltCustom = spec.tim.blt_mm != null;

  const SOURCE_ORIGIN = {
    Coin: '= Package outline (soldered across its base) / 等於封裝外形（整個底面焊接）',
    TopSurface: '= Package outline (the case top) / 等於封裝外形（Case 上表面）',
    ModuleSurface:
      '= Package outline (specified module surface) / 等於封裝外形（原廠指定散熱面）',
  } as const;
  const spreadOrigin =
    rule.spread === 'project_coin'
      ? coinAreaMm2(materials) == null
        ? 'Needs the project coin size (Screen 01) / 需先於 Screen 01 設定銅塊尺寸'
        : 'From the project coin size / 取自專案銅塊尺寸'
      : rule.spread === 'board_spread'
        ? 'Derived: (L + board thickness) × (W + board thickness) / 由 45° 擴散推導'
        : 'No spreading on this path — heat leaves the face it entered / 此路徑無擴散，等於熱源面';

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-3.5 py-2.5">
          {/* The floating panel's own title bar carries the name and badge. */}
          <nav className="flex flex-wrap gap-1" aria-label="Component inspector sections">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-accent-600 text-white'
                      : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
                  }`}
                  title={`${item.label} / ${item.zh}`}
                >
                  <Icon size={12} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="flex flex-col gap-3.5 p-3.5">
          {tab === 'overview' && (
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
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label="Qty" zh="數量" htmlFor="ins-qty" tooltip={tip('Qty')} />
                  <NumberInput
                    id="ins-qty"
                    value={component.qty}
                    disabled={readOnly}
                    onChange={(event) =>
                      onPatch(component.id, { qty: Number(event.target.value) }, ['qty'])
                    }
                  />
                </div>
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
              </div>

              <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <BilingualTooltip zh={tip('Total Power') ?? ''} align="left">
                    <span className="text-[12px] text-ink-500">Total Power / 總功耗</span>
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
          )}

          {tab === 'thermal' && (
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

                  {metalBase && (
                    <div className="rounded-md border border-line bg-surface-muted p-2.5">
                      <FieldLabel
                        label="Heat Source Reference"
                        zh="熱源基準"
                        tooltip="決定 Screen 05 是否建立 Junction 與 Rjc；這是物理模型，不由 Limit Type 推定。"
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
                                    patchHeatPathParameters(
                                      { source_model: model },
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
                  )}

                  {/* The via array's k and process derate are the project's
                      (01 §4) — the template reads `materials.*`, so these were
                      never per-component inputs, they only looked like it.
                      Count and inner diameter are not in the formula at all. */}
                  {heatPath === 'Board' && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <DerivedField
                        id="hp-effective_k_W_mK"
                        label="Via effective k"
                        zh="導熱孔等效 k"
                        value={materials.via_effective_k_W_mK.value}
                        from="Screen 01 / 專案設定"
                      />
                      <DerivedField
                        id="hp-via_efficiency"
                        label="Via efficiency"
                        zh="導熱孔製程係數"
                        value={materials.via_efficiency.value}
                        from=""
                      />
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
                          label={`${mountFootprint.label} W`}
                          zh={`${mountFootprint.zh}寬`}
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
                              mount.type === 'VaporChamber' ? 'Vapour chamber Rth' : 'Heat pipe Rth'
                            }
                            zh={mount.type === 'VaporChamber' ? '均熱板熱阻' : '熱管熱阻'}
                            unit="°C/W"
                            htmlFor="ins-mount-hp"
                            tooltip={
                              mount.type === 'VaporChamber'
                                ? '均熱板熱阻是原廠在特定功率與熱源尺寸下量測的數值，不是常數，也無法由幾何推導。未填則該段維持未解析。'
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
                      patchSpec({ package_type: event.target.value as PackageType }, [
                        'package_type',
                      ])
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
          )}

          {tab === 'geometry' && (
            <>
              {/* The package envelope is the one thing every path needs, and
                  two of the four take their heat-leaving face straight from it. */}
              <div className="grid grid-cols-3 gap-2.5">
                <GeometryField
                  label={envelopeLabels.L.en}
                  zh={envelopeLabels.L.zh}
                  field="package_L_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label={envelopeLabels.W.en}
                  zh={envelopeLabels.W.zh}
                  field="package_W_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label={envelopeLabels.H.en}
                  zh={envelopeLabels.H.zh}
                  field="package_H_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
              </div>

              {metalBase && (
                <>
                  <fieldset className="rounded-md border border-line p-3">
                    <legend className="px-1 text-[12px] font-semibold text-ink-700">
                      Contact Geometry / 接觸幾何
                    </legend>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="col-span-2 flex flex-col gap-1.5">
                        <FieldLabel
                          label="Contact Model"
                          zh="接觸面模型"
                          htmlFor="geo-metal-contact-model"
                        />
                        <Select
                          id="geo-metal-contact-model"
                          items={METAL_BASE_CONTACT_GEOMETRIES.map((geometry) => ({
                            value: geometry,
                            label: `${METAL_BASE_CONTACT_GEOMETRY_LABELS[geometry].en} / ${METAL_BASE_CONTACT_GEOMETRY_LABELS[geometry].zh}`,
                          }))}
                          value={metalBaseModel.contact_geometry}
                          disabled={readOnly}
                          onChange={(event) =>
                            patchHeatPathParameters(
                              { contact_geometry: event.target.value },
                              ['heat_path.parameters.contact_geometry'],
                            )
                          }
                        />
                      </div>

                      {metalBaseModel.contact_geometry === 'FullBase' && (
                        <>
                          <DerivedField
                            id="geo-metal-contact-L"
                            label="Base Contact L"
                            zh="底面接觸長"
                            value={spec.geometry.package_L_mm}
                            from={`= ${envelopeLabels.L.en} / 等於${envelopeLabels.L.zh}`}
                          />
                          <DerivedField
                            id="geo-metal-contact-W"
                            label="Base Contact W"
                            zh="底面接觸寬"
                            value={spec.geometry.package_W_mm}
                            from={`= ${envelopeLabels.W.en} / 等於${envelopeLabels.W.zh}`}
                          />
                        </>
                      )}

                      {metalBaseModel.contact_geometry === 'PerimeterFrame' && (
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <FieldLabel
                            label="Perimeter Land Width"
                            zh="外圍接觸邊寬"
                            unit="mm"
                            htmlFor="geo-perimeter-land-width"
                          />
                          <NumberInput
                            id="geo-perimeter-land-width"
                            step="0.1"
                            value={metalBaseModel.perimeter_land_width_mm ?? ''}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(event) =>
                              patchHeatPathParameters(
                                {
                                  perimeter_land_width_mm:
                                    event.target.value === '' ? null : Number(event.target.value),
                                },
                                ['heat_path.parameters.perimeter_land_width_mm'],
                              )
                            }
                          />
                          <p className="text-[11px] text-ink-400">
                            Effective area = outer base − open centre. / 有效面積＝完整底面－中央開口。
                          </p>
                        </div>
                      )}

                      {metalBaseModel.contact_geometry === 'CustomArea' && (
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <FieldLabel
                            label="Custom Effective Area"
                            zh="自訂有效接觸面積"
                            unit="mm²"
                            htmlFor="geo-custom-contact-area"
                          />
                          <NumberInput
                            id="geo-custom-contact-area"
                            step="1"
                            value={metalBaseModel.custom_contact_area_mm2 ?? ''}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(event) =>
                              patchHeatPathParameters(
                                {
                                  custom_contact_area_mm2:
                                    event.target.value === '' ? null : Number(event.target.value),
                                },
                                ['heat_path.parameters.custom_contact_area_mm2'],
                              )
                            }
                          />
                          <p className="text-[11px] text-ink-400">
                            Use the actual clamped lands; exclude paint, gaps and uncompressed gasket.
                            <span className="block">只計入實際壓緊區域，扣除噴漆、缺口與未壓縮墊片。</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </fieldset>

                  <fieldset className="rounded-md border border-line p-3">
                    <legend className="px-1 text-[12px] font-semibold text-ink-700">
                      Additional Exposed Surface / 額外暴露表面
                    </legend>
                    <label className="flex items-start gap-2 text-[12px] text-ink-700">
                      <input
                        id="geo-exposed-surface-enabled"
                        type="checkbox"
                        className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                        checked={metalBaseModel.exposed_surface_enabled}
                        disabled={readOnly}
                        onChange={(event) =>
                          patchHeatPathParameters(
                            { exposed_surface_enabled: event.target.checked },
                            ['heat_path.parameters.exposed_surface_enabled'],
                          )
                        }
                      />
                      <span>
                        Generate a convection/radiation boundary opening
                        <span className="block text-[11px] text-ink-400">
                          在 Screen 05 產生可供 Screen 06 設定對流／輻射的表面出口
                        </span>
                      </span>
                    </label>

                    {metalBaseModel.exposed_surface_enabled && (
                      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <FieldLabel
                            label="Exposed Area Source"
                            zh="暴露面積來源"
                            htmlFor="geo-exposed-area-mode"
                          />
                          <Select
                            id="geo-exposed-area-mode"
                            items={[
                              {
                                value: 'DerivedPackage',
                                label: 'Package top + four sides / 封裝頂面＋四個側面',
                              },
                              { value: 'Custom', label: 'Custom exposed area / 自訂暴露面積' },
                            ]}
                            value={metalBaseModel.exposed_area_mode}
                            disabled={readOnly}
                            onChange={(event) =>
                              patchHeatPathParameters(
                                { exposed_area_mode: event.target.value },
                                ['heat_path.parameters.exposed_area_mode'],
                              )
                            }
                          />
                        </div>

                        {metalBaseModel.exposed_area_mode === 'Custom' ? (
                          <div className="col-span-2 flex flex-col gap-1.5">
                            <FieldLabel
                              label="Custom Exposed Area"
                              zh="自訂暴露面積"
                              unit="mm²"
                              htmlFor="geo-custom-exposed-area"
                            />
                            <NumberInput
                              id="geo-custom-exposed-area"
                              step="1"
                              value={metalBaseModel.custom_exposed_area_mm2 ?? ''}
                              placeholder="—"
                              disabled={readOnly}
                              onChange={(event) =>
                                patchHeatPathParameters(
                                  {
                                    custom_exposed_area_mm2:
                                      event.target.value === '' ? null : Number(event.target.value),
                                  },
                                  ['heat_path.parameters.custom_exposed_area_mm2'],
                                )
                              }
                            />
                          </div>
                        ) : (
                          <DerivedField
                            id="geo-derived-exposed-area"
                            label="Derived Exposed Area"
                            zh="推導暴露面積"
                            value={exposedArea}
                            from="Top + four sides; base excluded / 頂面加四側，底面不重複計入"
                          />
                        )}
                      </div>
                    )}
                  </fieldset>
                </>
              )}

              {/* Source face — asked for only when the path does not already
                  determine it (GEOMETRY_RULES). */}
              {!metalBase && <div className="grid grid-cols-2 gap-2.5">
                {rule.source === 'package' ? (
                  <>
                    <DerivedField
                      id="geo-source_L_mm"
                      label={`${SOURCE_FACE_LABELS[heatPath].en} L`}
                      zh={`${SOURCE_FACE_LABELS[heatPath].zh}長`}
                      value={sourceFace.L}
                      from={SOURCE_ORIGIN[heatPath as keyof typeof SOURCE_ORIGIN]}
                    />
                    <DerivedField
                      id="geo-source_W_mm"
                      label={`${SOURCE_FACE_LABELS[heatPath].en} W`}
                      zh={`${SOURCE_FACE_LABELS[heatPath].zh}寬`}
                      value={sourceFace.W}
                      from=""
                    />
                  </>
                ) : (
                  <>
                    <GeometryField
                      label={`${SOURCE_FACE_LABELS[heatPath].en} L`}
                      zh={`${SOURCE_FACE_LABELS[heatPath].zh}長`}
                      field="source_L_mm"
                      geometry={spec.geometry}
                      readOnly={readOnly}
                      onChange={patchGeometry}
                    />
                    <GeometryField
                      label={`${SOURCE_FACE_LABELS[heatPath].en} W`}
                      zh={`${SOURCE_FACE_LABELS[heatPath].zh}寬`}
                      field="source_W_mm"
                      geometry={spec.geometry}
                      readOnly={readOnly}
                      onChange={patchGeometry}
                    />
                  </>
                )}
              </div>}

              {/* The one thickness this path conducts through, if any. */}
              {rule.thickness === 'board' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <GeometryField
                    label="Board Thickness"
                    zh="板厚"
                    field="board_thickness_mm"
                    geometry={spec.geometry}
                    readOnly={readOnly}
                    onChange={patchGeometry}
                  />
                </div>
              )}
              {rule.thickness === 'project_coin' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <DerivedField
                    id="geo-coin_thickness_mm"
                    label="Coin Thickness"
                    zh="銅塊厚度"
                    value={materials.coin_thickness_mm?.value ?? null}
                    from="Screen 01 / 專案設定"
                  />
                </div>
              )}

              {/* Spread face — never typed. Every path derives it, so showing
                  it read-only is the only way it and the solver can agree. */}
              {!metalBase && <div className="grid grid-cols-2 gap-2.5">
                <DerivedField
                  id="geo-spread_L_mm"
                  label={rule.spread === 'project_coin' ? 'Coin L' : 'Spread L'}
                  zh={rule.spread === 'project_coin' ? '銅塊長' : '擴散面長'}
                  value={spreadFace.L}
                  from={spreadOrigin}
                />
                <DerivedField
                  id="geo-spread_W_mm"
                  label={rule.spread === 'project_coin' ? 'Coin W' : 'Spread W'}
                  zh={rule.spread === 'project_coin' ? '銅塊寬' : '擴散面寬'}
                  value={spreadFace.W}
                  from=""
                />
              </div>}

              <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <BilingualTooltip zh={tip('Source Area') ?? ''} align="left">
                    <span className="text-[12px] text-ink-500">
                      {metalBase ? 'Effective Contact Area / 有效接觸面積' : 'Source Area / 熱源面積'}
                    </span>
                  </BilingualTooltip>
                  <span className="tabular text-[13px] font-bold">
                    {sourceArea == null ? '—' : `${sourceArea.toFixed(1)} mm²`}
                  </span>
                </div>
                {!metalBase && <div className="mt-1.5 flex items-baseline justify-between">
                  <BilingualTooltip zh={tip('Spread Area') ?? ''} align="left">
                    <span className="text-[12px] text-ink-500">Spread Area / 擴散面積</span>
                  </BilingualTooltip>
                  <span className="tabular text-[13px] font-bold">
                    {spreadArea == null ? '—' : `${spreadArea.toFixed(1)} mm²`}
                  </span>
                </div>}
                {metalBase && metalBaseModel.exposed_surface_enabled && (
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-[12px] text-ink-500">
                      Exposed Surface Area / 暴露表面積
                    </span>
                    <span className="tabular text-[13px] font-bold">
                      {exposedArea == null ? '—' : `${exposedArea.toFixed(1)} mm²`}
                    </span>
                  </div>
                )}
              </div>

              {spec.geometry.needs_review && (
                <div className="rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5">
                  <p className="text-[11px] leading-relaxed text-warn-600">
                    Imported legacy geometry needs review — Thickness / Pad may follow Volume Tool
                    semantics.
                    <span className="block">
                      匯入的舊版幾何資料需人工確認（可能沿用舊工具定義）。
                    </span>
                  </p>
                  {/* The fix is a decision, not a value, so it is one click here. */}
                  <Button
                    className="mt-2 h-7"
                    disabled={readOnly}
                    onClick={() => patchGeometry({ needs_review: false })}
                  >
                    Mark reviewed / 標記為已確認
                  </Button>
                </div>
              )}
            </>
          )}

          {tab === 'architecture' && (
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
                    Only applies when Qty &gt; 1. / 僅在數量大於 1 時適用。
                  </p>
                )}
              </div>

              {/* The template used to be a third question here. It is not one:
                  the heat path already decides it, and asking twice let the two
                  disagree. Screen 05 is where a template is genuinely chosen. */}
              <div className="rounded-md border border-line bg-surface-muted px-3 py-2 text-[12px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-ink-500">Template / 架構模板</span>
                  <span className="font-semibold text-ink-900">{prep.template_preference}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">
                  Follows the heat path. Screen 05 can override it.
                  <span className="block">由散熱路徑決定，可於 Screen 05 覆寫。</span>
                </p>
              </div>
            </>
          )}

          {tab === 'source' && (
            <>
              <dl className="flex flex-col gap-1.5 text-[12px]">
                {(
                  [
                    ['Imported From / 匯入來源', component.provenance.source_type],
                    [
                      'Original Project / 原始專案',
                      component.provenance.source_project_name ??
                        component.provenance.source_project_id,
                    ],
                    ['Source File / 來源檔案', component.provenance.source_file],
                    [
                      'Last Modified / 最後修改',
                      component.provenance.last_modified_at?.slice(0, 19).replace('T', ' '),
                    ],
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
                <h4 className="mb-1.5 text-[11px] font-bold text-ink-700">
                  Per-field Data Source / 各欄位資料來源
                </h4>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      ['Power / 功耗', component.power_W, 'power_W'],
                      ['Thermal Limit / 溫度上限', spec.limit_C, 'limit_C'],
                      ['Rjc / 接面熱阻', spec.r_jc_C_per_W, 'r_jc_C_per_W'],
                    ] as const
                  )
                    .filter(([, , field]) => !(surfaceReferenced && field === 'r_jc_C_per_W'))
                    .map(([label, sv, field]) => (
                    <div key={field} className="flex items-center justify-between gap-3">
                      <span className="text-[12px] text-ink-500">{label}</span>
                      <Select
                        aria-label={`${label} data source`}
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
                  <h4 className="mb-1.5 text-[11px] font-bold text-ink-700">
                    Preserved Source Fields / 保留的原始欄位
                  </h4>
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
                  Save to Library / 存入元件庫
                </Button>
                {librarySavedAt > 0 && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-1 text-[12px] font-semibold text-ok-600"
                  >
                    <CircleCheck size={14} aria-hidden />
                    Saved to library / 已存入元件庫
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-ink-400">
                The library stores the thermal spec only — base zone, external mapping, graph ids
                and solver results are project-specific and are excluded.
                <span className="block">
                  元件庫只保存熱規格；基座區域、外部映射、節點 ID 與求解結果屬專案專用，不會存入。
                </span>
              </p>
            </>
          )}

          {tab === 'external' && (
            <>
              <div className="flex items-center justify-between">
                <BilingualTooltip zh={tip('External Mapping') ?? ''} align="left">
                  <span className="text-[13px] font-semibold text-ink-900">FloTHERM</span>
                </BilingualTooltip>
                <Badge tone="neutral">
                  {component.external_mappings.flotherm?.mapping_status === 'mapped'
                    ? 'Mapped / 已映射'
                    : 'Not Mapped / 未映射'}
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
                Screen 03 is deferred. Aliases are stored as free text only — nothing is parsed or
                validated against a FloTHERM model yet.
                <span className="mt-1 block">
                  Screen 03 目前延後。此處僅以純文字保存別名，不解析也不驗證 FloTHERM 格式。
                </span>
              </p>
            </>
          )}
        </div>
      </section>

      {/* --- Thermal completeness checklist (04 §23) --- */}
      <section className="rounded-lg border border-line bg-surface">
        <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <BilingualTooltip zh={tip('Completeness') ?? ''} align="left">
            <h3 className="text-[13px] font-bold text-ink-700">Thermal Completeness</h3>
          </BilingualTooltip>
          <span className="tabular text-[13px] font-bold">
            {score.done} / {score.total}
          </span>
        </header>
        <ul className="grid grid-cols-2 gap-x-3 p-3.5">
          {COMPLETENESS_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2 py-[3px] text-[12px]">
              {completeness[item] ? (
                <CircleCheck size={14} className="shrink-0 text-ok-600" aria-hidden />
              ) : (
                <CircleDashed size={14} className="shrink-0 text-ink-400" aria-hidden />
              )}
              <span className={completeness[item] ? 'text-ink-700' : 'text-ink-400'}>
                {item === 'Rjc' && surfaceReferenced ? 'Rjc (N/A)' : item}
                <span className="ml-1 text-ink-400">/ {COMPLETENESS_ITEMS_ZH[item]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {issues.length > 0 && (
        <section className="rounded-lg border border-line bg-surface">
          <header className="border-b border-line px-3.5 py-2.5">
            <h3 className="text-[13px] font-bold text-ink-700">Issues / 待處理項目</h3>
          </header>
          <ul className="flex flex-col gap-1.5 p-3.5">
            {issues.map((issue, index) => {
              const target = issueTarget(issue.field);
              const confirm = target?.confirm ? confirmAction(component, target.confirm) : null;
              return (
                <li key={`${issue.field}-${index}`} className="flex items-start gap-1.5">
                  <span
                    aria-hidden
                    className={issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'}
                  >
                    {issue.severity === 'error' ? '✕' : '⚠'}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* Every issue is a link to the control that fixes it. */}
                    <button
                      type="button"
                      disabled={!target}
                      onClick={() => target && onGoToField(target.tab, target.fieldId)}
                      className={`text-left text-[12px] ${
                        issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'
                      } ${target ? 'hover:underline' : 'cursor-default'}`}
                    >
                      {issue.message}
                      <span className="block text-[11px] text-ink-400">{issue.message_zh}</span>
                    </button>
                    {confirm && !readOnly && (
                      <Button
                        className="mt-1 h-6"
                        onClick={() => onPatch(component.id, confirm.patch, confirm.fields)}
                      >
                        {confirm.label} / {confirm.labelZh}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
