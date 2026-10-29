/**
 * Screen 06 boundary inspector: the sections it is assembled from.
 *
 * Inline checks, the applicable pre-solve preview, the assumption notes and
 * surface check, the ambient-reference summary, and the fin-array and
 * flat-plate geometry editors. `BoundaryInspector` owns the state; these only
 * render what they are given and report edits back.
 */

import { Scissors, Thermometer, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
import { PLATE_HEIGHT_SOURCE_KEY, plateHeightFollowsProject } from '@/thermal/boundary/plateHeight';
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
  FIN_TECHNOLOGY_DEFAULT_DRAFT_DEG,
  FIN_TECHNOLOGY_LABELS,
  defaultFinConductivity,
  finAspectRatioVerdict,
  type FinArrayResult,
  type FinTechnology,
} from '@/thermal/boundary/finArray';
import { projectFinTechnology, singleFinSurfacePort } from '@/thermal/boundary/finSpec';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useNetworkStore } from '@/data/networkStore';
import { useProjectStore } from '@/data/projectStore';
import { projectPath } from '@/app/navigation';

import { T06 } from './tooltips';
import { PORT_STATUS_LABELS, formatNumber, formatRth, type PortStatus } from './boundaryViewModel';
import { FIN_GEOMETRY_FIELDS } from './boundaryInspectorFields';
import { ProjectFinField, RruDesignCompare } from './ProjectFinFields';

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
      {/* Chinese first, like every label (docs/APP_SHELL_CONTRACT.md); the English stays in the tooltip. */}
      <span className="shrink-0 text-[11px] text-ink-500" title={zh ? label : undefined}>
        {zh ?? label}
      </span>
      <span className="min-w-0 text-right text-[11px] font-semibold text-ink-900">{children}</span>
    </div>
  );
}

/**
 * This surface's messages, beside its fields. Nothing when there are none:
 * card ④ 檢查 already says the whole page is clean.
 */
export function InlineChecks({ messages }: { messages: BoundaryValidationMessage[] }) {
  if (messages.length === 0) return null;

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
          <p className="text-[11px] font-semibold text-ink-900" title={entry.message}>
            {entry.message_zh || entry.message}
          </p>
          {entry.suggested_action && (
            <p className="mt-0.5 text-[10px] text-ink-400">→ {entry.suggested_action}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

const COMPLETENESS_ZH: Record<string, string> = {
  complete: '完整',
  warning: '含假設',
  blocked: '不完整',
};

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
      <p className="mb-1 text-[11px] font-bold text-accent-700">計算預覽</p>
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
          {dischargedByCheck
            ? '假設已驗證'
            : COMPLETENESS_ZH[preview?.completeness ?? 'blocked'] ?? preview?.completeness}
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
              {copy.title}
              {value ? `（${value}）` : ''}
            </span>
            <span className="block">{copy.body}</span>
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
        還沒有可以對照的求解結果：到 05 求解後回到這裡，會寫出實際表面溫度，並可一鍵帶入「表面溫度假設」。
      </p>
    );
  }

  const verified = check.verdict === 'verified';
  const delta =
    check.delta_C != null ? `${check.delta_C > 0 ? '+' : ''}${formatNumber(check.delta_C, 1, '°C')}` : '—';
  const canApply = !readOnly && check.solved_C != null;
  return (
    <div
      className={`mt-1.5 rounded border p-2 text-[10px] leading-relaxed ${
        verified ? 'border-ok-500/40 bg-ok-500/10 text-ok-600' : 'border-accent-500/40 bg-accent-50 text-accent-700'
      }`}
    >
      <p className="font-bold">
        {verified
          ? `已對照 05：假設成立（邊界熱阻差 ${formatNumber(check.r_error_pct, 1, '%')}）。`
          : `已對照 05：表面解出 ${formatNumber(check.solved_C, 1, '°C')}，不是假設的 ${formatNumber(check.assumed_C, 1, '°C')}。`}
      </p>
      <p className="mt-0.5">
        {`假設 ${formatNumber(check.assumed_C, 1, '°C')} → 05 解出 ${formatNumber(check.solved_C, 1, '°C')}（${delta}）；` +
          `邊界熱阻 ${formatRth(check.r_assumed_C_per_W)} → ${formatRth(check.r_solved_C_per_W)}`}
      </p>
      {!verified && (
        <p className="mt-0.5">
          以解出的表面溫度重新求值，邊界熱阻會改變 {formatNumber(check.r_error_pct, 1, '%')}。
          帶入後請回 05 重新求解：邊界改了，表面溫度會再動一次，需要再對照一輪。
        </p>
      )}
      {/* Click-to-apply: the solved value goes into 表面溫度假設 only when asked. */}
      <button
        type="button"
        disabled={!canApply}
        // Rounded to what the button shows: a stated input, not a solver float.
        onClick={() => check.solved_C != null && onApply(Math.round(check.solved_C * 10) / 10)}
        className={`mt-1.5 rounded border bg-surface px-2 py-1 text-[10px] font-bold disabled:cursor-default disabled:opacity-40 ${
          verified
            ? 'border-ok-500/50 text-ok-600 hover:border-ok-600'
            : 'border-accent-500/50 text-accent-700 hover:border-accent-600'
        }`}
      >
        把 {formatNumber(check.solved_C, 1, '°C')} 帶入「表面溫度假設」
      </button>
      {verified && <span className="ml-1.5 text-[10px] text-ink-400">差距很小，不帶入也可以。</span>}
    </div>
  );
}

export const ASSUMPTION_COPY: Record<
  BoundaryAssumptionKind,
  { title: string; body: string; format: (value: number) => string }
> = {
  surface_temperature_guess: {
    title: '表面溫度是求解前的假設值',
    body: '「表面溫度假設」留白時取環境溫度 + 35 °C。輻射係數 h_rad 依它線性化；05 求解後，下方會寫出實際表面溫度，並可一鍵帶入重算。',
    format: (value) => `${value.toFixed(1)} °C`,
  },
  plate_convection: {
    // Stands alone. This fires whether or not the surface temperature was
    // stated, so it must not refer to a line above it that may not be there.
    title: 'h 由平板自然對流關聯式算出',
    body: '以表面溫度假設求值；h_conv 與 h_rad 都隨它變動。05 解出的實際表面溫度不同時，這裡的熱阻也會跟著改變。',
    format: (value) => `假設表面 ${value.toFixed(1)} °C`,
  },
  solar_estimate: {
    title: '日照輸入是估計值',
    body: '現場實測之前，日照負載都是估計。',
    format: (value) => `${value.toFixed(2)} W`,
  },
  external_cfd_placeholder: {
    title: '外部 CFD 佔位',
    body: '只記錄資訊，不參與計算（FloTHERM 匯入尚未啟用）。',
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
              en="Ready. Screen 05 has an absolute temperature reference."
              zh="已就緒，Screen 05 已具備絕對溫度參考。"
              inline
            />
          ) : (
            <Bi
              en="Ambient temperature is required. Without it, Screen 05 has no absolute temperature reference and solving is blocked."
              zh="必須設定環境溫度；缺少時 05 沒有絕對溫度參考，因此會阻擋求解。"
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
  port,
  profile,
  result,
  readOnly,
  onPatch,
  onTechnologyChange,
}: {
  port: BoundaryPort;
  profile: BoundaryConditionProfile;
  result: FinArrayResult | null;
  readOnly: boolean;
  onPatch: (key: string, value: number | string | null) => void;
  onTechnologyChange: (technology: FinTechnology) => void;
}) {
  const navigate = useNavigate();
  const ports = useBoundaryStore((s) => s.ports);
  const network = useNetworkStore((s) => s.network);
  const draft = useProjectStore((s) => s.draft);
  const technology: FinTechnology =
    profile.parameters[FIN_GEOMETRY_KEYS.technology] === 'DieCasting' ? 'DieCasting' : 'Embedded';
  const verdict = finAspectRatioVerdict(result?.aspect_ratio);
  const number = (value: number | null | undefined, digits: number) =>
    value == null ? 'N/A' : value.toFixed(digits);

  // The fins are the project's when this is the design's one fin surface
  // (`finSpec.ts`); two heat sinks keep theirs per scenario.
  const projectFins = draft != null && singleFinSurfacePort(ports, network)?.id === port.id;
  const finSurfaces = network
    ? ports.filter((entry) => network.nodes[entry.connected_node_id]?.type === 'fin_surface').length
    : 0;
  const projectTechnology =
    projectFins && draft ? projectFinTechnology(draft.project_context.cooling_architecture) : null;
  const baseK = draft?.materials.hsk_base_k_W_mK?.value ?? null;
  const toInfo = () => draft && navigate(projectPath(draft.project_id, 'info'));

  return (
    <div className="mb-2 rounded-md border border-line bg-surface p-2.5" data-fin-panel>
      {projectFins ? (
        <p className="mb-2 text-[10.5px] leading-relaxed text-ink-500" data-fin-shared>
          散熱器只有一組，鰭片是<b className="text-ink-700">專案共用</b>的：每個情境都用這一組，改這裡＝所有情境一起改。
          連結 AI-Thermal 時，5G-RRU 有的值會鎖定，✂ 可以解開自己填。
        </p>
      ) : (
        finSurfaces > 1 && (
          <p className="mb-2 text-[10.5px] leading-relaxed text-ink-500" data-fin-per-scenario>
            這個設計有 {finSurfaces} 組散熱器，鰭片各自在這裡填、每個情境分開存；5G-RRU 只設計一組散熱器，不連動。
          </p>
        )
      )}

      <div className="mb-2">
        <FieldLabel
          label="Fin Technology"
          zh="鰭片製程"
          htmlFor="bc-fin-technology"
          tooltip="決定鰭片導熱係數與拔模角的預設值。"
        />
        {projectTechnology ? (
          <div
            id="bc-fin-technology"
            className="mt-1 flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px]"
            title="鰭片製程取自 01 專案資訊 → 冷卻元素（Embedded Fin／Die-casting Fin）。到 01 修改。"
            data-fin-tech-ref
          >
            <span className="flex-1 text-ink-900">
              {FIN_TECHNOLOGY_LABELS[projectTechnology].zh}
            </span>
            <button
              type="button"
              className="shrink-0 text-[10.5px] font-semibold text-accent-700 hover:underline"
              onClick={toInfo}
            >
              取自 01
            </button>
          </div>
        ) : (
          <>
            <Select
              id="bc-fin-technology"
              className="mt-1 h-8 !text-[12px]"
              value={technology}
              disabled={readOnly}
              items={FIN_TECHNOLOGIES.map((value) => ({
                value,
                label: FIN_TECHNOLOGY_LABELS[value].zh,
              }))}
              onChange={(event) =>
                onTechnologyChange(event.target.value === 'DieCasting' ? 'DieCasting' : 'Embedded')
              }
            />
            {projectFins && (
              <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
                01 的冷卻元素沒有指定一種鰭片製程，這裡選的只用在這個情境。在 01 勾 Embedded Fin 或 Die-casting
                Fin（只勾一個），所有情境就會一起用。
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FIN_GEOMETRY_FIELDS.filter(
          (field) => !field.dieCastingOnly || technology === 'DieCasting',
        ).map((field) => {
          const value = profile.parameters[field.key];
          const required =
            field.key !== FIN_GEOMETRY_KEYS.countOverride &&
            field.key !== FIN_GEOMETRY_KEYS.draftAngle &&
            field.key !== FIN_GEOMETRY_KEYS.processEfficiency &&
            field.key !== FIN_GEOMETRY_KEYS.conductivity;
          const placeholder =
            field.key === FIN_GEOMETRY_KEYS.countOverride
              ? result != null
                ? `${result.fin_count}（自動）`
                : '自動'
              : field.key === FIN_GEOMETRY_KEYS.processEfficiency
                ? '1.00'
                : field.key === FIN_GEOMETRY_KEYS.conductivity
                  ? `${defaultFinConductivity(technology, baseK)}（製程預設）`
                  : field.key === FIN_GEOMETRY_KEYS.draftAngle
                    ? `${FIN_TECHNOLOGY_DEFAULT_DRAFT_DEG.DieCasting}（預設）`
                    : undefined;
          if (projectFins) {
            return (
              <ProjectFinField
                key={field.key}
                field={field}
                profile={profile}
                placeholder={placeholder}
                readOnly={readOnly}
                required={required}
                onClearProfile={(key) =>
                  draft && useBoundaryStore.getState().clearProjectFin(draft.project_id, [key])
                }
              />
            );
          }
          return (
            <div key={field.key}>
              <FieldLabel
                label={field.label}
                zh={field.zh}
                unit={field.unit || undefined}
                htmlFor={`bc-fin-${field.key}`}
                tooltip={field.tip}
                required={required}
              />
              <NumberInput
                id={`bc-fin-${field.key}`}
                className="mt-1 h-8 !text-[12px]"
                step="any"
                placeholder={placeholder}
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
          由幾何算出<span className="ml-1 font-normal text-ink-400">（唯讀）</span>
        </p>
        {result == null ? (
          <p className="text-[11px] leading-relaxed text-warn-600">幾何還沒填齊，算不出係數。</p>
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
          <details className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
            <summary className="cursor-pointer font-semibold text-ink-500">鰭片的溫度梯度怎麼算進去？</summary>
            <p className="mt-1">
              鰭片不是等溫的：經典解為 θ(x)/θ_root = cosh(m(L−x))/cosh(mL)，尖端超溫為根部的{' '}
              {(result.tipExcessRatio * 100).toFixed(0)}%，而<strong>平均</strong>超溫比恰好就是
              η_fin = {number(result.eta_fin, 3)}。所以這道梯度沒有被忽略——它就是 η_fin 本身。
              上面兩段熱阻即為它拆開後的形式：熱網路的「根部→鰭片表面」連結會帶入鰭片導熱那段，
              使該節點顯示鰭片<strong>平均表面溫度</strong>而非根部溫度。
            </p>
          </details>
        )}

        {/* The same honesty rule the retired radiation sink temperature was
            removed under: a value the screen shows but the solve never reads
            misrepresents what was modelled. Emissivity is still editable in
            Surface Properties and still drives a manually-entered radiation
            profile — it just does not reach THIS surface, and the engineer is
            entitled to know which. */}
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
          發射率不另外算：h_rad 的關聯式已含表面發射率與鰭片之間的多次反射（表面性質的發射率只用在手動輸入的輻射條件）。
        </p>
        {verdict != null && verdict !== 'inside' && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-warn-600">
            流阻比在 {FIN_ASPECT_RATIO_BAND.min}–{FIN_ASPECT_RATIO_BAND.max} 的校準範圍之外
            {verdict === 'narrow' ? '（通道過窄）' : '（通道過寬）'}，此處的 h 為外推值。
          </p>
        )}
      </div>
      {projectFins && <RruDesignCompare result={result} />}
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
  // A vertical face is as tall as the machine unless taken over (`plateHeight.ts`).
  const navigate = useNavigate();
  const draft = useProjectStore((s) => s.draft);
  const machineHeight = draft?.materials.hsk_base_L_mm?.value ?? null;
  const heightLinked = !horizontal && plateHeightFollowsProject(profile, machineHeight);

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
        <div className={horizontal ? undefined : 'col-span-2'}>
          <FieldLabel
            label={horizontal ? 'Side A' : 'Height'}
            zh={horizontal ? '邊長 A' : '高度'}
            unit="mm"
            htmlFor={`bc-plate-${PLATE_GEOMETRY_KEYS.height}`}
            tooltip={
              horizontal
                ? '水平板的一個邊長；特徵長度為面積除以周長，所以兩邊都需要。'
                : '浮力沿表面流動的距離，也就是這個面的垂直高度。寬度不影響 h：每一柱空氣各自上升。預設取 01 的機台高度（散熱器底座長 L，吊掛時是上下方向）。'
            }
            required
          />
          {heightLinked ? (
            <div
              id={`bc-plate-${PLATE_GEOMETRY_KEYS.height}`}
              className="mt-1 flex h-8 max-w-[14rem] items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px]"
              title="取自 01 的機台高度（材料與製程預設 → 散熱器底座 長 L；吊掛時是上下方向）。這個面不是整機高時按 ✂ 自己填。"
            >
              <span className="tabular flex-1 text-ink-900">{machineHeight}</span>
              <button
                type="button"
                className="shrink-0 text-[10.5px] font-semibold text-accent-700 hover:underline"
                onClick={() => draft && navigate(projectPath(draft.project_id, 'info'))}
              >
                01 機台高度
              </button>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="解開：自己填這個面的高度"
                  title="解開：這個面不是整機高時，自己填高度"
                  className="shrink-0 text-ink-400 hover:text-accent-700"
                  onClick={() => onPatch(PLATE_HEIGHT_SOURCE_KEY, 'manual')}
                >
                  <Scissors size={12} aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <NumberInput
              id={`bc-plate-${PLATE_GEOMETRY_KEYS.height}`}
              className={`mt-1 h-8 !text-[12px] ${horizontal ? '' : 'max-w-[14rem]'}`}
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
          )}
          {!horizontal && !heightLinked && machineHeight != null && (
            <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
              已解開・01 機台高度是 {machineHeight} mm
              {!readOnly && (
                <button
                  type="button"
                  className="ml-1.5 font-semibold text-accent-700 hover:underline"
                  onClick={() => onPatch(PLATE_HEIGHT_SOURCE_KEY, 'project')}
                >
                  ↺ 改回 01
                </button>
              )}
            </p>
          )}
          {!horizontal && machineHeight == null && (
            <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
              01 還沒有散熱器底座長 L（機台高度）；填了以後這裡會自動帶入。
            </p>
          )}
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
          由幾何算出<span className="ml-1 font-normal text-ink-400">（唯讀）</span>
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
              ['ΔT（假設）', `${result.deltaT_C.toFixed(1)} °C`],
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
            所以這個假設偏個十度對 h 的影響在 5% 以內；真實表面溫度由 05 求解。
          </p>
        )}
      </div>
    </div>
  );
}
