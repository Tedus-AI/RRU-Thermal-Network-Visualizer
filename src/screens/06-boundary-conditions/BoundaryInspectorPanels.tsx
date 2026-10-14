/**
 * Screen 06 boundary inspector: the sections it is assembled from.
 *
 * Inline checks, the applicable pre-solve preview, the assumption notes and
 * surface check, the ambient-reference summary, and the fin-array and
 * flat-plate geometry editors. `BoundaryInspector` owns the state; these only
 * render what they are given and report edits back.
 */

import { CheckCircle2, Thermometer, TriangleAlert } from 'lucide-react';

import { Badge, Button, NumberInput, Select } from '@/ui/primitives';
import { Bi, FieldLabel } from '@/ui/FieldLabel';

import type {
  BoundaryAssumption,
  BoundaryAssumptionKind,
  BoundaryConditionProfile,
  BoundaryDerivedPreview,
  BoundaryPort,
  BoundaryValidationMessage,
} from '@/thermal/boundary/types';
import { FIN_GEOMETRY_KEYS, PLATE_GEOMETRY_KEYS } from '@/thermal/boundary/calculations';
import type { SurfaceAssumptionCheck } from '@/thermal/boundary/assumptionCheck';
import {
  PLATE_ORIENTATIONS,
  PLATE_ORIENTATION_LABELS,
  type FlatPlateResult,
  type PlateOrientation,
} from '@/thermal/boundary/flatPlate';
import {
  FIN_ASPECT_RATIO_BAND,
  FIN_TECHNOLOGIES,
  FIN_TECHNOLOGY_LABELS,
  finAspectRatioVerdict,
  type FinArrayResult,
  type FinTechnology,
} from '@/thermal/boundary/finArray';

import { T06 } from './tooltips';
import { PORT_STATUS_LABELS, formatNumber, formatRth, type PortStatus } from './boundaryViewModel';
import { FIN_GEOMETRY_FIELDS } from './boundaryInspectorFields';

export function Row({
  label,
  zh,
  children,
}: {
  label: string;
  zh?: string;
  children: React.ReactNode;
}) {
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

export function InlineChecks({ messages }: { messages: BoundaryValidationMessage[] }) {
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

export function ApplicablePreview({
  preview,
  activeProfile,
  assumptionCheck,
  readOnly,
  onApplySolvedSurface,
}: {
  preview: BoundaryDerivedPreview | undefined;
  activeProfile: BoundaryConditionProfile;
  assumptionCheck?: SurfaceAssumptionCheck | null;
  readOnly: boolean;
  onApplySolvedSurface: (surface_C: number) => void;
}) {
  const dischargedByCheck =
    preview?.completeness === 'warning' &&
    assumptionCheck?.verdict === 'verified' &&
    assumptionCheck.covers_every_assumption;
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
            preview?.completeness === 'complete' || dischargedByCheck
              ? 'ok'
              : preview?.completeness === 'warning'
                ? 'warn'
                : 'danger'
          }
        >
          {/* The STORED completeness stays `warning` — the set is scenario
              input and must not encode a result. This row reports what the
              screen knows, which after a solve includes the check; a bare
              `warning` beside a green "the assumption holds" was the screen
              contradicting itself. */}
          {dischargedByCheck ? 'verified' : (preview?.completeness ?? 'blocked')}
        </Badge>
      </Row>
      <AssumptionNotes
        assumptions={preview?.assumptions}
        // Only when the check covers everything this port is assuming. A
        // confirmed surface temperature says nothing about a solar estimate
        // sitting beside it, and colouring both green would claim it did.
        verified={
          assumptionCheck?.verdict === 'verified' && assumptionCheck.covers_every_assumption
        }
      />
      <SurfaceAssumptionResult
        check={assumptionCheck}
        readOnly={readOnly}
        onApply={onApplySolvedSurface}
      />
      <p className="mt-2 text-[10px] leading-relaxed text-ink-500">{T06.derived.disclaimer}</p>
    </section>
  );
}

/**
 * Why a fully-filled port still reads `warning`.
 *
 * `warning` is not "you missed a field" — that is `blocked`. It means the
 * numbers above stand on an assumption. Without this the badge was the only
 * thing said, and a port with every input supplied looked broken; the reader
 * had no way to learn that the surface temperature under `h_rad` was a default,
 * let alone what it was set to.
 */
export function AssumptionNotes({
  assumptions,
  verified,
}: {
  assumptions?: BoundaryAssumption[];
  /** A solve has since confirmed the assumption; it is history, not a caution. */
  verified?: boolean;
}) {
  if (!assumptions?.length) return null;
  return (
    <ul
      className={`mt-2 space-y-1 rounded border p-2 ${
        verified ? 'border-ok-500/40 bg-ok-500/10' : 'border-warn-500/40 bg-warn-100'
      }`}
    >
      {assumptions.map((assumption) => {
        const copy = ASSUMPTION_COPY[assumption.kind];
        const value =
          assumption.value != null && Number.isFinite(assumption.value)
            ? copy.format(assumption.value)
            : null;
        return (
          <li
            key={assumption.kind}
            className={`text-[10px] leading-relaxed ${verified ? 'text-ok-600' : 'text-warn-600'}`}
          >
            <span className="font-bold">
              {copy.en}
              {value ? ` (${value})` : ''}
            </span>
            <span className="block">{copy.zh}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The assumption, checked against the solve that followed it.
 *
 * This is the only place Screen 06 shows a number Screen 07 produced, and it is
 * shown as a CHECK, never as an input: the screen's own fields keep the
 * engineer's value until they press Apply. Nothing solved is written into the
 * boundary set — a set that encoded a previous answer would make the next solve
 * depend on the last one (06 §12.1).
 */
export function SurfaceAssumptionResult({
  check,
  readOnly,
  onApply,
}: {
  check?: SurfaceAssumptionCheck | null;
  readOnly: boolean;
  onApply: (surface_C: number) => void;
}) {
  if (!check) return null;

  if (check.verdict === 'unavailable') {
    return (
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
        No current solve to check this against. Run Screen 07 and return here.
        <span className="block">尚無可對照的求解結果；請先於 SCR07 求解後再回到此處。</span>
      </p>
    );
  }

  const verified = check.verdict === 'verified';
  return (
    <div
      className={`mt-1.5 rounded border p-2 text-[10px] leading-relaxed ${
        verified ? 'border-ok-500/40 bg-ok-500/10 text-ok-600' : 'border-accent-500/40 bg-accent-50 text-accent-700'
      }`}
    >
      <p className="font-bold">
        {verified
          ? `Checked against Screen 07: the assumption holds (${formatNumber(check.r_error_pct, 1, '%')} on the boundary).`
          : `Checked against Screen 07: the surface solved at ${formatNumber(check.solved_C, 1, '°C')}, not ${formatNumber(check.assumed_C, 1, '°C')}.`}
      </p>
      <p className="mt-0.5">
        {`assumed ${formatNumber(check.assumed_C, 1, '°C')} → solved ${formatNumber(check.solved_C, 1, '°C')} ` +
          `(${check.delta_C != null && check.delta_C > 0 ? '+' : ''}${formatNumber(check.delta_C, 1, 'K')}); ` +
          `boundary ${formatRth(check.r_assumed_C_per_W)} → ${formatRth(check.r_solved_C_per_W)}`}
      </p>
      {!verified && (
        <>
          <p className="mt-0.5">
            重新以求解出的表面溫度求值，邊界熱阻會改變 {formatNumber(check.r_error_pct, 1, '%')}。
            套用後請重新求解：邊界改變後表面溫度會再動一次，需要再對照一輪。
          </p>
          <button
            type="button"
            disabled={readOnly || check.solved_C == null}
            onClick={() => check.solved_C != null && onApply(check.solved_C)}
            className="mt-1.5 rounded border border-accent-500/50 bg-surface px-2 py-1 text-[10px] font-bold text-accent-700 hover:border-accent-600 disabled:cursor-default disabled:opacity-40"
          >
            Use {formatNumber(check.solved_C, 1, '°C')} / 套用求解值
          </button>
        </>
      )}
    </div>
  );
}

export const ASSUMPTION_COPY: Record<
  BoundaryAssumptionKind,
  { en: string; zh: string; format: (value: number) => string }
> = {
  surface_temperature_guess: {
    en: 'Surface temperature is a pre-solve guess, not a stated value',
    zh: '表面溫度為求解前的預設猜值（環境溫度 + 35 °C），非填入值。h_rad 依此線性化；SCR07 求解後可回填實際表面溫度再重算。',
    format: (value) => `${value.toFixed(1)} °C`,
  },
  plate_convection: {
    // Stands alone. This fires whether or not the surface temperature was
    // stated, so it must not refer to a line above it that may not be there.
    en: 'h is computed from the plate correlation at an assumed surface temperature, not stated',
    zh: 'h 由平板自然對流關聯式算出，並以此表面溫度求值。h_conv 與 h_rad 都隨它變動，SCR07 解出的實際表面溫度若與此不同，這裡的熱阻就會跟著改變。',
    format: (value) => `assumed surface ${value.toFixed(1)} °C`,
  },
  solar_estimate: {
    en: 'Solar input is an estimate until the site is surveyed',
    zh: '日照輸入在現場實測前皆為估計值。',
    format: (value) => `${value.toFixed(2)} W`,
  },
  external_cfd_placeholder: {
    en: 'External CFD placeholder — metadata only, nothing is computed',
    zh: '外部 CFD 佔位符：僅記錄資訊，不參與計算（SCR03 尚未啟用）。',
    format: (value) => String(value),
  },
};

export function AmbientReferenceSummary({
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
export function FinGeometryPanel({
  profile,
  result,
  readOnly,
  onPatch,
  onTechnologyChange,
}: {
  profile: BoundaryConditionProfile;
  result: FinArrayResult | null;
  readOnly: boolean;
  onPatch: (key: string, value: number | string | null) => void;
  onTechnologyChange: (technology: FinTechnology) => void;
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
          onChange={(event) =>
            onTechnologyChange(event.target.value === 'DieCasting' ? 'DieCasting' : 'Embedded')
          }
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
export function PlateGeometryPanel({
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
