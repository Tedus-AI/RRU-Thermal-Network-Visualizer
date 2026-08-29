/**
 * Screen 06 boundary setup.
 *
 * A dissipating surface gets one continuous setup flow: profile selection,
 * required parameters, applicable pre-solve previews and inline checks. The
 * ambient placeholder is different: it is a non-dissipating temperature
 * reference owned by Scenario Environment, so it gets a compact summary and
 * never creates a second temperature profile.
 *
 * SCREEN 03 RE-ENABLEMENT NOTE:
 * FloTHERM aliases and external-mapping metadata remain in the domain schema.
 * Their editor stays hidden while Screen 03 is deferred. When Screen 03 gains
 * a real import contract and parser, restore mapping controls for both ambient
 * references and dissipating ports, then add cross-screen import tests.
 */

import { useState } from 'react';
import { CheckCircle2, Thermometer, Trash2, TriangleAlert } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { Bi, FieldLabel, biTitle } from '@/ui/FieldLabel';

import {
  BOUNDARY_TYPE_LABELS,
  type BoundaryConditionProfile,
  type BoundaryConditionType,
  type BoundaryDataSource,
  type BoundaryDerivedPreview,
  type BoundaryPort,
  type BoundaryValidationMessage,
  type BoundaryValidationState,
} from '@/thermal/boundary/types';
import type { Confidence } from '@/thermal/types';

import { T06 } from './tooltips';
import { PORT_STATUS_LABELS, formatNumber, formatRth, type PortStatus } from './boundaryViewModel';

const SOURCES: BoundaryDataSource[] = [
  'manual',
  'analytical',
  'datasheet',
  'assumed',
  'measurement',
  'vendor',
];

/** Required numeric inputs for each actively supported boundary type. */
const TYPE_PARAMETERS: Record<
  BoundaryConditionType,
  Array<{ key: string; label: string; zh: string; unit: string; tip?: string; max?: number }>
> = {
  // Ambient temperature is authoritative in Scenario Environment. This entry
  // remains empty for legacy schema compatibility and is never offered by this UI.
  ambient_reservoir: [],
  convection_to_ambient: [
    { key: 'h_W_m2K', label: 'Convection h', zh: '對流係數', unit: 'W/m²K', tip: T06.field.hConv },
    { key: 'area_m2', label: 'Effective Area', zh: '有效面積', unit: 'm²', tip: T06.field.area },
  ],
  radiation_to_surroundings: [
    { key: 'emissivity', label: 'Emissivity', zh: '發射率', unit: '', tip: T06.field.emissivity, max: 1 },
    { key: 'viewFactor', label: 'View Factor', zh: '視角因子', unit: '', tip: T06.field.viewFactor, max: 1 },
    { key: 'area_m2', label: 'Effective Area', zh: '有效面積', unit: 'm²', tip: T06.field.area },
    {
      key: 'surfaceReferenceTemperatureGuess_C',
      label: 'Surface Temperature Guess',
      zh: '表面溫度假設',
      unit: '°C',
      tip: '線性化輻射係數需要表面溫度假設；留白時以環境溫度 + 35°C 預估，真實值由 07 求解。',
    },
  ],
  combined_convection_radiation: [
    { key: 'h_W_m2K', label: 'Convection h', zh: '對流係數', unit: 'W/m²K', tip: T06.field.hConv },
    { key: 'emissivity', label: 'Emissivity', zh: '發射率', unit: '', tip: T06.field.emissivity, max: 1 },
    { key: 'viewFactor', label: 'View Factor', zh: '視角因子', unit: '', tip: T06.field.viewFactor, max: 1 },
    { key: 'area_m2', label: 'Effective Area', zh: '有效面積', unit: 'm²', tip: T06.field.area },
    {
      key: 'surfaceReferenceTemperatureGuess_C',
      label: 'Surface Temperature Guess',
      zh: '表面溫度假設',
      unit: '°C',
      tip: '留白時以環境溫度 + 35°C 預估；真實表面溫度由 07 求解。',
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

const TYPE_REQUIREMENT: Record<BoundaryConditionType, { en: string; zh: string }> = {
  ambient_reservoir: {
    en: 'Ambient temperature is inherited from Scenario Environment.',
    zh: '環境溫度由「情境環境」統一提供。',
  },
  convection_to_ambient: {
    en: 'h and effective area are required. Without either value, Rconv cannot be calculated and Screen 07 is blocked.',
    zh: '必須提供 h 與有效面積；缺少任一值便無法計算 Rconv，並會阻擋 07 求解。',
  },
  radiation_to_surroundings: {
    en: 'Emissivity, view factor and effective area are required. The surface-temperature guess may use the shown assumption.',
    zh: '發射率、視角因子與有效面積為必要值；表面溫度假設可採系統顯示的預估。',
  },
  combined_convection_radiation: {
    en: 'Convection and radiation inputs form parallel heat paths. Missing inputs make the applicable preview incomplete.',
    zh: '對流與輻射形成並聯散熱路徑；缺少輸入會使相應的預覽不完整。',
  },
  solar_load: {
    en: 'All five factors are required to calculate solar heat input. This is a heat load, not a resistance.',
    zh: '五項係數都必須完整，才能計算太陽熱輸入；它是熱負載，不是熱阻。',
  },
  fixed_temperature_boundary: {
    en: 'A known temperature is required for a controlled cold plate, chamber fixture or test interface.',
    zh: '受控冷板、環境箱治具或測試介面必須提供已知固定溫度。',
  },
  adiabatic_symmetry: {
    en: 'No numeric input is required. A reason is optional audit information and does not block the solver.',
    zh: '不需要數值輸入；理由僅供稽核，可留白且不會阻擋求解。',
  },
  external_cfd_placeholder: {
    en: 'Metadata only while Screen 03 is deferred. It does not provide solver input.',
    zh: 'Screen 03 延後期間僅保留中繼資料，不會提供求解輸入。',
  },
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

function InlineChecks({ messages }: { messages: BoundaryValidationMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded border border-ok-500/40 bg-ok-100 px-2.5 py-2 text-[11px] text-ok-600">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
        <Bi en="No issues for this boundary port." zh="此邊界端口沒有問題。" inline />
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {messages.map((entry) => (
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
  );
}

function ApplicablePreview({
  preview,
  activeProfile,
}: {
  preview: BoundaryDerivedPreview | undefined;
  activeProfile: BoundaryConditionProfile;
}) {
  const showConvection =
    activeProfile.type === 'convection_to_ambient' ||
    activeProfile.type === 'combined_convection_radiation';
  const showRadiation =
    activeProfile.type === 'radiation_to_surroundings' ||
    activeProfile.type === 'combined_convection_radiation';
  const showSolar = activeProfile.type === 'solar_load';
  const hasNumericPreview = showConvection || showRadiation || showSolar;

  if (!hasNumericPreview) return null;

  return (
    <section className="mt-3 rounded-md border border-accent-500/30 bg-accent-100/40 p-2.5">
      <p className="mb-1 text-[11px] font-bold text-accent-700">
        Calculated Preview <span className="font-normal text-ink-400">/ 計算預覽</span>
      </p>
      {showConvection && (
        <Row label="Rconv" zh="對流熱阻">
          <span title={T06.derived.rconv}>{formatRth(preview?.r_conv_C_per_W)}</span>
        </Row>
      )}
      {showRadiation && (
        <>
          <Row label="h_rad" zh="線性化輻射係數">
            {formatNumber(preview?.h_rad_W_m2K, 3, 'W/m²K')}
          </Row>
          <Row label="Rrad" zh="輻射熱阻">
            <span title={T06.derived.rrad}>{formatRth(preview?.r_rad_C_per_W)}</span>
          </Row>
        </>
      )}
      {(showConvection || showRadiation) && (
        <Row label="Combined Boundary Rth" zh="合併邊界熱阻">
          <span title={T06.derived.rcombined}>{formatRth(preview?.r_combined_C_per_W)}</span>
        </Row>
      )}
      {showSolar && (
        <Row label="Solar Heat Load" zh="太陽熱負載">
          <span title={T06.derived.qsolar}>{formatNumber(preview?.q_solar_W, 2, 'W')}</span>
        </Row>
      )}
      <Row label="Input Completeness" zh="輸入完整度">
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
      <p className="mt-2 text-[10px] leading-relaxed text-ink-500">{T06.derived.disclaimer}</p>
    </section>
  );
}

function AmbientReferenceSummary({
  port,
  status,
  ambientTemperature_C,
  onEditAmbient,
}: {
  port: BoundaryPort;
  status: PortStatus;
  ambientTemperature_C: number | null;
  onEditAmbient: () => void;
}) {
  const ready = ambientTemperature_C != null && Number.isFinite(ambientTemperature_C);
  const statusLabel = PORT_STATUS_LABELS[status];

  return (
    <div className="flex min-h-0 flex-col">
      <header className="border-b border-line px-3.5 py-2.5">
        <p className="truncate text-[13px] font-bold text-ink-900" title={port.name}>
          Ambient Reference / 環境溫度參考
        </p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          Non-dissipating solver reference / 非散熱表面的求解參考點
        </p>
      </header>

      <div className="p-3.5">
        <div className={`rounded-md border p-3 ${ready ? 'border-ok-500/40 bg-ok-100/60' : 'border-danger-500/40 bg-danger-100/60'}`}>
          <div className="flex items-start gap-2.5">
            {ready ? (
              <Thermometer size={18} className="mt-0.5 shrink-0 text-ok-600" />
            ) : (
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-danger-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-ink-500">
                Reference Temperature / 參考溫度
              </p>
              <p className="mt-0.5 text-[22px] font-bold tabular text-ink-900">
                {ready ? `${ambientTemperature_C!.toFixed(1)} °C` : 'Not configured / 未設定'}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-500">
                Inherited from Scenario Environment / 由「情境環境」統一提供
              </p>
            </div>
            <Badge tone={statusLabel.tone as 'ok'}>{statusLabel.label}</Badge>
          </div>
        </div>

        <div className="mt-3">
          <Row label="Applied To" zh="套用節點">Ambient node / 環境節點</Row>
          <Row label="Solver Role" zh="求解用途">Fixed temperature reference / 固定溫度參考</Row>
          <Row label="Heat Rejection Surface" zh="散熱表面">No / 否</Row>
        </div>

        <p className={`mt-3 rounded border p-2 text-[10px] leading-relaxed ${ready ? 'border-ok-500/40 bg-ok-100 text-ok-600' : 'border-danger-500/40 bg-danger-100 text-danger-600'}`}>
          {ready ? (
            <Bi
              en="Ready. Screen 07 has an absolute temperature reference."
              zh="已就緒，Screen 07 已具備絕對溫度參考。"
              inline
            />
          ) : (
            <Bi
              en="Ambient temperature is required. Without it, Screen 07 has no absolute temperature reference and solving is blocked."
              zh="必須設定環境溫度；缺少時 07 沒有絕對溫度參考，因此會阻擋求解。"
              inline
            />
          )}
        </p>

        <Button className="mt-3 h-8 w-full" onClick={onEditAmbient}>
          Edit Scenario Environment / 編輯情境環境
        </Button>

        <details className="mt-3 rounded border border-line bg-surface-muted px-2.5 py-2 text-[10px] text-ink-500">
          <summary className="cursor-pointer font-semibold text-ink-600">Advanced Details / 進階資訊</summary>
          <div className="mt-2">
            <Row label="Boundary Port">{port.id}</Row>
            <Row label="Connected Node">{port.connected_node_id}</Row>
            <Row label="Surface Group">{port.surface_group_id}</Row>
          </div>
        </details>
      </div>
    </div>
  );
}

export function BoundaryInspector({
  port,
  status,
  profiles,
  preview,
  validation,
  ambientTemperature_C,
  readOnly,
  onEditAmbient,
  onUpsertProfile,
  onRemoveProfile,
  onAddProfile,
}: {
  port: BoundaryPort;
  status: PortStatus;
  profiles: BoundaryConditionProfile[];
  preview: BoundaryDerivedPreview | undefined;
  validation: BoundaryValidationState;
  ambientTemperature_C: number | null;
  readOnly: boolean;
  onEditAmbient: () => void;
  onUpsertProfile: (profile: BoundaryConditionProfile) => void;
  onRemoveProfile: (profileId: string) => void;
  onAddProfile: (type: BoundaryConditionType) => void;
}) {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;

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
                      type !== 'ambient_reservoir' && type !== 'external_cfd_placeholder',
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
            <p className="mb-2 rounded border border-line bg-surface-muted p-2 text-[10px] leading-relaxed text-ink-500">
              {TYPE_REQUIREMENT[activeProfile.type].en}
              <span className="block text-ink-400">{TYPE_REQUIREMENT[activeProfile.type].zh}</span>
            </p>

            {TYPE_PARAMETERS[activeProfile.type].map((parameter) => (
              <div key={parameter.key} className="mb-2">
                <FieldLabel
                  label={parameter.label}
                  zh={parameter.zh}
                  unit={parameter.unit || undefined}
                  htmlFor={`bc-param-${parameter.key}`}
                  tooltip={parameter.tip}
                  required={parameter.key !== 'surfaceReferenceTemperatureGuess_C'}
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

            <ApplicablePreview preview={preview} activeProfile={activeProfile} />

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
