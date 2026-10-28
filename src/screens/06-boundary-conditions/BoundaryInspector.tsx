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
import { Trash2 } from 'lucide-react';

import { Badge, NumberInput, Select, TextInput } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
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
  DEFAULT_SURFACE_GUESS_OFFSET_C,
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
  const addableTypes = port.allowed_boundary_types.filter(
    (type) =>
      type !== 'ambient_reservoir' &&
      type !== 'external_cfd_placeholder' &&
      (solarEnabled || type !== 'solar_load'),
  );
  const shownParameters = activeProfile
    ? finPanelShown
      ? TYPE_PARAMETERS[activeProfile.type].filter(
          (parameter) => !FIN_DERIVED_PARAMETER_KEYS.has(parameter.key),
        )
      : plateGeometryActive
        ? TYPE_PARAMETERS[activeProfile.type].filter((parameter) => parameter.key !== 'h_W_m2K')
        : TYPE_PARAMETERS[activeProfile.type]
    : [];

  return (
    <div className="flex flex-col gap-2.5" data-boundary-inspector>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink-900" title={port.name}>
          {port.name.replace(/ (Boundary|Reference)$/, '')}
        </p>
        <Badge tone={statusLabel.tone as 'ok'}>{statusLabel.zh}</Badge>
      </div>

      {/* The conditions on this surface, as chips; the open one is edited below. */}
      <div className="flex flex-wrap items-center gap-1.5" data-profiles>
        <span className="text-[10.5px] text-ink-400">邊界條件</span>
        {profiles.map((profile) => {
          const active = activeProfile?.id === profile.id;
          return (
            <span
              key={profile.id}
              className={`inline-flex items-center rounded-full border text-[11px] ${
                active ? 'border-accent-500 bg-accent-100 font-semibold text-accent-700' : 'border-line text-ink-700'
              }`}
            >
              <button
                type="button"
                className="py-0.5 pr-1 pl-2"
                aria-pressed={active}
                title={profile.name}
                onClick={() => setActiveProfileId(profile.id)}
              >
                {BOUNDARY_TYPE_LABELS[profile.type].zh}
                {profile.type === 'solar_load' && !solarEnabled && '（停用）'}
              </button>
              <button
                type="button"
                disabled={readOnly}
                title="移除此條件"
                aria-label={`移除 ${BOUNDARY_TYPE_LABELS[profile.type].zh}`}
                onClick={() => onRemoveProfile(profile.id)}
                className="py-0.5 pr-1.5 text-ink-400 hover:text-danger-600 disabled:opacity-40"
              >
                <Trash2 size={11} aria-hidden />
              </button>
            </span>
          );
        })}
        {profiles.length === 0 && (
          <span className="text-[11px] text-warn-600">還沒有，請加入實際的散熱方式</span>
        )}
        <Select
          id="bc-add-type"
          aria-label="加入邊界條件"
          title={T06.field.boundaryType}
          className="h-7 !w-auto !py-0 !text-[11px]"
          value=""
          disabled={readOnly}
          items={[
            { value: '', label: '＋ 加入條件' },
            ...addableTypes.map((type) => ({ value: type, label: BOUNDARY_TYPE_LABELS[type].zh })),
          ]}
          onChange={(event) => {
            if (!event.target.value) return;
            onAddProfile(event.target.value as BoundaryConditionType);
          }}
        />
      </div>

      {activeProfile && (
        <div className="flex flex-col gap-2" data-active-profile>
          {solarProfileInactive ? (
            <p className="rounded border border-line bg-surface-muted p-2 text-[10.5px] leading-relaxed text-ink-500">
              01 的日照是 0 W/m²：這個太陽熱負載與它的設定會保留，但不參與檢查、預覽或 07 的熱負載。
            </p>
          ) : (
            <>
              <p className="text-[10.5px] leading-relaxed text-ink-400">
                {finCapable && finGeometryForced
                  ? '鰭片表面以幾何描述：h、輻射項、鰭片效率與散熱面積都由下面的鰭片算出，不必另外填或從其他工具抄。'
                  : TYPE_REQUIREMENT[activeProfile.type].zh}
              </p>

              {/* Named rather than silently replaced: the stored numbers are
                  still what the solve uses, until the geometry is complete. */}
              {legacyManualInUse && (
                <p className="rounded-md border border-warn-500/40 bg-warn-100/40 p-2 text-[11px] leading-relaxed text-warn-600" data-legacy-h>
                  <span className="font-bold">目前仍以先前輸入的 h 求解</span>
                  <span className="mt-0.5 block text-[10.5px]">
                    這個表面在鰭片幾何之前就設定好了：h ={' '}
                    {formatNumber(activeProfile.parameters.h_W_m2K as number | null, 2)} W/m²K、面積 ={' '}
                    {formatNumber((activeProfile.parameters.area_m2 as number | null) ?? port.area_m2, 3)} m²。
                    下面的鰭片幾何填齊後就改用幾何計算。
                  </span>
                </p>
              )}

              {finCapable && !finGeometryForced && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line bg-surface-muted p-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                    checked={finGeometryActive}
                    disabled={readOnly}
                    onChange={(event) => setFinGeometryEnabled(event.target.checked)}
                  />
                  <span className="text-[11px] leading-relaxed">
                    <span className="font-bold text-ink-800">以鰭片幾何描述</span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">
                      h、輻射項、鰭片效率與散熱面積由幾何算出，不必手動填寫。
                    </span>
                  </span>
                </label>
              )}

              {/* A flat wall states its own area, emissivity and view factor;
                  only h is offered as a computed value. */}
              {finCapable && !finGeometryForced && !finGeometryActive && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line bg-surface-muted p-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                    checked={plateGeometryActive}
                    disabled={readOnly}
                    onChange={(event) => setPlateGeometryEnabled(event.target.checked)}
                  />
                  <span className="text-[11px] leading-relaxed">
                    <span className="font-bold text-ink-800">由平板幾何計算 h</span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">
                      自然對流係數由特徵長度、方位與表面溫度假設算出（Churchill–Chu 等標準關聯式）；面積、發射率、視角因子仍由你填。
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

              {/* On a finned port the panel is always here, even while a stored
                  h is still doing the solving. */}
              {finPanelShown && (
                <FinGeometryPanel
                  port={port}
                  profile={activeProfile}
                  result={finResult}
                  readOnly={readOnly}
                  onPatch={patchParameter}
                  onTechnologyChange={setFinTechnology}
                />
              )}

              {shownParameters.map((parameter) => {
                const inheritedOwner =
                  parameter.key === 'irradiance_W_m2'
                    ? '01 情境'
                    : parameter.key === 'emissivity' || parameter.key === 'absorptivity'
                      ? '表面性質'
                      : (parameter.key === 'area_m2' || parameter.key === 'receivingArea_m2') &&
                          port.area_m2 != null
                        ? '04 的元件幾何'
                        : null;
                const value = activeProfile.parameters[parameter.key];
                return (
                  <div key={parameter.key}>
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
                        className="mt-1 flex h-8 items-center justify-between rounded-md border border-line bg-surface px-2.5 text-[11px] text-ink-900"
                      >
                        <span className="tabular font-semibold">{typeof value === 'number' ? value : '—'}</span>
                        <span className="text-[10px] text-ink-400">取自{inheritedOwner}</span>
                      </div>
                    ) : (
                      <NumberInput
                        id={`bc-param-${parameter.key}`}
                        className="mt-1 h-8 !text-[12px]"
                        step="any"
                        max={parameter.max}
                        placeholder={
                          parameter.key === 'surfaceReferenceTemperatureGuess_C'
                            ? ambientTemperature_C != null
                              ? `留白＝環境 + ${DEFAULT_SURFACE_GUESS_OFFSET_C}（${(ambientTemperature_C + DEFAULT_SURFACE_GUESS_OFFSET_C).toFixed(1)} °C）`
                              : `留白＝環境溫度 + ${DEFAULT_SURFACE_GUESS_OFFSET_C} °C`
                            : undefined
                        }
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
            <div>
              <FieldLabel
                label="Reason (optional)"
                zh="理由（選填）"
                htmlFor="bc-adiabatic-reason"
                tooltip={T06.field.adiabaticReason}
              />
              <TextInput
                id="bc-adiabatic-reason"
                className="mt-1 h-8 !text-[12px]"
                placeholder="例如：對稱面"
                value={(activeProfile.parameters.reason as string) ?? ''}
                disabled={readOnly}
                onChange={(event) => patchParameter('reason', event.target.value)}
              />
            </div>
          )}

          {activeProfile.type === 'external_cfd_placeholder' && (
            <p className="rounded border border-warn-500/40 bg-warn-100 p-2 text-[10.5px] leading-relaxed text-warn-600">
              03 還沒有做：這個佔位不會匯入 CFD 資料，也不影響求解。
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
                // necessarily the one that happens to be open.
                const owner = profiles.find((entry) => entry.id === assumptionCheck?.profile_id) ?? null;
                if (!owner) return;
                onUpsertProfile({
                  ...owner,
                  parameters: { ...owner.parameters, surfaceReferenceTemperatureGuess_C: surface_C },
                  // A STATED input the engineer chose, not a solved value: the
                  // source says so, and 07 re-solves from it.
                  source: 'manual',
                });
              }}
            />
          )}

          <details className="rounded border border-line bg-surface-muted px-2.5 py-2 text-[10px] text-ink-500">
            <summary className="cursor-pointer font-semibold text-ink-600">進階資訊（名稱、來源、信心度）</summary>
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
                onChange={(event) => patchProfile({ source: event.target.value as BoundaryDataSource })}
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
                items={[
                  { value: 'high', label: '高' },
                  { value: 'medium', label: '中' },
                  { value: 'low', label: '低' },
                ]}
                onChange={(event) => patchProfile({ confidence: event.target.value as Confidence })}
              />

              <FieldLabel label="Reference" zh="依據" htmlFor="bc-profile-reference" />
              <TextInput
                id="bc-profile-reference"
                className="mt-1 mb-2 h-8 !text-[12px]"
                placeholder="例如：風洞報告 rev B"
                value={activeProfile.provenance?.reference ?? ''}
                disabled={readOnly}
                onChange={(event) =>
                  patchProfile({
                    provenance: {
                      source_label: activeProfile.provenance?.source_label ?? 'Thermal engineer input',
                      reference: event.target.value,
                    },
                  })
                }
              />

              <Row label="Representation" zh="求解表示">
                <span title={T06.field.representation}>{activeProfile.representation}</span>
              </Row>
              <Row label="Boundary Port" zh="邊界端口">{port.id}</Row>
              <Row label="Connected Node" zh="連接節點">{port.connected_node_id}</Row>
              <Row label="Surface Group" zh="表面群組">{port.surface_group_id}</Row>
              <Row label="Orientation" zh="方位">{port.orientation}</Row>
              <Row label="Topology Area" zh="拓樸面積">
                {port.area_m2 == null
                  ? '未提供'
                  : port.area_m2 < 0.01
                    ? `${port.area_m2.toFixed(6)} m² (${(port.area_m2 * 1_000_000).toFixed(1)} mm²)`
                    : formatNumber(port.area_m2, 3, 'm²')}
              </Row>
            </div>
          </details>
        </div>
      )}

      <InlineChecks messages={portMessages} />
    </div>
  );
}
