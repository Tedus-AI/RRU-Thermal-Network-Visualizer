/**
 * Screen 06 boundary setup.
 *
 * A dissipating surface gets one continuous setup flow: profile selection,
 * required parameters, applicable pre-solve previews and inline checks. The
 * ambient placeholder is different: it is a non-dissipating temperature
 * reference owned by Screen 01 Scenario Settings, so it gets a compact summary and
 * never creates a second temperature profile.
 *
 * The sections it is assembled from are in `BoundaryInspectorPanels.tsx`, and
 * the static field tables in `boundaryInspectorFields.ts`.
 *
 * SCREEN 03 RE-ENABLEMENT NOTE:
 * FloTHERM aliases and external-mapping metadata remain in the domain schema.
 * Their editor stays hidden while Screen 03 is deferred. When Screen 03 gains
 * a real import contract and parser, restore mapping controls for both ambient
 * references and dissipating ports, then add cross-screen import tests.
 */

import { useEffect, useState } from 'react';
import { Thermometer, Trash2 } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { Bi, FieldLabel, biTitle } from '@/ui/FieldLabel';
import { dataSourceItemsZh } from '@/ui/dataSourceLabels';

import {
  BOUNDARY_TYPE_LABELS,
  type BoundaryConditionProfile,
  type BoundaryConditionType,
  type BoundaryDataSource,
  type BoundaryDerivedPreview,
  type BoundaryPort,
  type BoundaryValidationState,
} from '@/thermal/boundary/types';
import type { Confidence } from '@/thermal/types';
import {
  FIN_GEOMETRY_KEYS,
  PLATE_GEOMETRY_KEYS,
  finArrayOf,
  plateConvectionOf,
  usesFinGeometry,
  usesPlateGeometry,
} from '@/thermal/boundary/calculations';
import { isFinnedSurfacePort } from '@/thermal/boundary/boundaryPorts';
import type { SurfaceAssumptionCheck } from '@/thermal/boundary/assumptionCheck';
import {
  RETIRED_DIE_CAST_DEFAULT_K_W_mK,
  defaultFinConductivity,
  type FinTechnology,
} from '@/thermal/boundary/finArray';

import { T06 } from './tooltips';
import { PORT_STATUS_LABELS, formatNumber, type PortStatus } from './boundaryViewModel';
import {
  FIN_CAPABLE_TYPES,
  FIN_DERIVED_PARAMETER_KEYS,
  SOURCES,
  TYPE_PARAMETERS,
  TYPE_REQUIREMENT,
} from './boundaryInspectorFields';
import {
  AmbientReferenceSummary,
  ApplicablePreview,
  FinGeometryPanel,
  InlineChecks,
  PlateGeometryPanel,
  Row,
} from './BoundaryInspectorPanels';

export function BoundaryInspector({
  port,
  status,
  assumptionCheck,
  profiles,
  preferredProfileId,
  preview,
  validation,
  ambientTemperature_C,
  solarEnabled,
  heatSinkBase,
  readOnly,
  onEditAmbient,
  onUpsertProfile,
  onRemoveProfile,
  onAddProfile,
}: {
  port: BoundaryPort;
  status: PortStatus;
  /** Live check of this port's surface assumption against Screen 07's solve. */
  assumptionCheck?: SurfaceAssumptionCheck | null;
  profiles: BoundaryConditionProfile[];
  preferredProfileId?: string | null;
  preview: BoundaryDerivedPreview | undefined;
  validation: BoundaryValidationState;
  ambientTemperature_C: number | null;
  solarEnabled: boolean;
  /** Screen 01's heat sink base, used to seed a fin-geometry profile. */
  heatSinkBase?: { L_mm: number | null; W_mm: number | null; k_W_mK?: number | null } | null;
  readOnly: boolean;
  onEditAmbient: () => void;
  onUpsertProfile: (profile: BoundaryConditionProfile) => void;
  onRemoveProfile: (profileId: string) => void;
  onAddProfile: (type: BoundaryConditionType) => void;
}) {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    preferredProfileId ?? null,
  );

  useEffect(() => {
    if (preferredProfileId) setActiveProfileId(preferredProfileId);
  }, [preferredProfileId]);
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
  const solarProfileInactive = activeProfile?.type === 'solar_load' && !solarEnabled;

  if (!port.dissipating) {
    return (
      <AmbientReferenceSummary
        port={port}
        status={status}
        ambientTemperature_C={ambientTemperature_C}
        onEditAmbient={onEditAmbient}
      />
    );
  }

  const activeProfileIds = new Set(profiles.map((profile) => profile.id));
  const allMessages = [...validation.errors, ...validation.warnings, ...validation.infos];
  const portMessages = [...new Map(
    allMessages
      .filter(
        (entry) =>
          entry.boundary_port_id === port.id ||
          (entry.profile_id != null && activeProfileIds.has(entry.profile_id)),
      )
      .map((entry) => [entry.id, entry]),
  ).values()];

  const patchProfile = (patch: Partial<BoundaryConditionProfile>) => {
    if (!activeProfile) return;
    onUpsertProfile({ ...activeProfile, ...patch });
  };

  const patchParameter = (key: string, value: number | string | boolean | null) => {
    if (!activeProfile) return;
    onUpsertProfile({
      ...activeProfile,
      parameters: { ...activeProfile.parameters, [key]: value },
    });
  };

  const patchParameters = (patch: BoundaryConditionProfile['parameters']) => {
    if (!activeProfile) return;
    onUpsertProfile({
      ...activeProfile,
      parameters: { ...activeProfile.parameters, ...patch },
    });
  };

  /**
   * Switches a surface between "state h and an area" and "state the fin
   * geometry".
   *
   * The mode is its own flag rather than the presence of a fin height. Deriving
   * it from the height made that one field behave unlike every other number on
   * the screen: clearing it to retype switched the mode off mid-edit, and
   * toggling off then on again wiped the value instead of restoring it.
   *
   * Turning geometry ON seeds only what the project already knows — the base
   * from Screen 01, the conductivity from the process. The fin dimensions are
   * left blank, because a seeded 0 is a measurement nobody took, and the derived
   * panel says the geometry is incomplete until they are filled in.
   *
   * Turning it OFF keeps every dimension, so a mis-click costs one click rather
   * than five retyped numbers.
   */
  const setFinGeometryEnabled = (enabled: boolean) => {
    if (!activeProfile) return;
    if (!enabled) {
      patchParameter(FIN_GEOMETRY_KEYS.enabled, false);
      return;
    }
    const p = activeProfile.parameters;
    const technology =
      typeof p[FIN_GEOMETRY_KEYS.technology] === 'string'
        ? (p[FIN_GEOMETRY_KEYS.technology] as FinTechnology)
        : 'Embedded';
    patchParameters({
      [FIN_GEOMETRY_KEYS.enabled]: true,
      [FIN_GEOMETRY_KEYS.technology]: technology,
      ...(p[FIN_GEOMETRY_KEYS.baseLength] == null && heatSinkBase?.L_mm != null
        ? { [FIN_GEOMETRY_KEYS.baseLength]: heatSinkBase.L_mm }
        : {}),
      ...(p[FIN_GEOMETRY_KEYS.baseWidth] == null && heatSinkBase?.W_mm != null
        ? { [FIN_GEOMETRY_KEYS.baseWidth]: heatSinkBase.W_mm }
        : {}),
      ...(p[FIN_GEOMETRY_KEYS.conductivity] == null
        ? {
            [FIN_GEOMETRY_KEYS.conductivity]: defaultFinConductivity(
              technology,
              heatSinkBase?.k_W_mK,
            ),
          }
        : {}),
    });
  };

  /**
   * Changes the fin process, and with it a conductivity that was only ever the
   * old process's default.
   *
   * Two separate `patchParameter` calls would each start from the same stale
   * profile and the second would undo the first, so both keys go in one patch.
   * A conductivity someone typed is theirs and stays; one still equal to the
   * previous process's default (or to the retired 160 die-cast default) was
   * seeded, and follows the process it was seeded for.
   */
  const setFinTechnology = (next: FinTechnology) => {
    if (!activeProfile) return;
    const p = activeProfile.parameters;
    const previous: FinTechnology =
      p[FIN_GEOMETRY_KEYS.technology] === 'DieCasting' ? 'DieCasting' : 'Embedded';
    const storedK = p[FIN_GEOMETRY_KEYS.conductivity];
    const seeded =
      storedK == null ||
      storedK === defaultFinConductivity(previous, heatSinkBase?.k_W_mK) ||
      (previous === 'DieCasting' && storedK === RETIRED_DIE_CAST_DEFAULT_K_W_mK);
    patchParameters({
      [FIN_GEOMETRY_KEYS.technology]: next,
      ...(seeded
        ? { [FIN_GEOMETRY_KEYS.conductivity]: defaultFinConductivity(next, heatSinkBase?.k_W_mK) }
        : {}),
    });
  };

  // A fin stack has no honest h of its own, so on a finned port the geometry is
  // the only description offered and the toggle is not shown at all. A flat
  // exposed wall keeps both modes: there, a stated h and area IS the right
  // description, and nothing about it has to be invented.
  const finGeometryForced = isFinnedSurfacePort(port);
  const setPlateGeometryEnabled = (enabled: boolean) => {
    if (!activeProfile) return;
    // Seeds nothing. Unlike a fin array's base, a plate's characteristic length
    // is not a dimension the project already holds — it is which way this
    // particular surface faces and how far the plume runs along it, and only
    // the person looking at the drawing knows that.
    patchParameters({
      [PLATE_GEOMETRY_KEYS.enabled]: enabled,
      ...(enabled && activeProfile.parameters[PLATE_GEOMETRY_KEYS.orientation] == null
        ? { [PLATE_GEOMETRY_KEYS.orientation]: 'Vertical' }
        : {}),
    });
  };

  const finGeometryActive = activeProfile != null && usesFinGeometry(activeProfile, port);
  const finResult = activeProfile != null ? finArrayOf(activeProfile, port) : null;
  const finCapable = activeProfile != null && FIN_CAPABLE_TYPES.has(activeProfile.type);
  const plateGeometryActive = activeProfile != null && usesPlateGeometry(activeProfile);
  const plateResult =
    activeProfile != null ? plateConvectionOf(activeProfile, ambientTemperature_C) : null;
  const finPanelShown = finCapable && (finGeometryForced || finGeometryActive);
  /** Saved before the geometry mode existed, and still what the solve uses. */
  const legacyManualInUse = finCapable && finGeometryForced && !finGeometryActive;

  const statusLabel = PORT_STATUS_LABELS[status];

  return (
    <div className="flex min-h-0 flex-col">
      <header className="border-b border-line px-3.5 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-ink-900" title={port.name}>
              {port.name}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-500">
              Boundary Setup / 邊界條件設定
            </p>
          </div>
          <Badge tone={statusLabel.tone as 'ok'}>{statusLabel.label}</Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <section>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-ink-700">
              Boundary Profiles <span className="font-normal text-ink-400">/ 邊界條件</span>
            </p>
            <span className="text-[10px] text-ink-400">{profiles.length} assigned / 已指派</span>
          </div>

          <ul className="mt-1 flex flex-col gap-1">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                  activeProfile?.id === profile.id
                    ? 'border-accent-500 bg-accent-100'
                    : 'border-line hover:bg-surface-muted'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveProfileId(profile.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[11px] font-semibold text-ink-900">
                    {BOUNDARY_TYPE_LABELS[profile.type].label}
                    <span className="font-normal text-ink-400"> / {BOUNDARY_TYPE_LABELS[profile.type].zh}</span>
                    {profile.type === 'solar_load' && !solarEnabled && (
                      <span className="ml-1 font-semibold text-ink-400">（停用）</span>
                    )}
                  </span>
                  <span className="block truncate text-[10px] text-ink-400">{profile.name}</span>
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  title={biTitle('Remove profile', '移除此條件')}
                  aria-label={biTitle(`Remove ${profile.name}`, '移除此條件')}
                  onClick={() => onRemoveProfile(profile.id)}
                  className="shrink-0 text-ink-400 hover:text-danger-600 disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {profiles.length === 0 && (
              <li className="rounded border border-dashed border-line-strong px-2 py-3 text-center text-[11px] text-ink-400">
                <Bi
                  en="No boundary condition assigned. Add the physical heat-rejection mode below."
                  zh="尚未指定邊界條件，請在下方新增實際散熱方式。"
                  inline
                />
              </li>
            )}
          </ul>

          <div className="mt-2">
            <FieldLabel
              label="Add Boundary Type"
              zh="新增邊界型別"
              htmlFor="bc-add-type"
              tooltip={T06.field.boundaryType}
            />
            <Select
              id="bc-add-type"
              className="mt-1 h-8 !text-[12px]"
              value=""
              disabled={readOnly}
              items={[
                { value: '', label: '— Select a boundary type —' },
                ...port.allowed_boundary_types
                  .filter(
                    (type) =>
                      type !== 'ambient_reservoir' &&
                      type !== 'external_cfd_placeholder' &&
                      (solarEnabled || type !== 'solar_load'),
                  )
                  .map((type) => ({
                    value: type,
                    label: `${BOUNDARY_TYPE_LABELS[type].label} / ${BOUNDARY_TYPE_LABELS[type].zh}`,
                  })),
              ]}
              onChange={(event) => {
                if (!event.target.value) return;
                onAddProfile(event.target.value as BoundaryConditionType);
              }}
            />
          </div>
        </section>

        {activeProfile && (
          <section className="mt-3 border-t border-line pt-3">
            <p className="mb-1.5 text-[11px] font-bold text-ink-700">
              Required Inputs <span className="font-normal text-ink-400">/ 必要輸入</span>
            </p>
            {solarProfileInactive ? (
              <p className="mb-2 rounded border border-line bg-surface-muted p-2 text-[10px] leading-relaxed text-ink-500">
                Solar load is 0 W/m² in Screen 01. This profile and its saved setup are retained but
                do not participate in validation, preview or the Screen 07 heat load.
                <span className="block text-ink-400">
                  SCR01 日照負載為 0 W/m²；此 profile 與既有設定會保留，但不參與驗證、預覽或
                  Screen 07 熱負載。
                </span>
              </p>
            ) : (
              <>
                <p className="mb-2 rounded border border-line bg-surface-muted p-2 text-[10px] leading-relaxed text-ink-500">
                  {TYPE_REQUIREMENT[activeProfile.type].en}
                  <span className="block text-ink-400">{TYPE_REQUIREMENT[activeProfile.type].zh}</span>
                </p>

                {finCapable && finGeometryForced && (
                  <p className="mb-2 rounded-md border border-line bg-surface-muted p-2 text-[11px] leading-relaxed">
                    <span className="font-bold text-ink-800">
                      Described as a fin array / 以鰭片幾何描述
                    </span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">
                      鰭片表面沒有可獨立成立的 h：對流係數由通道間距與鰭片高度決定，散熱面積由鰭片數決定，
                      鰭片效率又折扣其中一部分。這四個數字要等幾何存在才存在，所以此表面只以幾何描述。
                    </span>
                  </p>
                )}

                {finCapable && !finGeometryForced && (
                  <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-md border border-line bg-surface-muted p-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                      checked={finGeometryActive}
                      disabled={readOnly}
                      onChange={(event) => setFinGeometryEnabled(event.target.checked)}
                    />
                    <span className="text-[11px] leading-relaxed">
                      <span className="font-bold text-ink-800">
                        Describe as a fin array / 以鰭片幾何描述
                      </span>
                      <span className="mt-0.5 block text-[10px] text-ink-400">
                        h、輻射項、鰭片效率與散熱面積由幾何算出，不需手動填寫或從其他工具抄寫。
                      </span>
                    </span>
                  </label>
                )}

                {/* A flat wall states its own area, emissivity and view factor
                    — those are real properties of it. Only `h` is offered as a
                    computed value, because it is the one nobody can state. */}
                {finCapable && !finGeometryForced && !finGeometryActive && (
                  <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-md border border-line bg-surface-muted p-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                      checked={plateGeometryActive}
                      disabled={readOnly}
                      onChange={(event) => setPlateGeometryEnabled(event.target.checked)}
                    />
                    <span className="text-[11px] leading-relaxed">
                      <span className="font-bold text-ink-800">
                        Compute h from the plate / 由平板幾何計算 h
                      </span>
                      <span className="mt-0.5 block text-[10px] text-ink-400">
                        自然對流係數由特徵長度、方位與表面溫度假設算出（Churchill–Chu 等標準關聯式）。
                        面積、發射率、視角因子仍由你填 —— 平面表面的這三項是可以量、可以畫的。
                      </span>
                    </span>
                  </label>
                )}

                {plateGeometryActive && !finGeometryActive && (
                  <PlateGeometryPanel
                    profile={activeProfile}
                    result={plateResult}
                    ambientTemperature_C={ambientTemperature_C}
                    readOnly={readOnly}
                    onPatch={patchParameter}
                  />
                )}

                {/* On a finned port the panel is always here, even while a
                    stored h is still doing the solving. Showing the notice
                    without the fields it refers to would be a claim the screen
                    does not back up. */}
                {finPanelShown && (
                  <FinGeometryPanel
                    profile={activeProfile}
                    result={finResult}
                    readOnly={readOnly}
                    onPatch={patchParameter}
                    onTechnologyChange={setFinTechnology}
                  />
                )}

                {/* Named rather than silently replaced. The stored numbers were
                    solved with, so they are reported as what is still in force
                    — but not offered for editing, because editing them would be
                    extending a description this surface is not supposed to
                    have. Completing the geometry above retires them. */}
                {legacyManualInUse && (
                  <p className="mb-2 rounded-md border border-warn-500/40 bg-warn-100/40 p-2 text-[11px] leading-relaxed text-warn-600">
                    <span className="font-bold">
                      Still solving from a stored h / 目前仍以先前輸入的 h 求解
                    </span>
                    <span className="mt-0.5 block text-[10px]">
                      此表面在鰭片幾何存在之前就已設定，目前仍使用 h ={' '}
                      {formatNumber(activeProfile.parameters.h_W_m2K as number | null, 2)} W/m²K、面積 ={' '}
                      {formatNumber(
                        (activeProfile.parameters.area_m2 as number | null) ?? port.area_m2,
                        3,
                      )}{' '}
                      m²。改以另一套模型重新解讀這些數字並不比留著它們誠實，所以它們維持有效，
                      直到上方幾何填齊後由幾何取代。
                    </span>
                  </p>
                )}

                {(finPanelShown
                  ? TYPE_PARAMETERS[activeProfile.type].filter(
                      (parameter) => !FIN_DERIVED_PARAMETER_KEYS.has(parameter.key),
                    )
                  : plateGeometryActive
                    ? TYPE_PARAMETERS[activeProfile.type].filter(
                        (parameter) => parameter.key !== 'h_W_m2K',
                      )
                    : TYPE_PARAMETERS[activeProfile.type]
                ).map((parameter) => {
                  const inheritedOwner =
                    parameter.key === 'irradiance_W_m2'
                      ? 'SCR01 情境設定'
                      : parameter.key === 'emissivity' || parameter.key === 'absorptivity'
                        ? '表面性質'
                        : (parameter.key === 'area_m2' || parameter.key === 'receivingArea_m2') &&
                            port.area_m2 != null
                          ? 'SCR04/05 邊界幾何'
                          : null;
                  const value = activeProfile.parameters[parameter.key];
                  return (
                    <div key={parameter.key} className="mb-2">
                      <FieldLabel
                        label={parameter.label}
                        zh={parameter.zh}
                        unit={parameter.unit || undefined}
                        htmlFor={`bc-param-${parameter.key}`}
                        tooltip={parameter.tip}
                        required={parameter.key !== 'surfaceReferenceTemperatureGuess_C'}
                      />
                      {inheritedOwner ? (
                        <div
                          id={`bc-param-${parameter.key}`}
                          className="mt-1 flex h-8 items-center justify-between rounded-md border border-line bg-surface-muted px-2.5 text-[11px] text-ink-700"
                        >
                          <span className="font-semibold tabular">
                            {typeof value === 'number' ? value : 'N/A'}
                          </span>
                          <span className="text-[10px] text-ink-400">
                            由{inheritedOwner}同步
                          </span>
                        </div>
                      ) : (
                        <NumberInput
                          id={`bc-param-${parameter.key}`}
                          className="mt-1 h-8 !text-[12px]"
                          step="any"
                          max={parameter.max}
                          value={typeof value === 'number' ? value : ''}
                          disabled={readOnly}
                          onChange={(event) =>
                            patchParameter(
                              parameter.key,
                              event.target.value === '' ? null : Number(event.target.value),
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {activeProfile.type === 'adiabatic_symmetry' && (
              <div className="mb-2">
                <FieldLabel
                  label="Reason (optional)"
                  zh="理由（選填）"
                  htmlFor="bc-adiabatic-reason"
                  tooltip={T06.field.adiabaticReason}
                />
                <TextInput
                  id="bc-adiabatic-reason"
                  className="mt-1 h-8 !text-[12px]"
                  placeholder="e.g. symmetry plane / 例如：對稱面"
                  value={(activeProfile.parameters.reason as string) ?? ''}
                  disabled={readOnly}
                  onChange={(event) => patchParameter('reason', event.target.value)}
                />
              </div>
            )}

            {activeProfile.type === 'external_cfd_placeholder' && (
              <p className="rounded border border-warn-500/40 bg-warn-100 p-2 text-[10px] leading-relaxed text-warn-600">
                Screen 03 is deferred. This placeholder does not import CFD data or affect the solver.
                <span className="block">Screen 03 尚未完成，此佔位不會匯入 CFD 資料，也不影響求解。</span>
              </p>
            )}

            {!solarProfileInactive && (
              <ApplicablePreview
                preview={preview}
                activeProfile={activeProfile}
                assumptionCheck={assumptionCheck}
                readOnly={readOnly}
                onApplySolvedSurface={(surface_C) => {
                  // The profile that OWNS the assumption, which is not
                  // necessarily the tab that happens to be open. Writing to the
                  // open one put the temperature on a profile that never reads
                  // it and left the real assumption exactly as it was.
                  const owner =
                    profiles.find((entry) => entry.id === assumptionCheck?.profile_id) ?? null;
                  if (!owner) return;
                  onUpsertProfile({
                    ...owner,
                    parameters: {
                      ...owner.parameters,
                      surfaceReferenceTemperatureGuess_C: surface_C,
                    },
                    // What gets written is a STATED input the engineer chose,
                    // not a solved value the set carries around: the source
                    // says so, and Screen 07 will re-solve from it.
                    source: 'manual',
                  });
                }}
              />
            )}

            <details className="mt-3 rounded border border-line bg-surface-muted px-2.5 py-2 text-[10px] text-ink-500">
              <summary className="cursor-pointer font-semibold text-ink-600">
                Advanced Details / 進階資訊
              </summary>
              <div className="mt-2">
                <FieldLabel label="Profile Name" zh="條件名稱" htmlFor="bc-profile-name" />
                <TextInput
                  id="bc-profile-name"
                  className="mt-1 mb-2 h-8 !text-[12px]"
                  value={activeProfile.name}
                  disabled={readOnly}
                  onChange={(event) => patchProfile({ name: event.target.value })}
                />

                <FieldLabel
                  label="Data Source"
                  zh="資料來源"
                  htmlFor="bc-profile-source"
                  tooltip={T06.field.dataSource}
                />
                <Select
                  id="bc-profile-source"
                  className="mt-1 mb-2 h-8 !text-[12px]"
                  value={activeProfile.source}
                  disabled={readOnly}
                  items={dataSourceItemsZh(SOURCES)}
                  onChange={(event) =>
                    patchProfile({ source: event.target.value as BoundaryDataSource })
                  }
                />

                <FieldLabel
                  label="Confidence"
                  zh="信心度"
                  htmlFor="bc-profile-confidence"
                  tooltip={T06.field.confidence}
                />
                <Select
                  id="bc-profile-confidence"
                  className="mt-1 mb-2 h-8 !text-[12px]"
                  value={activeProfile.confidence}
                  disabled={readOnly}
                  options={['high', 'medium', 'low']}
                  onChange={(event) =>
                    patchProfile({ confidence: event.target.value as Confidence })
                  }
                />

                <FieldLabel label="Reference" zh="依據" htmlFor="bc-profile-reference" />
                <TextInput
                  id="bc-profile-reference"
                  className="mt-1 mb-2 h-8 !text-[12px]"
                  placeholder="e.g. wind tunnel report rev B"
                  value={activeProfile.provenance?.reference ?? ''}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchProfile({
                      provenance: {
                        source_label:
                          activeProfile.provenance?.source_label ?? 'Thermal engineer input',
                        reference: event.target.value,
                      },
                    })
                  }
                />

                <Row label="Representation" zh="求解表示">
                  <span title={T06.field.representation}>{activeProfile.representation}</span>
                </Row>
                <Row label="Boundary Port">{port.id}</Row>
                <Row label="Connected Node">{port.connected_node_id}</Row>
                <Row label="Surface Group">{port.surface_group_id}</Row>
                <Row label="Orientation" zh="方位">{port.orientation}</Row>
                <Row label="Topology Area" zh="拓撲面積">
                  {port.area_m2 == null
                    ? 'Not provided'
                    : port.area_m2 < 0.01
                      ? `${port.area_m2.toFixed(6)} m² (${(port.area_m2 * 1_000_000).toFixed(1)} mm²)`
                      : formatNumber(port.area_m2, 3, 'm²')}
                </Row>
              </div>
            </details>
          </section>
        )}

        <section className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 text-[11px] font-bold text-ink-700">
            Validation <span className="font-normal text-ink-400">/ 驗證</span>
          </p>
          <InlineChecks messages={portMessages} />
        </section>
      </div>
    </div>
  );
}

/** Shown when nothing on the canvas is selected. */
export function BoundaryInspectorEmpty() {
  return (
    <div className="p-6 text-center">
      <Thermometer size={22} className="mx-auto mb-2 text-ink-400" />
      <p className="text-[13px] font-semibold text-ink-700">Nothing selected</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
        Select a boundary port on the canvas or in the list to edit its scenario boundary
        conditions.
        <span className="block">請於畫布或清單選擇邊界端口，以編輯此情境的邊界條件。</span>
      </p>
    </div>
  );
}

export function AddProfileButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      className="h-8"
      disabled={disabled}
      title={biTitle('Apply to similar surfaces', '套用到相似表面')}
      onClick={onClick}
    >
      Apply to Similar
    </Button>
  );
}
