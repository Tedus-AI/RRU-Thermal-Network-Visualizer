/**
 * Section 3 — Boundary Inspector (06 §8.3).
 *
 * Tabs: Profile / Parameters / Derived Preview / Validation / Mapping.
 *
 * What this panel must never show: a solved node temperature, an edge heat
 * flow, a ΔT or a bottleneck rank (06 §3.3). Everything numeric here is a
 * boundary INPUT, and the Derived Preview tab says so in as many words.
 */

import { useState } from 'react';
import { Thermometer, Trash2 } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { Bi, FieldLabel, biTitle } from '@/ui/FieldLabel';

import {
  BOUNDARY_TYPE_LABELS,
  type BoundaryConditionProfile,
  type BoundaryConditionType,
  type BoundaryDataSource,
  type BoundaryDerivedPreview,
  type BoundaryPort,
  type BoundaryValidationState,
  type ExternalBoundaryMappings,
} from '@/thermal/boundary/types';
import type { Confidence } from '@/thermal/types';

import { T06 } from './tooltips';
import { PORT_STATUS_LABELS, formatNumber, formatRth, type PortStatus } from './boundaryViewModel';

const TABS = [
  { id: 'profile', label: 'Profile', full: 'Profile', zh: '條件型別' },
  { id: 'parameters', label: 'Params', full: 'Parameters', zh: '參數' },
  { id: 'derived', label: 'Preview', full: 'Derived Preview', zh: '推導預覽' },
  { id: 'validation', label: 'Checks', full: 'Validation', zh: '驗證' },
  { id: 'mapping', label: 'Mapping', full: 'External Mapping', zh: '外部對照' },
] as const;

type Tab = (typeof TABS)[number]['id'];

const SOURCES: BoundaryDataSource[] = [
  'manual',
  'analytical',
  'datasheet',
  'assumed',
  'measurement',
  'flotherm',
  'vendor',
];

/** Which numeric inputs each boundary type needs — 06 §8.3 Parameters tab. */
const TYPE_PARAMETERS: Record<
  BoundaryConditionType,
  Array<{ key: string; label: string; zh: string; unit: string; tip?: string; max?: number }>
> = {
  ambient_reservoir: [
    { key: 'temperature_C', label: 'Reference Temperature', zh: '參考溫度', unit: '°C' },
  ],
  convection_to_ambient: [
    { key: 'h_W_m2K', label: 'Convection h', zh: '對流係數', unit: 'W/m²K', tip: T06.field.hConv },
    { key: 'area_m2', label: 'Area', zh: '面積', unit: 'm²', tip: T06.field.area },
  ],
  radiation_to_surroundings: [
    { key: 'emissivity', label: 'Emissivity', zh: '發射率', unit: '', tip: T06.field.emissivity, max: 1 },
    { key: 'viewFactor', label: 'View Factor', zh: '視角因子', unit: '', tip: T06.field.viewFactor, max: 1 },
    { key: 'area_m2', label: 'Area', zh: '面積', unit: 'm²', tip: T06.field.area },
    {
      key: 'radiationTemperature_C',
      label: 'Radiation Sink Temperature',
      zh: '輻射參考溫度',
      unit: '°C',
    },
    {
      key: 'surfaceReferenceTemperatureGuess_C',
      label: 'Surface Temperature Guess',
      zh: '表面溫度假設',
      unit: '°C',
      tip: '線性化輻射係數需要一個表面溫度假設；真實值由 07 求解。',
    },
  ],
  combined_convection_radiation: [
    { key: 'h_W_m2K', label: 'Convection h', zh: '對流係數', unit: 'W/m²K', tip: T06.field.hConv },
    { key: 'emissivity', label: 'Emissivity', zh: '發射率', unit: '', tip: T06.field.emissivity, max: 1 },
    { key: 'viewFactor', label: 'View Factor', zh: '視角因子', unit: '', tip: T06.field.viewFactor, max: 1 },
    { key: 'area_m2', label: 'Area', zh: '面積', unit: 'm²', tip: T06.field.area },
    {
      key: 'surfaceReferenceTemperatureGuess_C',
      label: 'Surface Temperature Guess',
      zh: '表面溫度假設',
      unit: '°C',
    },
  ],
  solar_load: [
    {
      key: 'irradiance_W_m2',
      label: 'Irradiance',
      zh: '輻照度',
      unit: 'W/m²',
      tip: T06.field.solarIrradiance,
    },
    {
      key: 'absorptivity',
      label: 'Absorptivity',
      zh: '吸收率',
      unit: '',
      tip: T06.field.absorptivity,
      max: 1,
    },
    {
      key: 'projectedAreaFactor',
      label: 'Projected Area Factor',
      zh: '投影面積係數',
      unit: '',
      tip: T06.field.projectedAreaFactor,
      max: 1,
    },
    {
      key: 'shadingFactor',
      label: 'Shading Factor',
      zh: '遮蔽係數',
      unit: '',
      tip: T06.field.shadingFactor,
      max: 1,
    },
    { key: 'receivingArea_m2', label: 'Receiving Area', zh: '受照面積', unit: 'm²' },
  ],
  fixed_temperature_boundary: [
    {
      key: 'fixedTemperature_C',
      label: 'Fixed Temperature',
      zh: '固定溫度',
      unit: '°C',
      tip: T06.field.fixedTemperature,
    },
  ],
  adiabatic_symmetry: [],
  external_cfd_placeholder: [],
};

function Row({ label, zh, children }: { label: string; zh?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="shrink-0 text-[11px] text-ink-500">
        {label}
        {zh && <span className="ml-1 text-ink-400">/ {zh}</span>}
      </span>
      <span className="min-w-0 text-right text-[11px] font-semibold text-ink-900">{children}</span>
    </div>
  );
}

export function BoundaryInspector({
  port,
  status,
  profiles,
  preview,
  validation,
  readOnly,
  onUpsertProfile,
  onRemoveProfile,
  onAddProfile,
}: {
  port: BoundaryPort;
  status: PortStatus;
  profiles: BoundaryConditionProfile[];
  preview: BoundaryDerivedPreview | undefined;
  validation: BoundaryValidationState;
  readOnly: boolean;
  onUpsertProfile: (profile: BoundaryConditionProfile) => void;
  onRemoveProfile: (profileId: string) => void;
  onAddProfile: (type: BoundaryConditionType) => void;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;

  const portMessages = [
    ...validation.errors.filter((entry) => entry.boundary_port_id === port.id),
    ...validation.warnings.filter((entry) => entry.boundary_port_id === port.id),
    ...validation.infos.filter((entry) => entry.boundary_port_id === port.id),
    ...(activeProfile
      ? [
          ...validation.errors.filter((entry) => entry.profile_id === activeProfile.id),
          ...validation.warnings.filter((entry) => entry.profile_id === activeProfile.id),
          ...validation.infos.filter((entry) => entry.profile_id === activeProfile.id),
        ]
      : []),
  ];

  const patchProfile = (patch: Partial<BoundaryConditionProfile>) => {
    if (!activeProfile) return;
    onUpsertProfile({ ...activeProfile, ...patch });
  };

  const patchParameter = (key: string, value: number | string | null) => {
    if (!activeProfile) return;
    onUpsertProfile({
      ...activeProfile,
      parameters: { ...activeProfile.parameters, [key]: value },
    });
  };

  const statusLabel = PORT_STATUS_LABELS[status];

  return (
    <div className="flex min-h-0 flex-col">
      <header className="border-b border-line px-3.5 py-2.5">
        <p className="truncate text-[13px] font-bold text-ink-900" title={port.name}>
          {port.name}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-500">
          <span className="truncate">{port.connected_node_id}</span>
          <Badge tone={statusLabel.tone as 'ok'}>{statusLabel.label}</Badge>
        </p>
      </header>

      <nav className="flex gap-0.5 overflow-x-auto border-b border-line px-2 pt-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={biTitle(entry.full, entry.zh)}
            onClick={() => setTab(entry.id)}
            className={`shrink-0 border-b-2 px-2 pb-1.5 text-[11px] font-semibold transition-colors ${
              tab === entry.id
                ? 'border-accent-600 text-accent-700'
                : 'border-transparent text-ink-400 hover:text-ink-700'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        {/* ---------------------------------------------------------- Profile */}
        {tab === 'profile' && (
          <div>
            <Row label="Boundary Port" zh="邊界端口">
              {port.id}
            </Row>
            <Row label="Connected Node" zh="連接節點">
              {port.connected_node_id}
            </Row>
            <Row label="Surface Group" zh="表面群組">
              {port.surface_group_id}
            </Row>
            <Row label="Orientation" zh="方位">
              {port.orientation}
            </Row>
            <Row label="Area" zh="面積">
              {formatNumber(port.area_m2, 3, 'm²')}
            </Row>

            <p className="mt-3 mb-1 text-[11px] font-bold text-ink-700">
              Assigned Profiles <span className="font-normal text-ink-400">/ 已指派條件</span>
            </p>
            <ul className="flex flex-col gap-1">
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
                      {profile.name}
                    </span>
                    <span
                      className="block text-[10px] text-ink-400"
                      title={biTitle(
                        BOUNDARY_TYPE_LABELS[profile.type].label,
                        BOUNDARY_TYPE_LABELS[profile.type].zh,
                      )}
                    >
                      {BOUNDARY_TYPE_LABELS[profile.type].label}
                    </span>
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
                    en="No boundary condition assigned to this port."
                    zh="此端口尚未指定邊界條件。"
                    inline
                  />
                </li>
              )}
            </ul>

            <div className="mt-3">
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
                  ...port.allowed_boundary_types.map((type) => ({
                    value: type,
                    label: `${BOUNDARY_TYPE_LABELS[type].label} / ${BOUNDARY_TYPE_LABELS[type].zh}`,
                  })),
                ]}
                onChange={(event) => {
                  if (!event.target.value) return;
                  onAddProfile(event.target.value as BoundaryConditionType);
                }}
              />
              <p className="mt-1 text-[10px] text-ink-400">
                <Bi
                  en="Allowed types come from the surface this port belongs to."
                  zh="可用型別依此端口所屬的表面而定。"
                  inline
                />
              </p>
            </div>

            {activeProfile && (
              <div className="mt-3 border-t border-line pt-3">
                <FieldLabel label="Profile Name" zh="條件名稱" htmlFor="bc-profile-name" />
                <TextInput
                  id="bc-profile-name"
                  className="mt-1 mb-2 h-8 !text-[12px]"
                  value={activeProfile.name}
                  disabled={readOnly}
                  onChange={(event) => patchProfile({ name: event.target.value })}
                />
                <Row label="Representation" zh="表示方式">
                  <span title={T06.field.representation}>{activeProfile.representation}</span>
                </Row>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- Parameters */}
        {tab === 'parameters' && (
          <div>
            {!activeProfile ? (
              <p className="text-[11px] text-ink-400">
                <Bi
                  en="Select a profile on the Profile tab first."
                  zh="請先於「條件型別」分頁選擇一個條件。"
                  inline
                />
              </p>
            ) : (
              <>
                <p className="mb-2 text-[11px] font-bold text-ink-700">
                  {BOUNDARY_TYPE_LABELS[activeProfile.type].label}
                  <span className="ml-1 font-normal text-ink-400">
                    / {BOUNDARY_TYPE_LABELS[activeProfile.type].zh}
                  </span>
                </p>

                {TYPE_PARAMETERS[activeProfile.type].map((parameter) => (
                  <div key={parameter.key} className="mb-2">
                    <FieldLabel
                      label={parameter.label}
                      zh={parameter.zh}
                      unit={parameter.unit || undefined}
                      htmlFor={`bc-param-${parameter.key}`}
                      tooltip={parameter.tip}
                    />
                    <NumberInput
                      id={`bc-param-${parameter.key}`}
                      className="mt-1 h-8 !text-[12px]"
                      step="any"
                      max={parameter.max}
                      value={
                        typeof activeProfile.parameters[parameter.key] === 'number'
                          ? (activeProfile.parameters[parameter.key] as number)
                          : ''
                      }
                      disabled={readOnly}
                      onChange={(event) =>
                        patchParameter(
                          parameter.key,
                          event.target.value === '' ? null : Number(event.target.value),
                        )
                      }
                    />
                  </div>
                ))}

                {activeProfile.type === 'adiabatic_symmetry' && (
                  <div className="mb-2">
                    <FieldLabel
                      label="Reason"
                      zh="理由"
                      htmlFor="bc-adiabatic-reason"
                      tooltip={T06.field.adiabaticReason}
                      required
                    />
                    <TextInput
                      id="bc-adiabatic-reason"
                      className="mt-1 h-8 !text-[12px]"
                      value={(activeProfile.parameters.reason as string) ?? ''}
                      disabled={readOnly}
                      onChange={(event) => patchParameter('reason', event.target.value)}
                    />
                  </div>
                )}

                {TYPE_PARAMETERS[activeProfile.type].length === 0 &&
                  activeProfile.type !== 'adiabatic_symmetry' && (
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      <Bi
                        en="This type stores metadata only while Screen 03 is deferred."
                        zh="Screen 03 延後期間，此型別僅儲存中繼資料。"
                        inline
                      />
                    </p>
                  )}

                <div className="mt-3 border-t border-line pt-2">
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
                    options={SOURCES}
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
                    className="mt-1 h-8 !text-[12px]"
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
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------- Derived */}
        {tab === 'derived' && (
          <div>
            <Row label="Rconv Preview" zh="對流熱阻預覽">
              <span title={T06.derived.rconv}>{formatRth(preview?.r_conv_C_per_W)}</span>
            </Row>
            <Row label="h_rad" zh="線性化輻射係數">
              {formatNumber(preview?.h_rad_W_m2K, 3, 'W/m²K')}
            </Row>
            <Row label="Rrad Preview" zh="輻射熱阻預覽">
              <span title={T06.derived.rrad}>{formatRth(preview?.r_rad_C_per_W)}</span>
            </Row>
            <Row label="Combined Boundary Rth" zh="合併邊界熱阻">
              <span title={T06.derived.rcombined}>{formatRth(preview?.r_combined_C_per_W)}</span>
            </Row>
            <Row label="Solar Heat Load" zh="太陽熱負載">
              <span title={T06.derived.qsolar}>{formatNumber(preview?.q_solar_W, 2, 'W')}</span>
            </Row>
            <Row label="Completeness" zh="完整度">
              <Badge
                tone={
                  preview?.completeness === 'complete'
                    ? 'ok'
                    : preview?.completeness === 'warning'
                      ? 'warn'
                      : 'danger'
                }
              >
                {preview?.completeness ?? 'blocked'}
              </Badge>
            </Row>
            <Row label="Ready for 07 Solve" zh="可交付 07">
              {preview && preview.completeness !== 'blocked' ? 'Yes' : 'No'}
            </Row>

            <p className="mt-3 rounded border border-accent-500/40 bg-accent-100 p-2 text-[10px] leading-relaxed text-accent-700">
              Pre-solve boundary input only. Node temperature and edge heat flow are calculated in
              Screen 07.
              <span className="block text-ink-500">{T06.derived.disclaimer}</span>
            </p>
          </div>
        )}

        {/* ------------------------------------------------------- Validation */}
        {tab === 'validation' && (
          <ul className="flex flex-col gap-1.5">
            {portMessages.length === 0 && (
              <li className="rounded border border-ok-500/40 bg-ok-100 px-2 py-2 text-[11px] text-ok-600">
                <Bi en="No issues for this boundary port." zh="此邊界端口沒有問題。" inline />
              </li>
            )}
            {portMessages.map((entry) => (
              <li
                key={entry.id}
                className={`rounded border px-2 py-1.5 ${
                  entry.severity === 'error'
                    ? 'border-danger-500/40 bg-danger-100'
                    : entry.severity === 'warning'
                      ? 'border-warn-500/40 bg-warn-100'
                      : 'border-line bg-surface-muted'
                }`}
              >
                <p className="text-[11px] font-semibold text-ink-900">{entry.message}</p>
                <p className="text-[10px] text-ink-500">{entry.message_zh}</p>
                {entry.suggested_action && (
                  <p className="mt-0.5 text-[10px] text-ink-400">→ {entry.suggested_action}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ---------------------------------------------------------- Mapping */}
        {tab === 'mapping' && (
          <div>
            <p className="mb-2 text-[11px] font-bold text-ink-700" title={T06.mapping}>
              FloTHERM <span className="font-normal text-ink-400">/ 外部對照</span>
            </p>

            <MappingField
              id="bc-map-surface"
              label="FloTHERM Surface Alias"
              zh="表面別名"
              value={port.external_mappings.flotherm_surface_alias ?? ''}
              readOnly
            />
            <MappingField
              id="bc-map-object"
              label="FloTHERM Object Alias"
              zh="物件別名"
              value={activeProfile?.external_mappings?.flotherm_object_alias ?? ''}
              readOnly={readOnly || !activeProfile}
              onChange={(value) =>
                patchProfile({
                  external_mappings: {
                    ...(activeProfile?.external_mappings ?? { import_status: 'deferred' }),
                    flotherm_object_alias: value,
                    import_status: value ? 'mapped_metadata_only' : 'deferred',
                  } as ExternalBoundaryMappings,
                })
              }
            />
            <MappingField
              id="bc-map-result"
              label="FloTHERM Result Table Alias"
              zh="結果表別名"
              value={activeProfile?.external_mappings?.flotherm_result_table_alias ?? ''}
              readOnly={readOnly || !activeProfile}
              onChange={(value) =>
                patchProfile({
                  external_mappings: {
                    ...(activeProfile?.external_mappings ?? { import_status: 'deferred' }),
                    flotherm_result_table_alias: value,
                    import_status: value ? 'mapped_metadata_only' : 'deferred',
                  } as ExternalBoundaryMappings,
                })
              }
            />
            <MappingField
              id="bc-map-measurement"
              label="Measurement Point Alias"
              zh="量測點別名"
              value={port.external_mappings.measurement_point_alias ?? ''}
              readOnly
            />

            <Row label="External Source Status" zh="外部來源狀態">
              <Badge tone="neutral">
                {activeProfile?.external_mappings?.import_status ??
                  port.external_mappings.import_status}
              </Badge>
            </Row>

            <p className="mt-2 rounded border border-line bg-surface-muted p-2 text-[10px] leading-relaxed text-ink-500">
              FloTHERM parser deferred. Alias is stored for future import mapping only.
              <span className="block text-ink-400">{T06.floThermDeferred}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MappingField({
  id,
  label,
  zh,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  zh: string;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="mb-2">
      <FieldLabel label={label} zh={zh} htmlFor={id} inline={false} />
      <TextInput
        id={id}
        className="mt-1 h-8 !text-[12px]"
        value={value}
        disabled={readOnly}
        placeholder="—"
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  );
}

/** Shown when nothing on the canvas is selected — 06 §8.3. */
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
