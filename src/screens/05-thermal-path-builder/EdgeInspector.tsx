/**
 * Edge Inspector — 05 §27, §28.
 *
 * Tabs: Overview / Model / Parameters / Source / External Mapping.
 *
 * Two rules this panel exists to hold the line on:
 *   • no heat flow Q and no ΔT are shown — Screen 05 has not solved anything;
 *   • a missing parameter yields UNRESOLVED, never 0 (05 §22, §45, AC-05-35).
 */

import { useState } from 'react';
import { Link2, Link2Off, Power, RefreshCw, Trash2 } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import { activeRth, setRthFromSource } from '@/thermal/rth';
import { computeRth } from '@/thermal/resistance/calculators';
import { discSpreadingResistance, type SpreadingVariant } from '@/thermal/resistance/spreading';
import {
  EDGE_TYPES,
  type Confidence,
  type DataSource,
  type EdgeMethod,
  type EdgeType,
  type ThermalEdge,
  type ThermalNetwork,
} from '@/thermal/types';
import type { ScenarioBoundaryEdgeView } from './scenarioBoundaryProjection';

const TABS = [
  { id: 'overview', label: 'Overview', zh: '總覽' },
  { id: 'model', label: 'Model', zh: '模型' },
  { id: 'parameters', label: 'Parameters', zh: '參數' },
  { id: 'source', label: 'Source', zh: '來源' },
  { id: 'mapping', label: 'External Mapping', zh: '外部對照' },
] as const;

type Tab = (typeof TABS)[number]['id'];

const METHODS: Array<{ value: EdgeMethod; label: string }> = [
  { value: 'direct_rth', label: 'Direct Rth / Package Rjc' },
  { value: 'conduction_LkA', label: 'Solid conduction L/kA' },
  { value: 'tim_thickness_k', label: 'TIM t/kA' },
  { value: 'via_array', label: 'Thermal via equivalent' },
  { value: 'contact_area', label: 'Contact (quoted Rth)' },
  { value: 'contact_hc', label: 'Bare metal contact 1/h·A' },
  { value: 'spreading_disc', label: 'Spreading into a plate (Lee et al.)' },
  { value: 'solder_voiding', label: 'Solder' },
  { value: 'convection_hA', label: 'Boundary derived (convection)' },
  { value: 'radiation_hA', label: 'Boundary derived (radiation)' },
  { value: 'imported', label: 'Unresolved / imported later' },
];

/** Which numeric inputs each method needs, in the order they should be shown. */
const METHOD_PARAMETERS: Record<
  EdgeMethod,
  Array<{ key: string; label: string; zh: string; unit: string }>
> = {
  direct_rth: [{ key: 'R_C_per_W', label: 'Rth', zh: '熱阻', unit: '°C/W' }],
  contact_area: [{ key: 'R_C_per_W', label: 'Contact Rth', zh: '接觸熱阻', unit: '°C/W' }],
  contact_hc: [
    {
      key: 'h_c_W_m2K',
      label: 'Contact conductance',
      zh: '接觸熱導',
      unit: 'W/m²·K',
    },
    { key: 'area_mm2', label: 'Contact area', zh: '接觸面積', unit: 'mm²' },
  ],
  solder_voiding: [
    {
      key: 'thickness_mm',
      label: 'Solder thickness',
      zh: '焊料厚度',
      unit: 'mm',
    },
    { key: 'k_W_mK', label: 'Conductivity k', zh: '熱傳導率', unit: 'W/m·K' },
    { key: 'area_mm2', label: 'Joint area', zh: '焊接面積', unit: 'mm²' },
    { key: 'voiding', label: 'Effective area', zh: '有效面積率', unit: '—' },
  ],
  conduction_LkA: [
    { key: 'length_mm', label: 'Length', zh: '長度', unit: 'mm' },
    { key: 'k_W_mK', label: 'Conductivity k', zh: '熱傳導率', unit: 'W/m·K' },
    { key: 'area_mm2', label: 'Area', zh: '截面積', unit: 'mm²' },
  ],
  tim_thickness_k: [
    { key: 'thickness_mm', label: 'Thickness', zh: '厚度', unit: 'mm' },
    { key: 'k_W_mK', label: 'Conductivity k', zh: '熱傳導率', unit: 'W/m·K' },
    { key: 'area_mm2', label: 'Effective area', zh: '有效面積', unit: 'mm²' },
  ],
  via_array: [
    { key: 'thickness_mm', label: 'Board thickness', zh: '板厚', unit: 'mm' },
    {
      key: 'effective_k_W_mK',
      label: 'Effective k',
      zh: '等效熱傳導率',
      unit: 'W/m·K',
    },
    {
      key: 'area_mm2',
      label: 'Via region area',
      zh: '導熱孔區面積',
      unit: 'mm²',
    },
    { key: 'via_efficiency', label: 'Efficiency', zh: '效率係數', unit: '—' },
  ],
  spreading_disc: [
    {
      key: 'source_area_mm2',
      label: 'Contact area',
      zh: '接觸面積',
      unit: 'mm²',
    },
    {
      key: 'plate_area_mm2',
      label: 'Plate area',
      zh: '底座面積',
      unit: 'mm²',
    },
    {
      key: 'thickness_mm',
      label: 'Plate thickness',
      zh: '底座厚度',
      unit: 'mm',
    },
    { key: 'k_W_mK', label: 'Conductivity k', zh: '熱傳導率', unit: 'W/m·K' },
  ],
  convection_hA: [],
  radiation_hA: [],
  imported: [],
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

/**
 * The spreading edge, shown as the model it came from.
 *
 * A single number here would be indistinguishable from the t/(k·A) it replaced,
 * and the whole point is that they differ — so the panel prints ε and τ, splits
 * the result into the one-dimensional drop through the plate and what the
 * fan-out adds on top of it, and states the Bi → ∞ assumption, because that one
 * biases the answer LOW and a reader has a right to know which way an
 * assumption cuts.
 *
 * It also prints the familiar p.205 correlation beside the exact series. An
 * engineer checking this by hand will reach for the correlation, and at the
 * thin bases this tool models the two differ by 3–21% — better to show the gap
 * than to let someone find it and assume the tool is wrong.
 */
function SpreadingBreakdown({
  edge,
  readOnly,
  onVariant,
}: {
  edge: ThermalEdge;
  readOnly: boolean;
  onVariant: (variant: SpreadingVariant) => void;
}) {
  const params = edge.parameters ?? {};
  const number = (key: string) =>
    typeof params[key] === 'number' ? (params[key] as number) : null;
  const variant: SpreadingVariant = params.psi_variant === 'avg' ? 'avg' : 'max';
  const A_s = number('source_area_mm2');
  const A_p = number('plate_area_mm2');
  const t = number('thickness_mm');
  const k = number('k_W_mK');

  const result =
    A_s != null && A_p != null && t != null && k != null
      ? discSpreadingResistance({
          source_area_mm2: A_s,
          plate_area_mm2: A_p,
          thickness_mm: t,
          k_W_mK: k,
          bi: number('bi'),
          variant,
        })
      : null;

  return (
    <section className="mt-3 rounded-md border border-line p-2.5">
      <p className="text-[11px] font-bold text-ink-700">
        Spreading model <span className="font-semibold text-ink-400">/ 擴散熱阻模型</span>
      </p>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-500">
        a = √(A_s/π), b = √(A_p/π), ε = a/b, τ = t/b, Φₙ = tanh(λₙτ) at Bi → ∞
        <br />
        {variant === 'avg'
          ? 'Ψ_ave = (4/√π·ε) Σ J₁²(λₙε)/(λₙ³J₀²(λₙ))·Φₙ'
          : 'Ψ_max = (2/√π) Σ J₁(λₙε)/(λₙ²J₀²(λₙ))·Φₙ'}
        <br />
        J₁(λₙ) = 0 · R = R_m + Ψ/(k·√A_s), R_m = t/(k·A_p)
      </p>

      <div className="mt-2">
        <FieldLabel label="Source temperature" zh="熱源溫度取法" htmlFor="edge-psi-variant" />
        <Select
          id="edge-psi-variant"
          className="mt-1 h-8 !text-[12px]"
          value={variant}
          disabled={readOnly}
          items={[
            { value: 'max', label: 'Peak, under the source (Ψ_max)' },
            { value: 'avg', label: 'Average over the contact patch (Ψ_avg)' },
          ]}
          onChange={(event) => onVariant(event.target.value as SpreadingVariant)}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
          Peak is the default: the junction chain above this edge hangs off the hottest point of the
          contact patch, so sizing a margin against the average would flatter it. /
          預設取峰值，因為接面餘裕要看熱源正下方最高溫。
        </p>
      </div>

      {result ? (
        <div className="mt-2">
          <Row label="ε = a/b" zh="相對熱源尺寸">
            {result.epsilon.toFixed(4)}
          </Row>
          <Row label="τ = t/b" zh="相對板厚">
            {result.tau.toFixed(4)}
          </Row>
          <Row label="Ψ (exact series)" zh="精確級數">
            {result.psi.toFixed(4)}
          </Row>
          <Row label="Ψ (p.205 correlation)" zh="封閉解對照">
            <span className="text-ink-500">
              {result.psi_correlation.toFixed(4)}
              {result.psi > 0 && (
                <span className="ml-1 text-ink-400">
                  ({(100 * (result.psi_correlation / result.psi - 1)).toFixed(1)}%)
                </span>
              )}
            </span>
          </Row>
          <Row label="1D through plate (R_m)" zh="板厚一維">
            {result.R_1d_C_per_W.toFixed(4)} °C/W
          </Row>
          <Row label="Spreading (R_c)" zh="擴散">
            {result.R_spreading_C_per_W.toFixed(4)} °C/W
          </Row>
          <Row label="Total" zh="合計">
            {result.R_C_per_W.toFixed(4)} °C/W
          </Row>
          {result.saturated && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-warn-600">
              The contact patch is as large as the plate, so there is nothing left to spread into
              and this is plain 1D conduction. / 接觸面積已等於底座面積，無擴散可言。
            </p>
          )}
          {result.epsilon_out_of_range && !result.saturated && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-warn-600">
              ε is outside 0.05–0.833, the range Lee validated. The exact series still solves the
              stated geometry, but this contact is smaller relative to the base than the published
              comparisons covered. / ε 超出 Lee 驗證過的 0.05–0.833
              區間，數值仍是該幾何的精確解，但已在文獻比對範圍之外。
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed text-warn-600">
          Fill the four parameters on the Parameters tab to see the breakdown. /
          請在「參數」分頁補齊四項輸入。
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
        Lee, Song, Au &amp; Moran (1995), eq. (19)–(21) — the exact series, not the p.205
        correlation, because at this plate thickness the correlation runs 3–21% low. The total
        already includes the drop through the plate thickness (Lee&rsquo;s R_m), so do not add a
        separate L/kA edge across the same plate. /
        採用精確級數而非封閉近似解；此結果已含板厚一維熱阻，勿再串一段 L/kA。
      </p>
    </section>
  );
}

/**
 * What the active scenario's boundary rests on, for one edge.
 *
 * Every row here is read from the SAME preview that produced the resistance in
 * the last row, so `1/(h·A)` reproduces it. That was not previously true: the
 * coefficients were read from the profile's stored `h_W_m2K` and `area_m2`,
 * which a finned profile no longer uses, and the panel could show 8.00 W/m²·K
 * over 0.890 m² next to 0.1263 °C/W — three numbers that cannot all be right.
 */
function BoundaryParametersPanel({ view }: { view?: ScenarioBoundaryEdgeView }) {
  const dash = (unit: string) => <span className="text-ink-400">— {unit}</span>;
  const finConduction = view?.kind === 'fin_conduction';

  return (
    <section className="mt-2 rounded-md border border-line bg-surface-muted p-2.5">
      <p className="flex items-center gap-1 text-[11px] font-bold text-ink-700">
        {finConduction ? 'Fin Conduction / 鰭片導熱' : 'Boundary Parameters / 邊界參數'}
        <span className="font-semibold text-ink-400">(Screen 06)</span>
      </p>

      {finConduction ? (
        <>
          <Row label="Fin Efficiency η" zh="鰭片效率">
            {view?.fin != null ? view.fin.eta_fin.toFixed(4) : dash('')}
          </Row>
          <Row label="Effectiveness η·process" zh="有效係數">
            {view?.fin != null ? view.fin.effectiveness.toFixed(4) : dash('')}
          </Row>
          <Row label="Fin Parameter m·Lc" zh="鰭片參數">
            {view?.fin != null ? view.fin.mLc.toFixed(4) : dash('')}
          </Row>
          <Row label="Tip / Root Excess" zh="尖端與根部溫升比">
            {view?.fin != null ? view.fin.tipExcessRatio.toFixed(4) : dash('')}
          </Row>
          <Row label="Root → Mean Surface Rth" zh="根部至平均表面熱阻">
            {view?.rth_C_per_W != null ? `${view.rth_C_per_W.toFixed(4)} °C/W` : dash('°C/W')}
          </Row>
        </>
      ) : (
        <>
          <Row
            label={view?.kind === 'radiation' ? 'Radiation h' : 'Convection h'}
            zh={view?.kind === 'radiation' ? '輻射係數' : '對流係數'}
          >
            {view?.h_W_m2K != null ? `${view.h_W_m2K.toFixed(2)} W/m²·K` : dash('W/m²·K')}
          </Row>
          {/* Split out only where the edge really carries both mechanisms; on a
              single-mechanism edge the row above already IS that mechanism. */}
          {view?.kind === 'combined' && view.h_conv_W_m2K != null && view.h_rad_W_m2K != null && (
            <Row label="├ h_conv + h_rad" zh="對流＋輻射分項">
              {`${view.h_conv_W_m2K.toFixed(2)} + ${view.h_rad_W_m2K.toFixed(2)} W/m²·K`}
            </Row>
          )}
          <Row label="Radiation ε" zh="輻射率">
            {view?.source === 'fin_geometry' ? (
              <span className="text-ink-400">
                In h_rad / 已含於 h_rad
              </span>
            ) : view?.emissivity != null ? (
              view.emissivity.toFixed(3)
            ) : (
              dash('')
            )}
          </Row>
          <Row label="Effective Area" zh="有效面積">
            {view?.area_m2 != null ? `${view.area_m2.toFixed(6)} m²` : dash('m²')}
          </Row>
          <Row label="Ambient Temperature" zh="環境溫度">
            {view?.ambient_C != null ? `${view.ambient_C.toFixed(1)} °C` : dash('°C')}
          </Row>
          <Row label="Boundary Rth Preview" zh="邊界熱阻預覽">
            {view?.rth_C_per_W != null ? `${view.rth_C_per_W.toFixed(4)} °C/W` : dash('°C/W')}
          </Row>
        </>
      )}

      {view != null && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
          {view.source === 'fin_geometry'
            ? 'Computed from the fin geometry, not from a stated h and area. The fin efficiency is NOT folded into h here — it sits on the fin-root link as the fin’s own conduction. / 由鰭片幾何計算，非直接填入的 h 與面積；鰭片效率不併入 h，而是以鰭片本體導熱掛在根部連結上。'
            : view.source === 'plate_convection'
              ? 'h computed from the plate geometry and an assumed surface temperature; it will shift once Screen 07 solves. / h 由平板幾何與假設表面溫度算出，SCR07 求解後會再變動。'
              : 'h and area as stated on the Screen 06 profile. / h 與面積為 SCR06 設定檔直接填入之值。'}
        </p>
      )}
    </section>
  );
}

function isIsothermalLink(edge: ThermalEdge): boolean {
  return edge.parameters?.ideal_link === true;
}

function formatRth(value: number | null | undefined, isothermal = false): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (isothermal && value > 0 && value < 0.0001) return '< 0.0001 °C/W';
  return `${value.toFixed(4)} °C/W`;
}

function statusOf(
  edge: ThermalEdge,
  scenarioBoundary?: ScenarioBoundaryEdgeView,
): {
  tone: 'ok' | 'warn' | 'danger';
  label: string;
} {
  if (!edge.enabled) return { tone: 'warn', label: 'Disabled' };
  if (scenarioBoundary?.resolved) return { tone: 'ok', label: 'Scenario Resolved' };
  if (edge.resolution === 'resolved') return { tone: 'ok', label: 'Resolved' };
  if (edge.method === 'convection_hA' || edge.method === 'radiation_hA') {
    return { tone: 'warn', label: 'Boundary Required' };
  }
  return { tone: 'warn', label: 'Unresolved' };
}

export function EdgeInspector({
  embedded = false,
  edge,
  network,
  readOnly,
  readiness,
  scenarioBoundary,
  onPatch,
  onDelete,
  onReverse,
}: {
  /** FloatingPanel already owns the title and scrolling when embedded. */
  embedded?: boolean;
  edge: ThermalEdge;
  network: ThermalNetwork;
  readOnly: boolean;
  /** Whole-network validation counts, shown as the Readiness footer (05.png). */
  readiness: { errors: number; warnings: number; info: number };
  /** Active Screen 06 values, shown without writing them into this topology edge. */
  scenarioBoundary?: ScenarioBoundaryEdgeView;
  onPatch: (patch: Partial<ThermalEdge>) => void;
  onDelete: () => void;
  onReverse: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  // A scenario projection outranks the stored ideal_link flag: once fin
  // geometry is stated the same step carries the fin's own conduction, and
  // presenting it as an isothermal link would contradict the resistance shown
  // one row above it.
  const isothermal = isIsothermalLink(edge) && scenarioBoundary == null;
  const R = scenarioBoundary?.rth_C_per_W ?? activeRth(edge.rth);
  const formattedRth = formatRth(R, isothermal);
  const status = statusOf(edge, scenarioBoundary);
  const from = network.nodes[edge.from]?.name ?? edge.from;
  const to = network.nodes[edge.to]?.name ?? edge.to;

  /** Recomputes the analytical slot; the manual slot is never touched. */
  const applyParameters = (parameters: ThermalEdge['parameters'], method = edge.method) => {
    const computed = computeRth(method, (parameters ?? {}) as Record<string, number>);
    onPatch({
      method,
      parameters,
      rth: setRthFromSource(
        edge.rth,
        'Analytical',
        computed.value,
        computed.value == null ? 'low' : 'medium',
      ),
      resolution:
        edge.rth.active_source === 'Manual' && edge.rth.manual != null
          ? 'resolved'
          : computed.resolution,
      resolution_note:
        computed.note ??
        (computed.missing.length > 0 ? `Missing input: ${computed.missing.join(', ')}` : undefined),
      origin: edge.origin ? { ...edge.origin, modified: true } : { kind: 'manual' },
    });
  };

  return (
    <div
      className={`flex min-h-0 flex-col ${embedded ? 'rounded-lg border border-line bg-surface' : ''}`}
    >
      {!embedded && (
        <header className="border-b border-line px-3.5 py-2.5">
          <p className="truncate text-[13px] font-bold text-ink-900">Edge: {edge.id}</p>
          <p className="truncate text-[11px] text-ink-500">
            {from} → {to}
          </p>
        </header>
      )}

      <nav
        className={`flex gap-0.5 border-b border-line px-2 pt-1.5 ${embedded ? 'flex-wrap' : 'overflow-x-auto'}`}
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
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

      <div className={`min-h-0 flex-1 p-3.5 ${embedded ? '' : 'overflow-auto'}`}>
        {tab === 'overview' && (
          <div className={embedded ? 'grid gap-3 md:grid-cols-2' : ''}>
            <div>
              <Row label="From" zh="起點">
                {from}
              </Row>
              <Row label="To" zh="終點">
                {to}
              </Row>
              <Row label="Type" zh="類型">
                {edge.type}
              </Row>
              <Row label="Method" zh="方法">
                {isothermal
                  ? 'Isothermal solver link / 等溫求解連結'
                  : (METHODS.find((method) => method.value === edge.method)?.label ?? edge.method)}
              </Row>
              <Row label="Active Rth Source" zh="使用中熱阻來源">
                {formattedRth != null ? (
                  `${scenarioBoundary ? `Screen 06 · ${scenarioBoundary.scenario_id}` : edge.rth.active_source} · ${formattedRth}`
                ) : (
                  <BilingualTooltip zh={TOOLTIPS_ZH.unresolvedRth}>
                    <span className="text-warn-600">Unresolved</span>
                  </BilingualTooltip>
                )}
              </Row>
              <Row label="Status" zh="狀態">
                <Badge tone={status.tone}>{status.label}</Badge>
              </Row>
              <Row label="Enabled" zh="啟用">
                {edge.enabled ? 'Yes' : 'No'}
              </Row>
              <Row label="Direction" zh="標示方向">
                Nominal ({from} → {to})
              </Row>

              {(scenarioBoundary?.resolved || edge.resolution_note) && (
                <p
                  className={`mt-2 rounded border p-2 text-[10px] leading-relaxed ${
                    scenarioBoundary?.resolved || isothermal
                      ? 'border-accent-500/40 bg-accent-50 text-accent-700'
                      : 'border-warn-500/40 bg-warn-100 text-warn-600'
                  }`}
                >
                  {scenarioBoundary?.resolved
                    ? scenarioBoundary.kind === 'fin_conduction'
                      ? 'The fin’s own conduction, from the Screen 06 fin geometry. The stored link is isothermal; the active scenario replaces it so the surface node reports the MEAN fin temperature instead of repeating the root’s. / 此為 SCR06 鰭片幾何算出的鰭片本體導熱；拓樸上仍存等溫連結，目前情境將其取代，使表面節點代表鰭片平均溫度而非根部溫度。'
                      : `Active scenario boundary preview from Screen 06; the Screen 05 topology remains unchanged. / 已套用 SCR06 目前情境的邊界熱阻預覽，SCR05 拓樸本身未被改寫。`
                    : isothermal
                      ? 'This is an intentionally near-zero solver link, not a missing resistance. It carries the fin’s conduction once Screen 06 states the fin geometry for this scenario. / 此為刻意設定的近零等溫求解連結，並非漏填熱阻；待 SCR06 於本情境填入鰭片幾何後，此連結即承載鰭片本體導熱。'
                      : edge.resolution_note}
                </p>
              )}

              <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
                {scenarioBoundary
                  ? 'This Rth is a pre-solve boundary input. Heat flow Q and ΔT remain unavailable until Screen 07 solves the active scenario. / 此熱阻僅為求解前的邊界輸入；須由 SCR07 求解目前情境後才會有 Q 與 ΔT。'
                  : 'Heat flow Q and ΔT are not shown here: Screen 05 has not run a solve (05 §22). / SCR05 尚未求解，因此不顯示 Q 與 ΔT。'}
              </p>

              {(scenarioBoundary != null ||
                edge.method === 'convection_hA' ||
                edge.method === 'radiation_hA') && (
                <BoundaryParametersPanel view={scenarioBoundary} />
              )}
            </div>
            <div>
              <section className="mt-3 rounded-md border border-line p-2.5">
                <p className="text-[11px] font-bold text-ink-700">
                  Source <span className="font-semibold text-ink-400">/ 來源 (Provenance)</span>
                </p>
                <Row label="Analytical (Rth / Model)">
                  {edge.rth.analytical != null ? (
                    formatRth(edge.rth.analytical, isothermal)
                  ) : (
                    <span className="text-ink-400">Not Defined</span>
                  )}
                </Row>
                {scenarioBoundary && (
                  <Row label="Screen 06 Scenario Preview">
                    {scenarioBoundary.rth_C_per_W != null ? (
                      `${scenarioBoundary.rth_C_per_W.toFixed(4)} °C/W`
                    ) : (
                      <span className="text-ink-400">Not Ready</span>
                    )}
                  </Row>
                )}
                <Row label="Manual / Override">
                  {edge.rth.manual != null ? (
                    `${edge.rth.manual.toFixed(4)} °C/W`
                  ) : (
                    <span className="text-ink-400">None</span>
                  )}
                </Row>
                <Row label="Future / Measurement">
                  <span className="text-ink-400">Reserved</span>
                </Row>
                <Row label="FloTHERM (Deferred)">
                  <span className="text-ink-400">Not Imported (Screen 03)</span>
                </Row>
              </section>

              <section className="mt-3 rounded-md border border-line p-2.5">
                <p className="text-[11px] font-bold text-ink-700">
                  External Mapping <span className="font-semibold text-ink-400">/ 外部對照</span>
                </p>
                <Row label="FloTHERM">
                  {edge.external_mappings?.flotherm?.object_aliases?.length ? (
                    edge.external_mappings.flotherm.object_aliases.join(', ')
                  ) : (
                    <span className="text-ink-400">Not Mapped</span>
                  )}
                </Row>
              </section>

              <section className="mt-3 rounded-md border border-line p-2.5">
                <p className="text-[11px] font-bold text-ink-700">
                  Readiness <span className="font-semibold text-ink-400">/ 驗證狀態</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                  <span className="text-danger-600">{readiness.errors} Blocking Errors</span>
                  <span className="text-warn-600">{readiness.warnings} Warnings</span>
                  <span className="text-accent-600">{readiness.info} Info</span>
                </div>
              </section>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  className="h-8"
                  disabled={readOnly}
                  icon={<Power size={13} />}
                  onClick={() => onPatch({ enabled: !edge.enabled })}
                >
                  {edge.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button className="h-8" disabled={readOnly} onClick={onReverse}>
                  Reverse direction
                </Button>
                <Button
                  variant="danger"
                  className="h-8"
                  disabled={readOnly}
                  icon={<Trash2 size={13} />}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-ink-400">
                Reversing changes the nominal label only. Conduction is not one-way (05 §51). /
                反轉僅改變顯示方向，導熱本身並非單向。
              </p>
            </div>
          </div>
        )}

        {tab === 'model' && (
          <div>
            <FieldLabel label="Edge Type" zh="連線類型" htmlFor="edge-type" />
            <Select
              id="edge-type"
              className="mt-1 mb-2 h-8 !text-[12px]"
              value={edge.type}
              disabled={readOnly}
              options={EDGE_TYPES}
              onChange={(event) =>
                onPatch({
                  type: event.target.value as EdgeType,
                  origin: edge.origin ? { ...edge.origin, modified: true } : { kind: 'manual' },
                })
              }
            />

            <FieldLabel label="Rth Method" zh="熱阻方法" htmlFor="edge-method" />
            <Select
              id="edge-method"
              className="mt-1 h-8 !text-[12px]"
              value={edge.method}
              disabled={readOnly}
              items={METHODS}
              onChange={(event) =>
                applyParameters(edge.parameters, event.target.value as EdgeMethod)
              }
            />

            <div className="mt-3 rounded-md border border-line bg-surface-muted p-2.5">
              <Row label="Calculated Rth" zh="計算熱阻">
                {formattedRth != null ? (
                  formattedRth
                ) : (
                  <span className="text-warn-600">Unresolved</span>
                )}
              </Row>
              {(edge.method === 'convection_hA' || edge.method === 'radiation_hA') && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">
                  <BilingualTooltip zh={TOOLTIPS_ZH.boundaryPlaceholder} align="left">
                    <span>Boundary derived.</span>
                  </BilingualTooltip>{' '}
                  h, emissivity and ambient temperature are configured in Screen 06 — Screen 05 must
                  not assume them.
                </p>
              )}
              {edge.type === 'spreading' && edge.method !== 'spreading_disc' && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">
                  <BilingualTooltip zh={TOOLTIPS_ZH.spreadingResistance} align="left">
                    <span>Spreading resistance.</span>
                  </BilingualTooltip>{' '}
                  Do not substitute L/kA unless the assumption is justified.
                </p>
              )}
            </div>

            {edge.method === 'spreading_disc' && (
              <SpreadingBreakdown
                edge={edge}
                readOnly={readOnly}
                onVariant={(variant) =>
                  applyParameters({
                    ...(edge.parameters ?? {}),
                    psi_variant: variant,
                  })
                }
              />
            )}
          </div>
        )}

        {tab === 'parameters' && (
          <div>
            {METHOD_PARAMETERS[edge.method].length === 0 ? (
              <p className="text-[11px] leading-relaxed text-ink-400">
                This method takes no geometry parameters in Screen 05. / 此方法在 05
                不需要幾何參數。
              </p>
            ) : (
              METHOD_PARAMETERS[edge.method].map((parameter) => {
                const linkedTo = edge.parameter_links?.[parameter.key];
                const value = edge.parameters?.[parameter.key];
                return (
                  <div key={parameter.key} className="mb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel
                        label={parameter.label}
                        zh={parameter.zh}
                        unit={parameter.unit}
                        htmlFor={`param-${parameter.key}`}
                      />
                      {linkedTo && (
                        <button
                          type="button"
                          disabled={readOnly}
                          title={`Linked to ${linkedTo}`}
                          onClick={() => {
                            const links = { ...edge.parameter_links };
                            delete links[parameter.key];
                            onPatch({ parameter_links: links });
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-700 hover:underline disabled:opacity-50"
                        >
                          <Link2 size={11} /> Inherited — keep local override
                        </button>
                      )}
                      {!linkedTo && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-ink-400">
                          <Link2Off size={11} /> Override
                        </span>
                      )}
                    </div>
                    <NumberInput
                      id={`param-${parameter.key}`}
                      className="mt-1 h-8 !text-[12px]"
                      value={typeof value === 'number' ? value : ''}
                      disabled={readOnly}
                      onChange={(event) => {
                        const next = { ...(edge.parameters ?? {}) };
                        if (event.target.value === '') delete next[parameter.key];
                        else next[parameter.key] = Number(event.target.value);
                        applyParameters(next);
                      }}
                    />
                  </div>
                );
              })
            )}

            {Object.keys(edge.parameter_links ?? {}).length > 0 && (
              <Button
                className="mt-1 h-8"
                disabled={readOnly}
                icon={<RefreshCw size={13} />}
                onClick={() => applyParameters(edge.parameters)}
              >
                Refresh Linked Parameters / 重新讀取連動參數
              </Button>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
              An input that is not known leaves this edge UNRESOLVED. It is never filled with 0. /
              未知輸入會讓此連線維持「未解析」，不會被填 0。
            </p>
          </div>
        )}

        {tab === 'source' && (
          <div>
            <p className="mb-1 text-[11px] font-bold text-ink-700">
              <BilingualTooltip zh={TOOLTIPS_ZH.activeRthSource} align="left">
                <span>Rth by source / 各來源熱阻</span>
              </BilingualTooltip>
            </p>
            <Row label="Analytical (model)">
              {edge.rth.analytical != null ? (
                formatRth(edge.rth.analytical, isothermal)
              ) : (
                <span className="text-ink-400">Not defined</span>
              )}
            </Row>
            {scenarioBoundary && (
              <Row label="Screen 06 Scenario Preview">
                {scenarioBoundary.rth_C_per_W != null ? (
                  `${scenarioBoundary.rth_C_per_W.toFixed(4)} °C/W`
                ) : (
                  <span className="text-ink-400">Not ready</span>
                )}
              </Row>
            )}
            <Row label="Manual / Override">
              {edge.rth.manual != null ? (
                `${edge.rth.manual.toFixed(4)} °C/W`
              ) : (
                <span className="text-ink-400">None</span>
              )}
            </Row>
            <Row label="Measurement">
              <span className="text-ink-400">Reserved</span>
            </Row>
            <Row label="FloTHERM (deferred)">
              <span className="text-ink-400">Not imported (Screen 03)</span>
            </Row>

            <div className="mt-3">
              <FieldLabel label="Manual Rth" zh="手動熱阻" unit="°C/W" htmlFor="edge-manual" />
              <NumberInput
                id="edge-manual"
                className="mt-1 h-8 !text-[12px]"
                value={edge.rth.manual ?? ''}
                disabled={readOnly}
                onChange={(event) => {
                  const value = event.target.value === '' ? null : Number(event.target.value);
                  const rth = setRthFromSource(edge.rth, 'Manual', value, 'medium', {
                    reference: edge.rth.provenance.Manual?.reference,
                    makeActive: value != null,
                  });
                  onPatch({
                    rth,
                    resolution: value != null ? 'resolved' : edge.resolution,
                    origin: edge.origin ? { ...edge.origin, modified: true } : { kind: 'manual' },
                  });
                }}
              />

              <FieldLabel
                label="Reference"
                zh="依據"
                htmlFor="edge-reference"
                tooltip="手動熱阻必須說明來源或依據，否則驗證會顯示警告。"
              />
              <TextInput
                id="edge-reference"
                className="mt-1 h-8 !text-[12px]"
                placeholder="e.g. vendor datasheet rev B"
                disabled={readOnly}
                value={edge.rth.provenance.Manual?.reference ?? ''}
                onChange={(event) =>
                  onPatch({
                    rth: setRthFromSource(edge.rth, 'Manual', edge.rth.manual, 'medium', {
                      reference: event.target.value,
                    }),
                  })
                }
              />

              <FieldLabel label="Active Source" zh="使用中來源" htmlFor="edge-active" />
              <Select
                id="edge-active"
                className="mt-1 h-8 !text-[12px]"
                value={edge.rth.active_source}
                disabled={readOnly}
                items={[
                  { value: 'Analytical', label: '解析計算' },
                  { value: 'Manual', label: '手動輸入' },
                  { value: 'Measurement', label: '實測值（預留）' },
                  { value: 'FloTHERM', label: 'FloTHERM（延後）' },
                ]}
                onChange={(event) =>
                  onPatch({
                    rth: {
                      ...edge.rth,
                      active_source: event.target.value as DataSource,
                    },
                  })
                }
              />

              <FieldLabel label="Confidence" zh="信心度" htmlFor="edge-confidence" />
              <Select
                id="edge-confidence"
                className="mt-1 h-8 !text-[12px]"
                value={edge.confidence ?? 'low'}
                disabled={readOnly}
                options={['high', 'medium', 'low']}
                onChange={(event) => onPatch({ confidence: event.target.value as Confidence })}
              />
            </div>

            <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
              Each source keeps its own slot. An imported value never overwrites the analytical one
              (00 Rule 9). / 各來源分開保存，匯入值不會覆蓋解析值。
            </p>
          </div>
        )}

        {tab === 'mapping' && (
          <div>
            <p className="mb-2 text-[11px] font-bold text-ink-700">
              <BilingualTooltip zh={TOOLTIPS_ZH.externalMapping} align="left">
                <span>FloTHERM interface mapping</span>
              </BilingualTooltip>
            </p>
            <Row label="Status" zh="狀態">
              <Badge tone="neutral">
                {edge.external_mappings?.flotherm?.mapping_status ?? 'unmapped'}
              </Badge>
            </Row>
            <FieldLabel label="Interface aliases" zh="介面別名" htmlFor="edge-alias" />
            <TextInput
              id="edge-alias"
              className="mt-1 h-8 !text-[12px]"
              placeholder="e.g. Contact/PA1_Coin"
              disabled={readOnly}
              value={(edge.external_mappings?.flotherm?.object_aliases ?? []).join(', ')}
              onChange={(event) => {
                const object_aliases = event.target.value
                  .split(',')
                  .map((alias) => alias.trim())
                  .filter(Boolean);
                onPatch({
                  external_mappings: {
                    ...edge.external_mappings,
                    flotherm: {
                      ...edge.external_mappings?.flotherm,
                      object_aliases,
                      mapping_status: object_aliases.length > 0 ? 'partial' : 'unmapped',
                    },
                  },
                });
              }}
            />
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
              Stored as text only. No FloTHERM file is parsed and no CSV header is assumed (05 §1).
              / 僅儲存文字，未解析任何 FloTHERM 檔案或欄位。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
