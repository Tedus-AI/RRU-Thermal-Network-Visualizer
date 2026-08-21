/**
 * Component inspector — 04 §13–§21, §27, §33.
 *
 * Six tabs: Overview, Thermal Spec, Geometry, Architecture Prep, Source and
 * External Mapping. Nothing here creates a node or an edge (04 §19, §40).
 *
 * The screen owns the active tab rather than this component, because an issue
 * elsewhere on the page has to be able to open the tab that fixes it. Every
 * editable control carries the DOM id `issueTargets.ts` names for it.
 */

import { useEffect } from 'react';
import { CircleCheck, CircleDashed, Info, Link2, Ruler, Share2, Thermometer } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextArea, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import {
  ARCHITECTURE_TEMPLATES,
  ARCHITECTURE_TEMPLATE_LABELS,
  BASE_ZONES,
  COMPONENT_CATEGORIES,
  HEAT_PATH_LABELS,
  HEAT_PATH_TYPES,
  LIMIT_TYPES,
  LIMIT_TYPE_LABELS,
  PACKAGE_TYPES,
  QTY_MODELS,
  QTY_MODEL_LABELS,
  SOURCE_FACE_LABELS,
  TEMPLATE_FOR_HEAT_PATH,
  componentTotalPowerW,
  sourceAreaMm2,
  spreadAreaMm2,
  type ArchitectureTemplate,
  type BaseZone,
  type Component,
  type ComponentCategory,
  type ComponentGeometry,
  type HeatPathType,
  type LimitType,
  type PackageType,
  type QtyModel,
} from '@/domain/component';
import { withValue, type SourcedValue } from '@/domain/sourcedValue';
import { coinAreaMm2, defaultMaterials, resolveTim } from '@/domain/materials';
import { useProjectStore } from '@/data/projectStore';
import { DATA_SOURCES, type DataSource } from '@/thermal/types';
import {
  COMPLETENESS_ITEMS,
  COMPLETENESS_ITEMS_ZH,
  completenessOf,
  completenessScore,
  validateComponent,
} from '@/domain/componentReadiness';
import { tip } from '@/i18n/componentManagerCopy';
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

/** A SourcedValue editor: number plus its source, so provenance stays visible. */
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
      <div className="flex gap-1.5">
        <NumberInput
          id={id}
          className="flex-1"
          step={step}
          value={value?.value ?? ''}
          placeholder={placeholder}
          disabled={readOnly}
          onChange={(event) =>
            onChange(
              withValue(value, event.target.value === '' ? null : Number(event.target.value)),
            )
          }
        />
        <select
          aria-label={`${label} data source`}
          className="h-9 w-28 rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink-500"
          value={value?.source ?? 'Manual'}
          disabled={readOnly}
          onChange={(event) =>
            onChange({
              value: value?.value ?? null,
              source: event.target.value as DataSource,
              reference: value?.reference,
              confidence: value?.confidence,
              updated_at: new Date().toISOString(),
            })
          }
        >
          {DATA_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </div>
      {value?.value == null && (
        <p className="text-[11px] text-ink-400">
          N/A — unknown is stored as null, never 0. / 未知值以 N/A 保存，不以 0 代替。
        </p>
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
  useFocusField(focus, tab);

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

  const heatPath = spec.heat_path.type;
  const resolvedTim = resolveTim(spec.tim, materials);
  const sourceArea = sourceAreaMm2(spec.geometry);
  const spreadArea = spreadAreaMm2(spec.geometry, heatPath, coinAreaMm2(materials));
  const spreadOrigin =
    spec.geometry.custom_spread_area_mm2 != null || spec.geometry.spread_L_mm != null
      ? 'Stated on this component / 由此元件指定'
      : heatPath === 'Board'
        ? 'Derived: (L + board thickness) × (W + board thickness) / 由 45° 擴散推導'
        : heatPath === 'Coin'
          ? coinAreaMm2(materials) == null
            ? 'Needs the project coin size (Screen 01) / 需先設定專案銅塊尺寸'
            : 'From the project coin size / 取自專案銅塊尺寸'
          : 'No spreading on this path / 此路徑無擴散，等於熱源面';

  const patchPrep = (patch: Partial<Component['architecture_prep']>) =>
    onPatch(component.id, { architecture_prep: { ...prep, ...patch } }, ['architecture_prep']);

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
              <FieldLabel label="Component Name" zh="元件名稱" htmlFor="ins-name" />
              <TextInput
                id="ins-name"
                value={component.name}
                disabled={readOnly}
                onChange={(event) => onPatch(component.id, { name: event.target.value }, ['name'])}
              />

              <div className="grid grid-cols-2 gap-3">
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
              </div>

              <SourcedNumberField
                id="ins-power"
                label="Power per Device"
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

              <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <BilingualTooltip zh={tip('Total Power') ?? ''} align="left">
                    <span className="text-[12px] text-ink-500">Total Power / 總功耗</span>
                  </BilingualTooltip>
                  <span className="tabular text-[14px] font-bold">
                    {componentTotalPowerW(component).toFixed(2)} W
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                  Qty × Power. Not thermal edge heat flow (Q). / 非熱網路邊的熱流 Q。
                </p>
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
                {spec.limit_type_confirmed ? (
                  <p className="text-[11px] text-ink-400">
                    Nothing forces a case-limited part onto Tj.
                    <span className="block">不會強制把殼溫限制的元件轉為 Tj。</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-warn-600">
                    Assumed from category — confirm against the datasheet.
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

              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  label="Package Type"
                  zh="封裝型式"
                  htmlFor="ins-package"
                  tooltip={tip('Package')}
                />
                <Select
                  id="ins-package"
                  options={PACKAGE_TYPES}
                  value={spec.package_type ?? 'Unknown'}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchSpec({ package_type: event.target.value as PackageType }, ['package_type'])
                  }
                />
              </div>

              {/* --- TIM: picked from the project library (04 §18) --- */}
              <fieldset className="rounded-md border border-line p-3">
                <legend className="px-1 text-[12px] font-semibold text-ink-700">
                  TIM / 熱介面材料
                </legend>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel label="Material" zh="材料" htmlFor="ins-tim" tooltip={tip('TIM')} />
                    <Select
                      id="ins-tim"
                      items={[
                        { value: '', label: 'None / 無' },
                        ...materials.tim.map((material) => ({
                          value: material.id,
                          label: `${material.name} — k ${material.k_W_mK.value ?? '?'} W/m·K`,
                        })),
                      ]}
                      value={spec.tim.tim_id ?? ''}
                      disabled={readOnly}
                      onChange={(event) =>
                        patchSpec(
                          { tim: { ...spec.tim, tim_id: event.target.value || null } },
                          ['tim.tim_id'],
                        )
                      }
                    />
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      Materials are defined once for the project, in Screen 01. This picks one.
                      <span className="block">材料在 Screen 01 統一建立，這裡只是選用。</span>
                    </p>
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

                  <SourcedNumberField
                    id="ins-blt"
                    label="Bond Line (BLT)"
                    zh="壓合厚度"
                    unit="mm"
                    value={spec.tim.blt_mm}
                    placeholder={
                      resolvedTim.thickness_mm == null
                        ? '—'
                        : `${resolvedTim.thickness_mm} (from material)`
                    }
                    step="0.01"
                    readOnly={readOnly || spec.tim.tim_id == null}
                    onChange={(next) => patchSpec({ tim: { ...spec.tim, blt_mm: next } }, ['tim'])}
                  />
                  <p className="text-[11px] leading-relaxed text-ink-400">
                    Bond line is a build outcome, not a material property — the same material ends
                    up thinner under screws than under a clip. Leave it empty to use the material's
                    default; k always comes from the material.
                    <span className="block">
                      壓合厚度取決於組裝方式而非材料本身，故可個別覆寫；留空則沿用材料預設。k
                      一律取自材料。
                    </span>
                  </p>
                  <p className="text-[11px] leading-relaxed text-ink-400">
                    Specifying a TIM does not create a thermal edge — Screen 05 decides that.
                    <span className="block">指定 TIM 不代表建立獨立 Edge，由 Screen 05 決定。</span>
                  </p>
                </div>
              </fieldset>

              {/* --- Heat path (04 §17) --- */}
              <fieldset className="rounded-md border border-line p-3">
                <legend className="px-1 text-[12px] font-semibold text-ink-700">
                  Heat Path / 主要散熱路徑
                </legend>
                <div className="flex flex-col gap-3">
                  <Select
                    id="ins-heat-path"
                    aria-label="Heat path type"
                    items={HEAT_PATH_TYPES.map((type) => ({
                      value: type,
                      label: `${HEAT_PATH_LABELS[type].en} / ${HEAT_PATH_LABELS[type].zh}`,
                    }))}
                    value={heatPath}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchSpec(
                        {
                          heat_path: {
                            ...spec.heat_path,
                            type: event.target.value as HeatPathType,
                          },
                          // Picking a path IS the confirmation.
                          heat_path_confirmed: true,
                        },
                        ['heat_path.type'],
                      )
                    }
                  />
                  {spec.heat_path_confirmed ? (
                    <p className="text-[11px] text-ink-400">
                      Suggests the {ARCHITECTURE_TEMPLATE_LABELS[TEMPLATE_FOR_HEAT_PATH[heatPath]]}{' '}
                      template. Picking a path does not build topology — Screen 05 does.
                      <span className="block">
                        建議套用「{ARCHITECTURE_TEMPLATE_LABELS[TEMPLATE_FOR_HEAT_PATH[heatPath]]}
                        」模板。選擇路徑不會建立 Node/Edge，那是 Screen 05 的工作。
                      </span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-warn-600">
                      Assumed from category — it selects the whole resistance chain, so confirm it.
                      <span className="block">依類別推定，它決定整條熱阻鏈，請確認。</span>
                    </p>
                  )}

                  {heatPath === 'Board' && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {(
                        [
                          ['effective_k_W_mK', 'Effective k', '等效導熱係數'],
                          ['via_efficiency', 'Via Efficiency', 'Via 效率'],
                          ['via_count', 'Via Count', 'Via 數量'],
                          ['via_id_mm', 'Via ID', 'Via 內徑'],
                        ] as const
                      ).map(([key, label, zh]) => (
                        <div key={key} className="flex flex-col gap-1.5">
                          <FieldLabel label={label} zh={zh} htmlFor={`hp-${key}`} />
                          <NumberInput
                            id={`hp-${key}`}
                            step="any"
                            value={(spec.heat_path.parameters[key] as number) ?? ''}
                            placeholder="—"
                            disabled={readOnly}
                            onChange={(event) =>
                              patchSpec(
                                {
                                  heat_path: {
                                    ...spec.heat_path,
                                    parameters: {
                                      ...spec.heat_path.parameters,
                                      [key]:
                                        event.target.value === ''
                                          ? null
                                          : Number(event.target.value),
                                    },
                                  },
                                },
                                ['heat_path'],
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Dimensions all live on the Geometry tab, so this one stays about
                  the thermal chain: limit, Rjc, package, TIM, path. */}
              <p className="rounded-md border border-line bg-surface-muted p-2.5 text-[11px] leading-relaxed text-ink-500">
                Face sizes, thicknesses and the resulting areas are on the Geometry tab.
                <span className="block">熱源面 / 擴散面尺寸、厚度與面積在「Geometry 幾何」分頁。</span>
              </p>
            </>
          )}

          {tab === 'geometry' && (
            <>
              {/* Package envelope. It feeds no resistance on its own, but it is
                  validated, so it needs somewhere to be corrected. */}
              <div className="grid grid-cols-3 gap-2.5">
                <GeometryField
                  label="Package L"
                  zh="封裝長"
                  field="package_L_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label="Package W"
                  zh="封裝寬"
                  field="package_W_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label="Package H"
                  zh="封裝高"
                  field="package_H_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
              </div>

              {/* Source face — one measurement, named for the path it serves. */}
              <div className="grid grid-cols-2 gap-2.5">
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
              </div>

              <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <BilingualTooltip zh={tip('Source Area') ?? ''} align="left">
                    <span className="text-[12px] text-ink-500">Source Area / 熱源面積</span>
                  </BilingualTooltip>
                  <span className="tabular text-[13px] font-bold">
                    {sourceArea == null ? '—' : `${sourceArea.toFixed(1)} mm²`}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <BilingualTooltip zh={tip('Spread Area') ?? ''} align="left">
                    <span className="text-[12px] text-ink-500">Spread Area / 擴散面積</span>
                  </BilingualTooltip>
                  <span className="tabular text-[13px] font-bold">
                    {spreadArea == null ? '—' : `${spreadArea.toFixed(1)} mm²`}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">{spreadOrigin}</p>
              </div>

              {/* Spread face — blank means derived, so it is optional by design. */}
              <div className="grid grid-cols-2 gap-2.5">
                <GeometryField
                  label="Spread L"
                  zh="擴散面長"
                  field="spread_L_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label="Spread W"
                  zh="擴散面寬"
                  field="spread_W_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label="Custom Source Area"
                  zh="自訂熱源面積 (mm²)"
                  field="custom_source_area_mm2"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
                <GeometryField
                  label="Custom Spread Area"
                  zh="自訂擴散面積 (mm²)"
                  field="custom_spread_area_mm2"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
              </div>

              {/* Only the thickness this path actually conducts through. */}
              {heatPath === 'Coin' && (
                <GeometryField
                  label="Coin Thickness"
                  zh="銅塊厚度"
                  field="coin_thickness_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
              )}
              {heatPath === 'Board' && (
                <GeometryField
                  label="Board Thickness"
                  zh="板厚"
                  field="board_thickness_mm"
                  geometry={spec.geometry}
                  readOnly={readOnly}
                  onChange={patchGeometry}
                />
              )}

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
                  label="Architecture Template Preference"
                  zh="架構模板偏好"
                  htmlFor="ins-template"
                  tooltip={tip('Architecture Template Preference')}
                />
                <select
                  id="ins-template"
                  className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px]"
                  value={prep.template_preference}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchPrep({ template_preference: event.target.value as ArchitectureTemplate })
                  }
                >
                  {ARCHITECTURE_TEMPLATES.map((template) => (
                    <option key={template} value={template}>
                      {ARCHITECTURE_TEMPLATE_LABELS[template]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  label="Preferred Base Zone"
                  zh="偏好基座區域"
                  htmlFor="ins-zone"
                  tooltip={tip('Preferred Base Zone')}
                />
                <Select
                  id="ins-zone"
                  options={BASE_ZONES}
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
                <select
                  id="ins-qtymodel"
                  className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px]"
                  value={prep.qty_model_preference}
                  disabled={readOnly || component.qty <= 1}
                  onChange={(event) =>
                    patchPrep({ qty_model_preference: event.target.value as QtyModel })
                  }
                >
                  {QTY_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {QTY_MODEL_LABELS[model]}
                    </option>
                  ))}
                </select>
                {component.qty <= 1 && (
                  <p className="text-[11px] text-ink-400">
                    Only applies when Qty &gt; 1. / 僅在數量大於 1 時適用。
                  </p>
                )}
              </div>

              {/* 04 §19 / AC-04-12/13/14 — the whole point of this tab. */}
              <p className="rounded-md border border-accent-600/25 bg-accent-50 p-2.5 text-[11px] leading-relaxed text-accent-700">
                These are modelling preferences only. No thermal nodes, edges or base-zone nodes are
                created by this screen — Screen 05 Thermal Path Builder does that.
                <span className="mt-0.5 block">
                  以上僅為建模偏好，本頁不會建立任何 Node、Edge 或基座節點；實際拓樸由 Screen 05
                  建立。
                </span>
              </p>
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
                        component.provenance.source_project_id ??
                        '—',
                    ],
                    ['Source File / 來源檔案', component.provenance.source_file ?? '—'],
                    [
                      'Import Date / 匯入時間',
                      component.provenance.imported_at?.slice(0, 19).replace('T', ' ') ?? '—',
                    ],
                    [
                      'Last Modified / 最後修改',
                      component.provenance.last_modified_at?.slice(0, 19).replace('T', ' ') ?? '—',
                    ],
                    ['Lineage / 原始追溯', component.provenance.ref_origin_id ?? '—'],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="text-right font-medium text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="border-t border-line pt-2.5">
                <h4 className="mb-1.5 text-[11px] font-bold text-ink-700">
                  Per-field Data Source / 各欄位資料來源
                </h4>
                <dl className="flex flex-col gap-1 text-[12px]">
                  {(
                    [
                      ['Power', component.power_W],
                      ['Thermal Limit', spec.limit_C],
                      ['Rjc', spec.r_jc_C_per_W],
                    ] as const
                  ).map(([label, sv]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-ink-500">{label}</dt>
                      <dd className="text-right">
                        <span className="font-medium text-ink-900">{sv?.source ?? '—'}</span>
                        {sv?.confidence && (
                          <span className="ml-1.5 text-[11px] text-ink-400">{sv.confidence}</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
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

              <Button disabled={readOnly} onClick={() => onSaveToLibrary(component)}>
                Save to Library / 存入元件庫
              </Button>
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
                validated against a FloTHERM model yet. Parser integration will be added after the
                core analytical workflow is complete.
                <span className="mt-1 block">
                  Screen 03 目前延後。此處僅以純文字保存別名，不解析也不驗證 FloTHERM
                  格式；待解析流程完成後再回補。
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
        <ul className="p-3.5">
          {COMPLETENESS_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2 py-[3px] text-[12px]">
              {completeness[item] ? (
                <CircleCheck size={14} className="shrink-0 text-ok-600" aria-hidden />
              ) : (
                <CircleDashed size={14} className="shrink-0 text-ink-400" aria-hidden />
              )}
              <span className={completeness[item] ? 'text-ink-700' : 'text-ink-400'}>
                {item}
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
                    className={
                      issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'
                    }
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
