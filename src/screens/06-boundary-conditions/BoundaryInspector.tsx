/**
 * Screen 06 boundary setup.
 *
 * A dissipating surface gets one continuous setup flow: profile selection,
 * required parameters, applicable pre-solve previews and inline checks. The
 * ambient placeholder is different: it is a non-dissipating temperature
 * reference owned by Screen 01 Scenario Settings, so it gets a compact summary and
 * never creates a second temperature profile.
 *
 * SCREEN 03 RE-ENABLEMENT NOTE:
 * FloTHERM aliases and external-mapping metadata remain in the domain schema.
 * Their editor stays hidden while Screen 03 is deferred. When Screen 03 gains
 * a real import contract and parser, restore mapping controls for both ambient
 * references and dissipating ports, then add cross-screen import tests.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Thermometer, Trash2, TriangleAlert } from 'lucide-react';

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
  type BoundaryValidationMessage,
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
import {
  PLATE_ORIENTATIONS,
  PLATE_ORIENTATION_LABELS,
  type FlatPlateResult,
  type PlateOrientation,
} from '@/thermal/boundary/flatPlate';
import {
  FIN_ASPECT_RATIO_BAND,
  FIN_TECHNOLOGIES,
  FIN_TECHNOLOGY_DEFAULT_K_W_mK,
  FIN_TECHNOLOGY_LABELS,
  finAspectRatioVerdict,
  type FinArrayResult,
  type FinTechnology,
} from '@/thermal/boundary/finArray';

import { T06 } from './tooltips';
import { PORT_STATUS_LABELS, formatNumber, formatRth, type PortStatus } from './boundaryViewModel';

/** Types whose surface can be described as a fin array instead of an h. */
const FIN_CAPABLE_TYPES = new Set<BoundaryConditionType>([
  'convection_to_ambient',
  'combined_convection_radiation',
]);

/**
 * Parameters the geometry supersedes.
 *
 * They are hidden rather than disabled while geometry is on. A greyed-out `h`
 * still showing 8 next to a computed 6.23 invites the reader to wonder which
 * one the solve used, and the answer — that the stored value is inert — is not
 * visible in a disabled box.
 */
const FIN_DERIVED_PARAMETER_KEYS = new Set([
  'h_W_m2K',
  'area_m2',
  'emissivity',
  'viewFactor',
  'surfaceReferenceTemperatureGuess_C',
]);

const FIN_GEOMETRY_FIELDS: Array<{
  key: string;
  label: string;
  zh: string;
  unit: string;
  tip: string;
  dieCastingOnly?: boolean;
}> = [
  {
    key: FIN_GEOMETRY_KEYS.baseLength,
    label: 'Base L',
    zh: '底座長',
    unit: 'mm',
    tip: '散熱器底座沿鰭片長度方向的尺寸；切換到鰭片模式時會由 SCR01 帶入。',
  },
  {
    key: FIN_GEOMETRY_KEYS.baseWidth,
    label: 'Base W',
    zh: '底座寬',
    unit: 'mm',
    tip: '散熱器底座橫跨鰭片排列方向的尺寸；鰭片數由此推算。',
  },
  {
    key: FIN_GEOMETRY_KEYS.height,
    label: 'Fin Height',
    zh: '鰭片高度',
    unit: 'mm',
    tip: '鰭片自底座算起的高度。h 會隨鰭片變高而下降（邊界層變厚），這正是固定 h 模型會高估高鰭片的原因。',
  },
  {
    key: FIN_GEOMETRY_KEYS.gap,
    label: 'Channel Gap',
    zh: '通道間距',
    unit: 'mm',
    tip: '相鄰兩鰭片之間的淨間距。h 的對流項與輻射項都由它決定。',
  },
  {
    key: FIN_GEOMETRY_KEYS.thickness,
    label: 'Fin Thickness',
    zh: '鰭片厚度',
    unit: 'mm',
    tip: '鰭片尖端厚度。壓鑄件的根部較厚，由拔模角推算。',
  },
  {
    key: FIN_GEOMETRY_KEYS.conductivity,
    label: 'Fin k',
    zh: '鰭片導熱係數',
    unit: 'W/mK',
    tip: '鰭片本身的導熱係數，決定鰭片效率。預設由製程帶入：純鋁 200、ADC12 壓鑄 160。',
  },
  {
    key: FIN_GEOMETRY_KEYS.draftAngle,
    label: 'Draft Angle',
    zh: '拔模角',
    unit: '°',
    tip: '壓鑄鰭片的脫模斜度。根部變厚會壓縮通道並可能少排一片鰭片。',
    dieCastingOnly: true,
  },
  {
    key: FIN_GEOMETRY_KEYS.processEfficiency,
    label: 'Process Factor',
    zh: '製程係數',
    unit: '',
    tip: '鰭片模型未涵蓋部分的殘差修正，預設 1.0（不修正）。大於 1 代表表面效能超過鰭片效率本身，那是在吸收模型缺少的物理量——而本工具另外計算擴散熱阻，可能重複計入。',
  },
  {
    key: FIN_GEOMETRY_KEYS.countOverride,
    label: 'Fin Count',
    zh: '鰭片數',
    unit: 'pcs',
    tip: '留白即由底座寬度、間距與厚度自動推算；只有實際排片與計算不同時才覆寫。',
  },
];

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
  // Ambient temperature is authoritative in Screen 01 Scenario Settings. This entry
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
    en: 'Ambient temperature is inherited from Screen 01 Scenario Settings.',
    zh: '環境溫度由 Screen 01「情境設定」統一提供。',
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
                Inherited from Screen 01 Scenario Settings / 由 Screen 01「情境設定」統一提供
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
          Edit Scenario Settings in 01 / 前往 01 編輯情境
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

/**
 * Fin geometry in, coefficients out.
 *
 * The readout is the point of the panel, not decoration: `h_conv`, `h_rad`, the
 * fin efficiency and the wetted area are exactly the four numbers that used to
 * be typed in by hand, so showing what the geometry produced is what lets an
 * engineer check the mode against whatever they were copying from before.
 */
function FinGeometryPanel({
  profile,
  result,
  readOnly,
  onPatch,
}: {
  profile: BoundaryConditionProfile;
  result: FinArrayResult | null;
  readOnly: boolean;
  onPatch: (key: string, value: number | string | null) => void;
}) {
  const technology: FinTechnology =
    profile.parameters[FIN_GEOMETRY_KEYS.technology] === 'DieCasting' ? 'DieCasting' : 'Embedded';
  const verdict = finAspectRatioVerdict(result?.aspect_ratio);
  const number = (value: number | null | undefined, digits: number) =>
    value == null ? 'N/A' : value.toFixed(digits);

  return (
    <div className="mb-2 rounded-md border border-line bg-surface p-2.5">
      <div className="mb-2">
        <FieldLabel
          label="Fin Technology"
          zh="鰭片製程"
          htmlFor="bc-fin-technology"
          tooltip="決定鰭片導熱係數與拔模角的預設值。"
        />
        <Select
          id="bc-fin-technology"
          className="mt-1 h-8 !text-[12px]"
          value={technology}
          disabled={readOnly}
          items={FIN_TECHNOLOGIES.map((value) => ({
            value,
            label: `${FIN_TECHNOLOGY_LABELS[value].en} / ${FIN_TECHNOLOGY_LABELS[value].zh}`,
          }))}
          onChange={(event) => onPatch(FIN_GEOMETRY_KEYS.technology, event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FIN_GEOMETRY_FIELDS.filter(
          (field) => !field.dieCastingOnly || technology === 'DieCasting',
        ).map((field) => {
          const value = profile.parameters[field.key];
          return (
            <div key={field.key}>
              <FieldLabel
                label={field.label}
                zh={field.zh}
                unit={field.unit || undefined}
                htmlFor={`bc-fin-${field.key}`}
                tooltip={field.tip}
                required={
                  field.key !== FIN_GEOMETRY_KEYS.countOverride &&
                  field.key !== FIN_GEOMETRY_KEYS.draftAngle &&
                  field.key !== FIN_GEOMETRY_KEYS.processEfficiency
                }
              />
              <NumberInput
                id={`bc-fin-${field.key}`}
                className="mt-1 h-8 !text-[12px]"
                step="any"
                placeholder={
                  field.key === FIN_GEOMETRY_KEYS.countOverride
                    ? result != null
                      ? String(result.fin_count)
                      : 'auto'
                    : field.key === FIN_GEOMETRY_KEYS.processEfficiency
                      ? '1.00'
                      : undefined
                }
                value={typeof value === 'number' ? value : ''}
                disabled={readOnly}
                onChange={(event) =>
                  onPatch(field.key, event.target.value === '' ? null : Number(event.target.value))
                }
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 rounded border border-line bg-surface-muted p-2">
        <p className="mb-1.5 text-[10px] font-bold text-ink-600">
          Derived from geometry / 由幾何算出
          <span className="ml-1 font-normal text-ink-400">— 唯讀</span>
        </p>
        {result == null ? (
          <p className="text-[11px] leading-relaxed text-warn-600">
            Geometry incomplete — no coefficients yet.
            <span className="block">幾何尚未填齊，無法計算係數。</span>
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {[
              ['h_conv', `${number(result.h_conv_W_m2K, 2)} W/m²K`],
              ['h_rad', `${number(result.h_rad_W_m2K, 2)} W/m²K`],
              ['h 合計', `${number(result.h_total_W_m2K, 2)} W/m²K`],
              ['η_fin', number(result.eta_fin, 3)],
              ['有效效率 eff', number(result.effectiveness, 3)],
              ['鰭片數', `${result.fin_count} pcs`],
              ['散熱面積', `${number(result.area_m2, 4)} m²`],
              ['流阻比', number(result.aspect_ratio, 2)],
              ['m·Lc', number(result.mLc, 3)],
              ['尖端超溫比', number(result.tipExcessRatio, 3)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-400">{label}</dt>
                <dd className="tabular font-semibold text-ink-800">{value}</dd>
              </div>
            ))}
            <div className="col-span-2 mt-0.5 border-t border-line pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-400">鰭片導熱（根部→表面）</dt>
                <dd className="tabular font-semibold text-ink-800">
                  {number(result.conductionResistance_C_per_W, 4)} °C/W
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-400">表面對流＋輻射</dt>
                <dd className="tabular font-semibold text-ink-800">
                  {number(result.surfaceResistance_C_per_W, 4)} °C/W
                </dd>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 border-t border-line pt-1">
                <dt className="text-ink-500">R = 1 / (h · A · eff)</dt>
                <dd className="tabular font-bold text-ink-900">
                  {number(result.R_C_per_W, 4)} °C/W
                </dd>
              </div>
            </div>
          </dl>
        )}
        {result != null && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
            鰭片不是等溫的：經典解為 θ(x)/θ_root = cosh(m(L−x))/cosh(mL)，尖端超溫為根部的{' '}
            {(result.tipExcessRatio * 100).toFixed(0)}%，而<strong>平均</strong>超溫比恰好就是
            η_fin = {number(result.eta_fin, 3)}。所以這道梯度沒有被忽略——它就是 η_fin 本身。
            上面兩段熱阻即為它拆開後的形式：Screen 05 的「根部→鰭片表面」連結會帶入鰭片導熱那段，
            使該節點顯示鰭片<strong>平均表面溫度</strong>而非根部溫度。
          </p>
        )}

        {/* The same honesty rule the retired radiation sink temperature was
            removed under: a value the screen shows but the solve never reads
            misrepresents what was modelled. Emissivity is still editable in
            Surface Properties and still drives a manually-entered radiation
            profile — it just does not reach THIS surface, and the engineer is
            entitled to know which. */}
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
          發射率與視角因子不參與此表面的計算：h_rad 的關聯式已將表面發射率、通道間的多次反射與
          包絡面積比一併校準在內。表面性質的發射率仍作用於手動輸入的輻射 profile。
        </p>
        {verdict != null && verdict !== 'inside' && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-warn-600">
            流阻比在 {FIN_ASPECT_RATIO_BAND.min}–{FIN_ASPECT_RATIO_BAND.max} 的校準範圍之外
            {verdict === 'narrow' ? '（通道過窄）' : '（通道過寬）'}，此處的 h 為外推值。
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Plate geometry in, one coefficient out.
 *
 * Deliberately smaller than the fin panel. Only `h` is computed here, so only
 * what `h` depends on is asked for — how far the buoyant layer runs, and which
 * way the surface faces. The readout shows the Rayleigh number and the
 * temperature difference behind the coefficient, because a natural-convection h
 * that is quoted without the ΔT it was evaluated at is the kind of number that
 * ends up copied onto a surface it does not describe.
 */
function PlateGeometryPanel({
  profile,
  result,
  ambientTemperature_C,
  readOnly,
  onPatch,
}: {
  profile: BoundaryConditionProfile;
  result: FlatPlateResult | null;
  ambientTemperature_C: number | null;
  readOnly: boolean;
  onPatch: (key: string, value: number | string | boolean | null) => void;
}) {
  const stored = profile.parameters[PLATE_GEOMETRY_KEYS.orientation];
  const orientation: PlateOrientation = (PLATE_ORIENTATIONS as readonly string[]).includes(
    stored as string,
  )
    ? (stored as PlateOrientation)
    : 'Vertical';
  const horizontal = orientation !== 'Vertical';
  const guessed = profile.parameters.surfaceReferenceTemperatureGuess_C == null;

  return (
    <div className="mb-2 rounded-md border border-line bg-surface p-2.5">
      <div className="mb-2">
        <FieldLabel
          label="Surface Orientation"
          zh="表面方位"
          htmlFor="bc-plate-orientation"
          tooltip="決定自然對流的關聯式與特徵長度：垂直面用高度，水平面用面積除以周長。"
        />
        <Select
          id="bc-plate-orientation"
          className="mt-1 h-8 !text-[12px]"
          value={orientation}
          disabled={readOnly}
          items={PLATE_ORIENTATIONS.map((value) => ({
            value,
            label: `${PLATE_ORIENTATION_LABELS[value].en} / ${PLATE_ORIENTATION_LABELS[value].zh}`,
          }))}
          onChange={(event) => onPatch(PLATE_GEOMETRY_KEYS.orientation, event.target.value)}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
          {PLATE_ORIENTATION_LABELS[orientation].note}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel
            label={horizontal ? 'Side A' : 'Height'}
            zh={horizontal ? '邊長 A' : '高度'}
            unit="mm"
            htmlFor={`bc-plate-${PLATE_GEOMETRY_KEYS.height}`}
            tooltip={
              horizontal
                ? '水平板的一個邊長；特徵長度為面積除以周長，所以兩邊都需要。'
                : '浮力沿表面流動的距離，也就是這個面的垂直高度。寬度不影響 h：每一柱空氣各自上升。'
            }
            required
          />
          <NumberInput
            id={`bc-plate-${PLATE_GEOMETRY_KEYS.height}`}
            className="mt-1 h-8 !text-[12px]"
            step="any"
            value={
              typeof profile.parameters[PLATE_GEOMETRY_KEYS.height] === 'number'
                ? (profile.parameters[PLATE_GEOMETRY_KEYS.height] as number)
                : ''
            }
            disabled={readOnly}
            onChange={(event) =>
              onPatch(
                PLATE_GEOMETRY_KEYS.height,
                event.target.value === '' ? null : Number(event.target.value),
              )
            }
          />
        </div>
        {horizontal && (
          <div>
            <FieldLabel
              label="Side B"
              zh="邊長 B"
              unit="mm"
              htmlFor={`bc-plate-${PLATE_GEOMETRY_KEYS.width}`}
              tooltip="水平板的另一個邊長。"
              required
            />
            <NumberInput
              id={`bc-plate-${PLATE_GEOMETRY_KEYS.width}`}
              className="mt-1 h-8 !text-[12px]"
              step="any"
              value={
                typeof profile.parameters[PLATE_GEOMETRY_KEYS.width] === 'number'
                  ? (profile.parameters[PLATE_GEOMETRY_KEYS.width] as number)
                  : ''
              }
              disabled={readOnly}
              onChange={(event) =>
                onPatch(
                  PLATE_GEOMETRY_KEYS.width,
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
            />
          </div>
        )}
      </div>

      <div className="mt-2.5 rounded border border-line bg-surface-muted p-2">
        <p className="mb-1.5 text-[10px] font-bold text-ink-600">
          Derived from geometry / 由幾何算出
          <span className="ml-1 font-normal text-ink-400">— 唯讀</span>
        </p>
        {result == null ? (
          <p className="text-[11px] leading-relaxed text-warn-600">
            {ambientTemperature_C == null
              ? '缺少環境溫度，無法計算對流係數。'
              : '幾何尚未填齊，或表面溫度假設不高於環境溫度，無法計算對流係數。'}
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {[
              ['特徵長度', `${result.characteristicLength_m.toFixed(4)} m`],
              ['ΔT（假設）', `${result.deltaT_C.toFixed(1)} K`],
              ['Ra', result.rayleigh.toExponential(2)],
              ['Nu', result.nusselt.toFixed(1)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-400">{label}</dt>
                <dd className="tabular font-semibold text-ink-800">{value}</dd>
              </div>
            ))}
            <div className="col-span-2 mt-0.5 flex items-baseline justify-between gap-2 border-t border-line pt-1">
              <dt className="text-ink-500">h_conv</dt>
              <dd className="tabular font-bold text-ink-900">
                {result.h_conv_W_m2K.toFixed(2)} W/m²K
              </dd>
            </div>
          </dl>
        )}
        {result != null && guessed && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
            ΔT 來自「表面溫度假設」（留白時以環境溫度 + 35 °C 預估）。h 隨 ΔT 約以四次方根變化，
            所以這個假設偏個十度對 h 的影響在 5% 以內；真實表面溫度由 07 求解。
          </p>
        )}
      </div>
    </div>
  );
}

export function BoundaryInspector({
  port,
  status,
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
  profiles: BoundaryConditionProfile[];
  preferredProfileId?: string | null;
  preview: BoundaryDerivedPreview | undefined;
  validation: BoundaryValidationState;
  ambientTemperature_C: number | null;
  solarEnabled: boolean;
  /** Screen 01's heat sink base, used to seed a fin-geometry profile. */
  heatSinkBase?: { L_mm: number | null; W_mm: number | null } | null;
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
        ? { [FIN_GEOMETRY_KEYS.conductivity]: FIN_TECHNOLOGY_DEFAULT_K_W_mK[technology] }
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
              <ApplicablePreview preview={preview} activeProfile={activeProfile} />
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
