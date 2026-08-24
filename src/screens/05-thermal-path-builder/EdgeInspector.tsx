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

function statusOf(edge: ThermalEdge): {
  tone: 'ok' | 'warn' | 'danger';
  label: string;
} {
  if (!edge.enabled) return { tone: 'warn', label: 'Disabled' };
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
  onPatch: (patch: Partial<ThermalEdge>) => void;
  onDelete: () => void;
  onReverse: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const R = activeRth(edge.rth);
  const status = statusOf(edge);
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
                {METHODS.find((method) => method.value === edge.method)?.label ?? edge.method}
              </Row>
              <Row label="Active Rth Source" zh="使用中熱阻來源">
                {R != null ? (
                  `${edge.rth.active_source} · ${R.toFixed(4)} °C/W`
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

              {edge.resolution_note && (
                <p className="mt-2 rounded border border-warn-500/40 bg-warn-100 p-2 text-[10px] leading-relaxed text-warn-600">
                  {edge.resolution_note}
                </p>
              )}

              <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
                Heat flow Q and ΔT are not shown here: Screen 05 has no boundary conditions, so no
                solve has run (05 §22). / 05 尚未有邊界條件，因此不顯示 Q 與 ΔT。
              </p>

              {(edge.method === 'convection_hA' || edge.method === 'radiation_hA') && (
                <section className="mt-2 rounded-md border border-line bg-surface-muted p-2.5">
                  <p className="flex items-center gap-1 text-[11px] font-bold text-ink-700">
                    Boundary Parameters / 邊界參數
                    <span className="font-semibold text-ink-400">(Screen 06)</span>
                  </p>
                  <Row label="Convection h" zh="對流係數">
                    <span className="text-ink-400">— W/m²·K</span>
                  </Row>
                  <Row label="Radiation ε" zh="輻射率">
                    <span className="text-ink-400">—</span>
                  </Row>
                  <Row label="Ambient Temperature" zh="環境溫度">
                    <span className="text-ink-400">— °C</span>
                  </Row>
                </section>
              )}
            </div>
            <div>
              <section className="mt-3 rounded-md border border-line p-2.5">
                <p className="text-[11px] font-bold text-ink-700">
                  Source <span className="font-semibold text-ink-400">/ 來源 (Provenance)</span>
                </p>
                <Row label="Analytical (Rth / Model)">
                  {edge.rth.analytical != null ? (
                    `${edge.rth.analytical.toFixed(4)} °C/W`
                  ) : (
                    <span className="text-ink-400">Not Defined</span>
                  )}
                </Row>
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
                {edge.rth.analytical != null ? (
                  `${edge.rth.analytical.toFixed(4)} °C/W`
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
                `${edge.rth.analytical.toFixed(4)} °C/W`
              ) : (
                <span className="text-ink-400">Not defined</span>
              )}
            </Row>
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
                  { value: 'Analytical', label: 'Analytical' },
                  { value: 'Manual', label: 'Manual' },
                  { value: 'Measurement', label: 'Measurement (reserved)' },
                  { value: 'FloTHERM', label: 'FloTHERM (deferred)' },
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
