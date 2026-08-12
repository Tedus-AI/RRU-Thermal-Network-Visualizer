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
import { RTH_SOURCE_BUCKETS } from '@/thermal/overview/overviewTypes';
import type {
  LanguageMode,
  ReportSectionConfig,
  ThermalReportConfig,
} from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';

import { num, pct, reportLabel, signed, timeOf } from './reportViewModel';

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
  const { config, project, scenario, snapshot } = input;
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
              5G FR1 Thermal Network Visualizer
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
          ['Result Mode', '結果模式', snapshot.result_mode],
          ['Snapshot', '快照', snapshot.id],
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

// --- 11 §13 — project and scenario -----------------------------------------

function ProjectSection({ input }: { input: SectionRenderInput }) {
  const { config, project, scenario, snapshot } = input;
  const mode = config.language_mode;
  return (
    <div className="grid grid-cols-4 gap-x-0 gap-y-0">
      <Field label="Project Name" zh="專案名稱" value={project.name} mode={mode} />
      <Field label="Project ID" zh="專案代號" value={project.id} mode={mode} />
      <Field
        label="Customer / Program"
        zh="客戶 / 專案"
        value={config.cover.customer_program || project.customer || '—'}
        mode={mode}
      />
      <Field label="Stage" zh="階段" value={project.stage || '—'} mode={mode} />
      <Field label="Scenario" zh="情境" value={scenario.name} mode={mode} />
      <Field label="Ambient" zh="環境溫度" value={num(scenario.ambient_C, 1, '°C')} mode={mode} />
      <Field label="Wind" zh="風速" value={num(scenario.wind_mps, 1, 'm/s')} mode={mode} />
      <Field label="Solar" zh="太陽輻射" value={num(scenario.solar_W_m2, 0, 'W/m²')} mode={mode} />
      <Field
        label="Power Scale"
        zh="功率倍率"
        value={`${(scenario.power_scale * 100).toFixed(0)}%`}
        mode={mode}
      />
      <Field label="Result Mode" zh="結果模式" value={snapshot.result_mode} mode={mode} />
      <Field
        label="Solver Status"
        zh="求解狀態"
        value={snapshot.solver_quality.status}
        mode={mode}
      />
      <Field
        label="Last Solved"
        zh="最後求解"
        value={timeOf(snapshot.solver_quality.solved_at)}
        mode={mode}
      />
    </div>
  );
}

// --- 11 §14 — overall thermal status ---------------------------------------

function OverallSection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot } = input;
  const mode = config.language_mode;
  const kpis = snapshot.kpis;
  return (
    <div>
      <Callout mode={mode} snapshot={snapshot} />
      <div className="grid grid-cols-3">
        <Field
          label="Overall Status"
          zh="整體狀態"
          value={snapshot.overall_status}
          mode={mode}
        />
        <Field
          label="Max Temperature"
          zh="最高溫度"
          value={num(kpis.max_temperature_C, 1, '°C')}
          mode={mode}
        />
        <Field
          label="Worst Thermal Margin"
          zh="最小熱餘裕"
          value={signed(kpis.worst_margin_C, 1, '°C')}
          mode={mode}
        />
        <Field
          label="Top Bottleneck"
          zh="首要瓶頸"
          // 11 §14 — Not Available rather than a substitute.
          value={kpis.top_bottleneck ?? 'Not Available'}
          mode={mode}
        />
        <Field
          label="Energy Balance"
          zh="能量守恆誤差"
          value={pct(kpis.energy_error_pct)}
          mode={mode}
        />
        <Field
          label="Total Power"
          zh="總熱功率"
          value={num(kpis.total_power_W, 1, 'W')}
          mode={mode}
        />
      </div>
    </div>
  );
}

// --- 11 §15 — critical components ------------------------------------------

function CriticalSection({ input }: { input: SectionRenderInput }) {
  const { config, section, snapshot } = input;
  const mode = config.language_mode;
  const options = section.content;

  const rows = [...snapshot.critical_components];
  if (options.sort_mode === 'highest_temperature') {
    rows.sort((a, b) => b.temperature_C - a.temperature_C);
  }
  const shown = options.row_count === 0 ? rows : rows.slice(0, options.row_count ?? 5);

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

function NetworkSection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot } = input;
  const mode = config.language_mode;
  const solver = snapshot.solver_quality;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3">
        <Field label="Node Count" zh="節點數" value={`${solver.solved_nodes}`} mode={mode} />
        <Field label="Edge Count" zh="連線數" value={`${solver.solved_edges}`} mode={mode} />
        <Field
          label="Energy Balance"
          zh="能量守恆誤差"
          value={pct(solver.energy_error_pct)}
          mode={mode}
        />
        <Field
          label="Generated Heat"
          zh="產生熱量"
          value={num(solver.generated_W, 1, 'W')}
          mode={mode}
        />
        <Field
          label="Rejected Heat"
          zh="排出熱量"
          value={num(solver.rejected_W, 1, 'W')}
          mode={mode}
        />
        <Field
          label="Critical Path"
          zh="關鍵路徑"
          // 11 §16 — the top bottleneck path when 08 is current, and the hottest
          // component path otherwise. Never a fabricated bottleneck.
          value={snapshot.kpis.top_bottleneck ?? `Hottest: ${snapshot.kpis.max_temperature_node ?? 'N/A'}`}
          mode={mode}
        />
      </div>

      {/* A schematic strip standing in for the solved network. It is a picture
          of the path, not an editable graph — 11 §16 forbids topology editing. */}
      <div className="flex items-center gap-1 overflow-hidden border border-[#d7dde5] bg-[#f7f9fc] px-3 py-3">
        {['Heat Sources', 'Shared Base', 'HSK', 'Boundary'].map((label, index, all) => (
          <span key={label} className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 flex-1 truncate rounded border border-[#b6c2d3] bg-white px-2 py-1.5 text-center text-[9px] font-semibold text-[#16202f]">
              {label}
            </span>
            {index < all.length - 1 && <span className="shrink-0 text-[10px] text-[#8a5a12]">→</span>}
          </span>
        ))}
      </div>
      <p className="text-[8.5px] text-[#68748a]">
        {reportLabel(
          mode,
          'Read-only network summary. Topology and boundary conditions are edited in Screens 05 and 06.',
          '唯讀熱網路摘要；拓樸與邊界條件請於 05、06 修改。',
        )}
      </p>
    </div>
  );
}

// --- 11 §17 — bottleneck summary -------------------------------------------

function BottleneckSection({ input }: { input: SectionRenderInput }) {
  const { config, section, snapshot, unavailable } = input;
  const mode = config.language_mode;

  if (unavailable || snapshot.bottlenecks.length === 0) {
    return <NotAvailable mode={mode} what="Bottleneck Analysis" whatZh="瓶頸分析" />;
  }

  const options = section.content;
  const rows = snapshot.bottlenecks.slice(0, options.top_n ?? 3);

  return (
    <table className="w-full border-collapse text-[10px]">
      <thead>
        <tr>
          <th className={HEAD}>{reportLabel(mode, 'Rank', '排名')}</th>
          <th className={HEAD}>{reportLabel(mode, 'Edge', '連線')}</th>
          {options.show_score !== false && (
            <th className={`${HEAD} text-right`}>{reportLabel(mode, 'Score', '分數')}</th>
          )}
          <th className={HEAD}>{reportLabel(mode, 'Classification', '分級')}</th>
          {options.show_sensitivity !== false && (
            <th className={`${HEAD} text-right`}>
              {reportLabel(mode, 'Sensitivity Improvement', '敏感度改善')} (°C)
            </th>
          )}
          <th className={`${HEAD} text-right`}>
            {reportLabel(mode, 'Affected Components', '受影響元件')}
          </th>
          {options.show_confidence !== false && (
            <th className={HEAD}>{reportLabel(mode, 'Confidence', '可信度')}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.edge_id}>
            <td className={`${CELL} font-bold tabular`}>{row.rank}</td>
            <td className={`${CELL} font-semibold text-[#16202f]`}>{row.edge_label}</td>
            {options.show_score !== false && (
              <td className={`${CELL} text-right font-bold tabular`}>{row.score.toFixed(0)}</td>
            )}
            <td className={`${CELL} text-[#425067]`}>{row.classification}</td>
            {options.show_sensitivity !== false && (
              <td className={`${CELL} text-right tabular`}>
                {row.sensitivity_improvement_C == null
                  ? 'Not measured'
                  : `${num(row.sensitivity_improvement_C, 1)} @ −${row.reduction_pct}%`}
              </td>
            )}
            <td className={`${CELL} text-right tabular text-[#425067]`}>
              {row.affected_components}
            </td>
            {options.show_confidence !== false && (
              <td className={`${CELL} text-[#425067] capitalize`}>{row.confidence}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- 11 §18 — temperature distribution summary ------------------------------

function DistributionSection({ input }: { input: SectionRenderInput }) {
  const { config, section, snapshot, unavailable } = input;
  const mode = config.language_mode;
  const distribution = snapshot.distribution;

  if (unavailable || !distribution) {
    return <NotAvailable mode={mode} what="Temperature Distribution" whatZh="溫度分佈" />;
  }

  const span = (distribution.max_C ?? 0) - (distribution.min_C ?? 0);
  const position = (value: number | null) =>
    value == null || span <= 0 ? null : ((value - (distribution.min_C ?? 0)) / span) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-5">
        <Field
          label="Average"
          zh="平均溫度"
          value={num(distribution.average_C, 1, '°C')}
          mode={mode}
        />
        <Field label="P95" zh="第 95 百分位" value={num(distribution.p95_C, 1, '°C')} mode={mode} />
        <Field
          label="Nodes Above Warning"
          zh="高於警示的節點"
          value={`${distribution.nodes_above_warning}`}
          mode={mode}
        />
        <Field label="Min" zh="最低溫度" value={num(distribution.min_C, 1, '°C')} mode={mode} />
        <Field label="Max" zh="最高溫度" value={num(distribution.max_C, 1, '°C')} mode={mode} />
      </div>

      {section.content.show_range_summary !== false && (
        <div className="border border-[#d7dde5] px-3 pt-3 pb-5">
          <p className="mb-3 text-[8.5px] font-semibold tracking-wide text-[#68748a] uppercase">
            {reportLabel(mode, 'Temperature Range', '溫度範圍')}
          </p>
          <div className="relative h-2 rounded-full bg-gradient-to-r from-[#2563eb] via-[#22c55e] to-[#dc2626]">
            {[
              { key: 'avg', label: 'Avg', value: distribution.average_C, color: '#16a34a' },
              { key: 'p95', label: 'P95', value: distribution.p95_C, color: '#7c3aed' },
            ].map((marker) => {
              const left = position(marker.value);
              if (left == null) return null;
              return (
                <span
                  key={marker.key}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%` }}
                >
                  <span
                    className="block size-2.5 rounded-full border-2 border-white"
                    style={{ backgroundColor: marker.color }}
                  />
                  <span
                    className="absolute top-3 left-1/2 -translate-x-1/2 text-[8px] font-bold whitespace-nowrap"
                    style={{ color: marker.color }}
                  >
                    {marker.label} {num(marker.value, 1)}
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[8.5px] font-semibold text-[#68748a] tabular">
            <span>{num(distribution.min_C, 1, '°C')}</span>
            <span>{num(distribution.max_C, 1, '°C')}</span>
          </div>
        </div>
      )}

      {section.content.include_histogram_snapshot && (
        // 11 §18, AC-11-22 — an EXISTING Screen 09 chart may be embedded. Screen
        // 11 never re-bins and never recomputes a percentile, so when no chart
        // snapshot has been captured the placeholder says exactly that rather
        // than drawing a histogram of its own.
        <div className="border border-dashed border-[#c3ccd9] bg-[#f7f9fc] px-3 py-4 text-center">
          <p className="text-[10px] font-bold text-[#425067]">
            {reportLabel(mode, 'Histogram Snapshot', '直方圖快照')}
          </p>
          <p className="mt-1 text-[9px] text-[#68748a]">
            Reserved for an existing Screen 09 chart snapshot. Screen 11 never re-bins temperatures
            or recomputes percentiles.
          </p>
        </div>
      )}

      <p className="text-[8.5px] text-[#68748a]">
        {reportLabel(
          mode,
          `Scope: ${distribution.scope_label} · ${distribution.row_count} rows · warning threshold ${distribution.warning_threshold_C} °C.`,
          `範圍：${distribution.scope_label}，共 ${distribution.row_count} 列，警示門檻 ${distribution.warning_threshold_C} °C。`,
        )}
      </p>
    </div>
  );
}

// --- 11 §19 — solver and energy quality -------------------------------------

function QualitySection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot } = input;
  const mode = config.language_mode;
  const solver = snapshot.solver_quality;
  const grade =
    solver.quality === 'green' ? 'GOOD' : solver.quality === 'warning' ? 'WARNING' : 'ERROR';

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4">
        <Field label="Solver Status" zh="求解狀態" value={solver.status} mode={mode} />
        <Field label="Solved Nodes" zh="已求解節點" value={`${solver.solved_nodes}`} mode={mode} />
        <Field label="Solved Edges" zh="已求解連線" value={`${solver.solved_edges}`} mode={mode} />
        <Field label="Quality" zh="品質" value={grade} mode={mode} />
        <Field
          label="Generated Heat"
          zh="產生熱量"
          value={num(solver.generated_W, 1, 'W')}
          mode={mode}
        />
        <Field
          label="Rejected Heat"
          zh="排出熱量"
          value={num(solver.rejected_W, 1, 'W')}
          mode={mode}
        />
        <Field label="Residual" zh="能量殘差" value={num(solver.residual_W, 3, 'W')} mode={mode} />
        <Field
          label="Energy Error"
          zh="能量誤差"
          value={pct(solver.energy_error_pct)}
          mode={mode}
        />
      </div>
      <p className="text-[8.5px] text-[#68748a]">
        {reportLabel(
          mode,
          'Quality thresholds inherited from Screen 07: <0.5% GOOD · 0.5–2.0% WARNING · >2.0% ERROR.',
          '品質門檻沿用 Screen 07：<0.5% 良好，0.5–2.0% 警告，>2.0% 錯誤。',
        )}
      </p>
    </div>
  );
}

// --- 11 §20 — data completeness and confidence ------------------------------

function ConfidenceSection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot } = input;
  const mode = config.language_mode;
  const completeness = snapshot.completeness;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3">
        <Field
          label="Components With Limits"
          zh="有熱限制的元件"
          value={`${completeness.components_with_limits}`}
          mode={mode}
        />
        <Field
          label="Components Without Limits"
          zh="缺少熱限制的元件"
          value={`${completeness.components_without_limits}`}
          mode={mode}
        />
        <Field
          label="Low-confidence Critical Edges"
          zh="低可信度關鍵連線"
          value={`${completeness.low_confidence_critical_edges}`}
          mode={mode}
        />
        <Field label="Result Mode" zh="結果模式" value={snapshot.result_mode} mode={mode} />
        <Field
          label="External CFD Validation"
          zh="外部 CFD 驗證"
          // 11 §20 — Deferred while Screen 03 has no parser, and that is not a
          // failure by itself.
          value={`FloTHERM: ${completeness.external_cfd_validation}`}
          mode={mode}
        />
        <Field
          label="Data Confidence"
          zh="資料可信度"
          value={completeness.data_confidence}
          mode={mode}
        />
      </div>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className={HEAD}>{reportLabel(mode, 'Rth Source', '熱阻來源')}</th>
            {RTH_SOURCE_BUCKETS.map((bucket) => (
              <th key={bucket} className={`${HEAD} text-right`}>
                {bucket}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`${CELL} text-[#425067]`}>
              {reportLabel(mode, 'Edge count', '連線數')}
            </td>
            {RTH_SOURCE_BUCKETS.map((bucket) => (
              <td key={bucket} className={`${CELL} text-right font-semibold tabular`}>
                {bucket === 'FloTHERM' && completeness.rth_source_counts[bucket] === 0
                  ? '0 · Deferred'
                  : completeness.rth_source_counts[bucket]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
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

// --- 11 §22 — appendix ------------------------------------------------------

function AppendixSection({ input }: { input: SectionRenderInput }) {
  const { config, snapshot, project } = input;
  const mode = config.language_mode;
  const counts = snapshot.completeness.rth_source_counts;

  return (
    <div className="grid grid-cols-2">
      <Field label="Project ID" zh="專案代號" value={project.id} mode={mode} />
      <Field label="Scenario ID" zh="情境代號" value={snapshot.scenario_id} mode={mode} />
      <Field label="Snapshot ID" zh="快照代號" value={snapshot.id} mode={mode} />
      <Field
        label="Snapshot Created"
        zh="快照建立時間"
        value={timeOf(snapshot.created_at)}
        mode={mode}
      />
      <Field label="Report Config ID" zh="報告設定代號" value={config.id} mode={mode} />
      <Field label="Solver Version" zh="求解器版本" value="v1.0" mode={mode} />
      <Field
        label="Component Data Sources"
        zh="元件資料來源"
        value={`${snapshot.completeness.components_with_limits} with limits · ${snapshot.completeness.components_without_limits} without`}
        mode={mode}
      />
      <Field
        label="Rth Source Counts"
        zh="熱阻來源統計"
        value={`A ${counts.Analytical} · M ${counts.Manual} · Meas ${counts.Measurement} · FT ${counts.FloTHERM}`}
        mode={mode}
      />
      <Field
        label="External Mapping Status"
        zh="外部對應狀態"
        value="FloTHERM: Deferred (Screen 03)"
        mode={mode}
      />
      <Field
        label="Report Generated"
        zh="報告產生時間"
        value={timeOf(config.updated_at)}
        mode={mode}
      />
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
    case 'bottleneck':
      return <BottleneckSection input={input} />;
    case 'distribution':
      return <DistributionSection input={input} />;
    case 'quality':
      return <QualitySection input={input} />;
    case 'confidence':
      return <ConfidenceSection input={input} />;
    case 'actions':
      return <ActionsSection input={input} />;
    case 'appendix':
      return <AppendixSection input={input} />;
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
