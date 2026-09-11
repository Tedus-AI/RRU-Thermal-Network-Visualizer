/**
 * The rendered report sections — 11 §7, §13–§22.
 *
 * Every number on this page is read from the Screen 10 snapshot. Nothing here
 * solves, ranks, bins or re-derives a statistic (§12, §37): where the snapshot
 * has no data for a section, the section says `Not Available` instead of
 * fabricating rows (§17, AC-11-20).
 *
 * The report has its own language setting (§8), separate from the application's
 * English-primary rule: `reportLabel` drops the Chinese half in English mode
 * without touching the surrounding UI.
 */

import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { NetworkFigure } from '@/report/networkFigures';
import type {
  LanguageMode,
  ReportSectionConfig,
  ThermalReportConfig,
} from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';
import { DEFAULT_LOGO_TEXT } from '@/report/defaultTemplate';

import { num, reportLabel, signed, timeOf } from './reportViewModel';
import { ReportNetworkFigures, type NetworkFigureContext } from './ReportNetworkFigures';

export interface SectionRenderInput {
  config: ThermalReportConfig;
  section: ReportSectionConfig;
  snapshot: ResultsOverviewSnapshot;
  project: { name: string; id: string; stage?: string; customer?: string };
  scenario: {
    name: string;
    ambient_C: number;
    wind_mps: number;
    solar_W_m2: number;
    power_scale: number;
  };
  /** Sections whose backing data is absent from the snapshot. */
  unavailable: boolean;
  /**
   * The live network the figures are drawn from.
   *
   * Everything else on this page reads the frozen snapshot, which is the rule
   * (§12, §37). A snapshot never carried a TOPOLOGY, though, so the pictures
   * come from the model — the same one the snapshot's numbers were solved on,
   * which the STALE banner is there to police.
   */
  network_context: NetworkFigureContext | null;
  network_figures: NetworkFigure[];
  /**
   * Which slice of a section this page carries, for the two sections that can
   * span pages. `part` 0 of `parts` 1 is the ordinary whole-section case.
   */
  part: number;
  parts: number;
}

/**
 * The slice of `items` that page `part` of `parts` carries.
 *
 * Even slices rather than a measured fit: the paginator's height is an estimate
 * and this renderer has no layout to measure against, so an even split is the
 * honest reading of "this section takes three pages". Every item appears
 * exactly once across the parts, which is the property that matters.
 */
export function sliceForPart<T>(items: readonly T[], part: number, parts: number): T[] {
  if (parts <= 1) return [...items];
  const perPage = Math.ceil(items.length / parts);
  return items.slice(part * perPage, (part + 1) * perPage);
}

const CELL = 'border border-[#d7dde5] px-2 py-1 align-middle';
const HEAD = `${CELL} bg-[#eef2f7] text-[9.5px] font-bold uppercase tracking-wide text-[#425067]`;

function Field({
  label,
  zh,
  value,
  mode,
}: {
  label: string;
  zh: string;
  value: string;
  mode: LanguageMode;
}) {
  return (
    <div className="min-w-0 border border-[#d7dde5] px-2 py-1">
      <p className="truncate text-[8.5px] font-semibold tracking-wide text-[#68748a] uppercase">
        {reportLabel(mode, label, zh)}
      </p>
      <p className="truncate text-[11px] font-bold text-[#16202f]">{value}</p>
    </div>
  );
}

function NotAvailable({ mode, what, whatZh }: { mode: LanguageMode; what: string; whatZh: string }) {
  return (
    <div className="border border-dashed border-[#c3ccd9] bg-[#f7f9fc] px-3 py-4 text-center">
      <p className="text-[11px] font-bold text-[#8a5a12]">{what} Not Available</p>
      {mode === 'bilingual' && <p className="text-[10px] text-[#68748a]">{whatZh}不可用</p>}
      <p className="mt-1 text-[9.5px] text-[#68748a]">
        No data exists for this section in the current snapshot. Nothing is estimated in its place.
      </p>
    </div>
  );
}

function Callout({ mode, snapshot }: { mode: LanguageMode; snapshot: ResultsOverviewSnapshot }) {
  const status = snapshot.overall_status;
  if (status === 'PASS' || status === 'STALE') return null;

  const failing = status === 'FAIL';
  return (
    <div
      className={`mb-2 flex gap-2 border-l-4 px-3 py-2 ${
        failing ? 'border-[#c53030] bg-[#fdf0ef]' : 'border-[#d69e2e] bg-[#fdf8ec]'
      }`}
    >
      <span className="text-[11px]">{failing ? '⛔' : '⚠'}</span>
      <div className="min-w-0">
        <p className={`text-[10.5px] font-bold ${failing ? 'text-[#9b2c2c]' : 'text-[#8a5a12]'}`}>
          {failing
            ? reportLabel(mode, 'Thermal Limit Exceeded', '超出熱限制')
            : reportLabel(mode, 'Engineering Review Required', '需進行工程審查')}
        </p>
        <p className="text-[9.5px] leading-relaxed text-[#425067]">
          {failing
            ? 'At least one monitored component is over its thermal limit. This report documents that result; it is not blocked by it.'
            : `Overall status is ${status}. Review the critical components and supporting analyses before acting on this report.`}
        </p>
      </div>
    </div>
  );
}

// --- 11 §7 — cover ----------------------------------------------------------

function CoverSection({ input }: { input: SectionRenderInput }) {
  const { config, project, scenario } = input;
  const mode = config.language_mode;
  const cover = config.cover;

  return (
    <div className="flex h-full flex-col justify-between py-6">
      <div>
        {cover.show_logo && (
          <div className="mb-6 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded bg-[#1d4ed8] text-[12px] font-bold text-white">
              5G
            </span>
            <span className="text-[11px] font-bold text-[#425067]">
              {cover.logo_text ?? DEFAULT_LOGO_TEXT}
            </span>
          </div>
        )}
        <p className="text-[9.5px] font-semibold tracking-[0.18em] text-[#68748a] uppercase">
          Thermal Engineering Report
        </p>
        <h1 className="mt-2 text-[22px] leading-tight font-bold text-[#16202f]">{config.title}</h1>
        {config.subtitle && (
          <p className="mt-1 text-[13px] text-[#425067]">{config.subtitle}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10.5px]">
        {[
          ['Project Name', '專案名稱', cover.project_name_override || project.name],
          ['Project ID', '專案代號', project.id],
          ['Customer / Program', '客戶 / 專案', cover.customer_program || project.customer || '—'],
          ['Scenario', '情境', scenario.name],
          ['Prepared By', '製作者', cover.prepared_by],
          ['Prepared Date', '製作日期', cover.prepared_date],
          ['Company / Team', '公司 / 團隊', cover.company_team || '—'],
          ['Confidentiality', '機密等級', cover.confidentiality],
          // Result Mode and the snapshot id are provenance for the SCREEN, not
          // for the reader of a printed report: one says the solve was
          // analytical (which the Solver & Energy Quality section states
          // properly) and the other is a 44-character machine key.
        ].map(([label, zh, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-[#e4e9f0] pb-1">
            <span className="text-[#68748a]">{reportLabel(mode, label, zh)}</span>
            <span className="truncate font-semibold text-[#16202f]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- 11 §13 — the scenario the result was solved at -------------------------
//
// The project half of this section is gone: name, id and customer are printed
// on the cover, one page earlier, and Result Mode and Solver Status describe
// the solve rather than the scenario — Solver & Energy Quality is the section
// that judges the solve.

function ProjectSection({ input }: { input: SectionRenderInput }) {
  const { config, section, project, scenario, snapshot } = input;
  const mode = config.language_mode;
  const show = section.content;

  // One switch per field — a report sent to a supplier may want the ambient and
  // nothing else. Absent means on, so an older config keeps all seven.
  const fields: Array<[boolean, string, string, string]> = [
    [show.show_stage !== false, 'Stage', '階段', project.stage || '—'],
    [show.show_scenario !== false, 'Scenario', '情境', scenario.name],
    [show.show_ambient !== false, 'Ambient', '環境溫度', num(scenario.ambient_C, 1, '°C')],
    [show.show_wind !== false, 'Wind', '風速', num(scenario.wind_mps, 1, 'm/s')],
    [show.show_solar !== false, 'Solar', '太陽輻射', num(scenario.solar_W_m2, 0, 'W/m²')],
    [
      show.show_power_scale !== false,
      'Power Scale',
      '功率倍率',
      `${(scenario.power_scale * 100).toFixed(0)}%`,
    ],
    [
      show.show_last_solved !== false,
      'Last Solved',
      '最後求解',
      timeOf(snapshot.solver_quality.solved_at),
    ],
  ];
  const on = fields.filter(([enabled]) => enabled);

  if (on.length === 0) {
    return <NotAvailable mode={mode} what="Scenario Summary" whatZh="情境摘要" />;
  }

  return (
    <div className="grid grid-cols-4 gap-x-0 gap-y-0">
      {on.map(([, label, zh, value]) => (
        <Field key={label} label={label} zh={zh} value={value} mode={mode} />
      ))}
    </div>
  );
}

// --- 11 §14 — overall thermal status ---------------------------------------

function OverallSection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot } = input;
  const mode = config.language_mode;
  const kpis = snapshot.kpis;

  /**
   * The parts the verdict is about, worst margin first.
   *
   * "Worst Thermal Margin: +0.8 °C" named one number and no part, which makes
   * the reader turn to Critical Components to find out which. Everything at or
   * inside the limit is listed here instead — over-limit in its own block,
   * because a part that is FAILING is not a tighter version of one that is
   * merely close.
   */
  const attention = [...snapshot.critical_components]
    .filter((row) => row.status === 'FAIL' || row.status === 'NEAR LIMIT')
    .sort((a, b) => (a.margin_C ?? Infinity) - (b.margin_C ?? Infinity));
  const failing = attention.filter((row) => row.status === 'FAIL');
  const warning = attention.filter((row) => row.status === 'NEAR LIMIT');

  return (
    <div className="flex flex-col gap-2">
      <Callout mode={mode} snapshot={snapshot} />
      <div className="grid grid-cols-3">
        <Field
          label="Overall Status"
          zh="整體狀態"
          value={snapshot.overall_status}
          mode={mode}
        />
        {/* Max Temperature said the PA, every time, and Energy Balance judges
            the SOLVE — which Solver & Energy Quality is the section for. Top
            Bottleneck went earlier with the analysis nothing runs. */}
        <Field
          label="Total Power"
          zh="總熱功率"
          value={num(kpis.total_power_W, 1, 'W')}
          mode={mode}
        />
        <Field
          label="Parts At Or Over Limit"
          zh="需注意元件"
          value={`${attention.length}`}
          mode={mode}
        />
      </div>

      {failing.length > 0 && <MarginList mode={mode} rows={failing} tone="fail" />}
      {warning.length > 0 && <MarginList mode={mode} rows={warning} tone="warn" />}
      {attention.length === 0 && (
        <p className="border border-[#d7dde5] bg-[#f7f9fc] px-3 py-2 text-[10px] text-[#425067]">
          {reportLabel(
            mode,
            'Every part with a limit is passing it.',
            '所有具限制值的元件皆通過。',
          )}
        </p>
      )}
    </div>
  );
}

/**
 * A ranked block of parts, with the temperature the margin was measured at.
 *
 * Print colours rather than tokens, like every other section body: this is the
 * report page, which is rendered on white paper regardless of the app's theme.
 */
function MarginList({
  mode,
  rows,
  tone,
}: {
  mode: LanguageMode;
  rows: ResultsOverviewSnapshot['critical_components'];
  tone: 'fail' | 'warn';
}) {
  const skin =
    tone === 'fail'
      ? { border: '#e2b3b3', bg: '#fdf3f3', ink: '#a3222c', label: 'Over Limit', zh: '超出限制' }
      : { border: '#e6cf9a', bg: '#fdf8ee', ink: '#8a5a12', label: 'Near Limit', zh: '接近限制' };

  return (
    <div style={{ borderColor: skin.border, backgroundColor: skin.bg }} className="border px-3 py-2">
      <p className="mb-1 text-[8.5px] font-bold tracking-wide uppercase" style={{ color: skin.ink }}>
        {reportLabel(mode, skin.label, skin.zh)} · {rows.length}
      </p>
      <table className="w-full border-collapse text-[10px]">
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.node_id}>
              <td className="w-4 py-0.5 align-top font-bold tabular" style={{ color: skin.ink }}>
                {index + 1}
              </td>
              <td className="py-0.5 pr-2 align-top font-semibold text-[#16202f]">
                {row.component_name}
                <span className="block text-[8.5px] font-normal text-[#68748a]">
                  {row.node_name}
                </span>
              </td>
              <td className="w-16 py-0.5 text-right align-top tabular text-[#425067]">
                {num(row.temperature_C, 1, '°C')}
              </td>
              <td className="w-16 py-0.5 text-right align-top tabular text-[#68748a]">
                {row.limit_C == null ? '—' : num(row.limit_C, 1, '°C')}
              </td>
              <td
                className="w-16 py-0.5 text-right align-top font-bold tabular"
                style={{ color: skin.ink }}
              >
                {row.margin_C == null ? '—' : signed(row.margin_C, 1, '°C')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- 11 §15 — critical components ------------------------------------------

function CriticalSection({ input }: { input: SectionRenderInput }) {
  const { config, section, snapshot } = input;
  const mode = config.language_mode;
  const options = section.content;

  // A node with no limit has no margin and no status to report, so it cannot
  // be critical — it was filling the foot of the table with N/A rows.
  const rows = snapshot.critical_components.filter((row) => row.status !== 'NO LIMIT');
  if (options.sort_mode === 'highest_temperature') {
    rows.sort((a, b) => b.temperature_C - a.temperature_C);
  }
  const wanted = options.row_count === 0 ? rows : rows.slice(0, options.row_count ?? 5);
  // The slice this page carries. A table that overflowed used to be drawn whole
  // on the continuation page too, so the same clipped rows appeared twice and
  // the ones in between appeared nowhere.
  const shown = sliceForPart(wanted, input.part, input.parts);

  if (shown.length === 0) {
    return <NotAvailable mode={mode} what="Critical Components" whatZh="關鍵元件" />;
  }

  return (
    <table className="w-full border-collapse text-[10px]">
      <thead>
        <tr>
          <th className={HEAD}>#</th>
          <th className={HEAD}>{reportLabel(mode, 'Component', '元件')}</th>
          <th className={HEAD}>{reportLabel(mode, 'Node', '節點')}</th>
          <th className={`${HEAD} text-right`}>{reportLabel(mode, 'Temperature', '溫度')} (°C)</th>
          {options.show_limit_type !== false && (
            <th className={HEAD}>{reportLabel(mode, 'Limit Type', '限制類型')}</th>
          )}
          <th className={`${HEAD} text-right`}>{reportLabel(mode, 'Limit', '限制值')} (°C)</th>
          {options.show_margin !== false && (
            <th className={`${HEAD} text-right`}>{reportLabel(mode, 'Margin', '餘裕')} (°C)</th>
          )}
          {options.show_status !== false && (
            <th className={HEAD}>{reportLabel(mode, 'Status', '狀態')}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {shown.map((row, index) => (
          <tr key={row.node_id}>
            <td className={`${CELL} tabular text-[#68748a]`}>{index + 1}</td>
            <td className={`${CELL} font-semibold text-[#16202f]`}>{row.component_name}</td>
            <td className={`${CELL} text-[#425067]`}>{row.node_name}</td>
            <td className={`${CELL} text-right font-bold tabular`}>{num(row.temperature_C, 1)}</td>
            {options.show_limit_type !== false && (
              <td className={`${CELL} text-[#425067]`}>{row.limit_type ?? '—'}</td>
            )}
            <td className={`${CELL} text-right tabular text-[#425067]`}>
              {row.limit_C == null ? '—' : row.limit_C.toFixed(0)}
            </td>
            {options.show_margin !== false && (
              <td
                className={`${CELL} text-right font-bold tabular ${
                  row.status === 'FAIL'
                    ? 'text-[#c53030]'
                    : row.status === 'NEAR LIMIT'
                      ? 'text-[#b7791f]'
                      : 'text-[#2f855a]'
                }`}
              >
                {signed(row.margin_C, 1)}
              </td>
            )}
            {options.show_status !== false && (
              <td
                className={`${CELL} font-bold ${
                  row.status === 'FAIL'
                    ? 'text-[#c53030]'
                    : row.status === 'NEAR LIMIT'
                      ? 'text-[#b7791f]'
                      : 'text-[#2f855a]'
                }`}
              >
                {row.status}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- 11 §16 — thermal network summary --------------------------------------

/**
 * The solved network, one board at a time and then one part at a time.
 *
 * It used to be six solver counters and a four-box schematic strip reading
 * "Heat Sources → Shared Base → HSK → Boundary" — a diagram of the IDEA of a
 * heat path, identical on every project. The counters went with Solver &
 * Energy Quality; the strip is replaced by the actual graph, filtered the way
 * Screen 07 filters it. See `networkFigures`.
 */
function NetworkSection({ input }: { input: SectionRenderInput }) {
  const { config, network_context, network_figures } = input;
  const mode = config.language_mode;

  if (!network_context) {
    return <NotAvailable mode={mode} what="Thermal Network" whatZh="熱網路" />;
  }

  return (
    <ReportNetworkFigures
      figures={sliceForPart(network_figures, input.part, input.parts)}
      context={network_context}
      mode={mode}
    />
  );
}

// --- 11 §21 — engineering actions and conclusions ---------------------------

function ActionsSection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot } = input;
  const mode = config.language_mode;

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {snapshot.action_summary.map((line, index) => (
          <li key={line} className="flex gap-2 text-[10px] leading-relaxed text-[#16202f]">
            <span className="shrink-0 font-bold text-[#68748a] tabular">{index + 1}.</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      {(config.notes?.trim() || config.conclusion_notes?.trim()) && (
        <div className="border-l-4 border-[#b6c2d3] bg-[#f7f9fc] px-3 py-2">
          <p className="text-[8.5px] font-bold tracking-wide text-[#68748a] uppercase">
            {reportLabel(mode, 'Engineer Notes — report-only text', '工程師備註（報告專用文字）')}
          </p>
          {config.notes?.trim() && (
            <p className="mt-1 text-[10px] leading-relaxed whitespace-pre-wrap text-[#16202f]">
              {config.notes}
            </p>
          )}
          {config.conclusion_notes?.trim() && (
            <>
              <p className="mt-2 text-[8.5px] font-bold tracking-wide text-[#68748a] uppercase">
                {reportLabel(mode, 'Conclusion', '結論')}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed whitespace-pre-wrap text-[#16202f]">
                {config.conclusion_notes}
              </p>
            </>
          )}
          {/* 11 §21 — notes are marked as report-only so nobody mistakes them
              for an engineering result. */}
          <p className="mt-1 text-[8px] text-[#68748a]">
            Report-only text · does not modify engineering results.
          </p>
        </div>
      )}
    </div>
  );
}

// --- dispatch ---------------------------------------------------------------

export function ReportSectionBody({ input }: { input: SectionRenderInput }) {
  switch (input.section.id) {
    case 'cover':
      return <CoverSection input={input} />;
    case 'project':
      return <ProjectSection input={input} />;
    case 'overall':
      return <OverallSection input={input} />;
    case 'critical':
      return <CriticalSection input={input} />;
    case 'network':
      return <NetworkSection input={input} />;
    case 'actions':
      return <ActionsSection input={input} />;
    default:
      return null;
  }
}

export function sectionHeading(
  input: SectionRenderInput,
  index: number,
): { number: string; title: string } {
  const definition = sectionDefinition(input.section.id);
  const title = input.section.display.title_override || definition.title;
  return {
    number: `${index}`,
    title: reportLabel(input.config.language_mode, title, definition.zh),
  };
}
