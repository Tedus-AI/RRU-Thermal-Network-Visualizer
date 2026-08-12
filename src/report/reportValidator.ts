/**
 * Report validation and readiness — 11 §29, §30, §31, §35, §36.
 *
 * The distinction the whole screen turns on (§30): blocking is about STALE,
 * MISSING or INCONSISTENT data — never about unfavourable thermal performance.
 * A FAIL result is a valid engineering report and must still be preparable for
 * export, with the failure stated plainly in a callout (AC-11-30).
 */

import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';

import {
  LANGUAGE_MODES,
  ORIENTATIONS,
  PAGE_SIZES,
  type ReportReadiness,
  type ReportValidation,
  type SnapshotState,
  type ThermalReportConfig,
  type ValidationEntry,
} from './reportTypes';
import { includedSections } from './reportConfig';
import { REQUIRED_SECTION_IDS, sectionDefinition } from './sectionRegistry';
import type { SnapshotEvaluation } from './snapshotAdapter';

export interface ValidationInput {
  config: ThermalReportConfig;
  evaluation: SnapshotEvaluation;
  project_name: string;
  project_id: string;
  scenario_name: string;
  /** True when the viewer may not change the report (11 §45). */
  read_only?: boolean;
}

function snapshotValidationState(state: SnapshotState) {
  if (state === 'MISSING') return 'MISSING' as const;
  if (state === 'STALE') return 'STALE' as const;
  if (state === 'WARNING') return 'WARNING' as const;
  return 'READY' as const;
}

export function validateReport(input: ValidationInput): ReportValidation {
  const { config, evaluation } = input;
  const entries: ValidationEntry[] = [];
  const blocking: string[] = [];
  const blocking_zh: string[] = [];
  const warnings: string[] = [];
  const warnings_zh: string[] = [];

  /**
   * 11 §29 vs §35 — two different lists, deliberately.
   *
   * §35 enumerates what the validation panel WARNS about. §29 defines when
   * READINESS is WARNING, and names exactly two causes: Screen 10's own Report
   * Readiness is WARNING, or an optional supporting section is missing. The
   * rest — missing limits, low-confidence edges, analytical-only coverage — are
   * shown but do not demote readiness here, because Screen 10 already weighed
   * them when it set its own readiness, and re-deriving that judgement would
   * both double-count it and pin every V1 report at WARNING for as long as
   * Screen 03 stays deferred (§20: analytical-only is not a failure).
   */
  let demotes = false;

  const block = (en: string, zh: string) => {
    blocking.push(en);
    blocking_zh.push(zh);
  };
  const warn = (en: string, zh: string, affectsReadiness = false) => {
    warnings.push(en);
    warnings_zh.push(zh);
    if (affectsReadiness) demotes = true;
  };

  // --- 1. snapshot (11 §3, §35) --------------------------------------------
  const snapshotState = snapshotValidationState(evaluation.state);
  entries.push({
    item: 'snapshot',
    state: snapshotState,
    detail:
      evaluation.state === 'MISSING'
        ? 'No Screen 10 snapshot exists for this scenario.'
        : evaluation.state === 'STALE'
          ? 'The snapshot no longer matches the current results.'
          : evaluation.state === 'WARNING'
            ? 'Snapshot is current; Screen 10 reported Report Readiness WARNING.'
            : `Snapshot ${evaluation.snapshot_id} is current.`,
    detail_zh:
      evaluation.state === 'MISSING'
        ? '此情境尚無 Screen 10 快照。'
        : evaluation.state === 'STALE'
          ? '快照已與目前結果不一致。'
          : evaluation.state === 'WARNING'
            ? '快照為最新；Screen 10 的 Report Readiness 為 WARNING。'
            : '快照為最新。',
  });

  if (evaluation.state === 'MISSING') {
    block(
      'Snapshot missing — prepare one in Screen 10.',
      '缺少快照，請先於 Screen 10 準備。',
    );
  } else if (evaluation.state === 'STALE') {
    block(
      'Snapshot is stale — refresh the overview snapshot before export.',
      '快照已過期，請於匯出前重新準備快照。',
    );
  } else if (evaluation.state === 'WARNING') {
    warn(
      'Source Report Readiness from Screen 10 is WARNING.',
      'Screen 10 的 Report Readiness 為 WARNING。',
      true,
    );
  }

  // --- 2. required sections (11 §6, §35) -----------------------------------
  const included = new Set(includedSections(config).map((section) => section.id));
  const missingRequired = REQUIRED_SECTION_IDS.filter((id) => !included.has(id));
  entries.push({
    item: 'required_sections',
    state: missingRequired.length > 0 ? 'MISSING' : 'READY',
    detail:
      missingRequired.length > 0
        ? `Missing required section(s): ${missingRequired.map((id) => sectionDefinition(id).title).join(', ')}.`
        : `All ${REQUIRED_SECTION_IDS.length} required sections are included.`,
    detail_zh:
      missingRequired.length > 0
        ? `缺少必要章節：${missingRequired.map((id) => sectionDefinition(id).zh).join('、')}。`
        : `${REQUIRED_SECTION_IDS.length} 個必要章節皆已納入。`,
  });
  if (missingRequired.length > 0) {
    block(
      `Required section missing: ${missingRequired.map((id) => sectionDefinition(id).title).join(', ')}.`,
      `缺少必要章節：${missingRequired.map((id) => sectionDefinition(id).zh).join('、')}。`,
    );
  }

  // --- 3. project metadata (11 §35, §36) -----------------------------------
  const titleEmpty = config.title.trim().length === 0;
  entries.push({
    item: 'project_metadata',
    state: titleEmpty ? 'MISSING' : input.project_name ? 'READY' : 'WARNING',
    detail: titleEmpty
      ? 'Report title is empty.'
      : `${input.project_name || 'Unnamed project'} · ${input.project_id}`,
    detail_zh: titleEmpty ? '報告標題為空。' : '專案資訊完整。',
  });
  if (titleEmpty) block('Report title is empty.', '報告標題為空。');

  // --- 4. scenario metadata -------------------------------------------------
  entries.push({
    item: 'scenario_metadata',
    state: input.scenario_name ? 'READY' : 'WARNING',
    detail: input.scenario_name
      ? `${input.scenario_name} · ${config.scenario_id}`
      : 'Scenario name is unavailable.',
    detail_zh: input.scenario_name ? '情境資訊完整。' : '情境名稱不可用。',
  });

  // --- 5. solver summary ----------------------------------------------------
  const snapshot: ResultsOverviewSnapshot | null = evaluation.snapshot;
  const solverState =
    snapshot == null
      ? 'MISSING'
      : snapshot.solver_quality.status === 'FAILED'
        ? 'MISSING'
        : snapshot.solver_quality.quality === 'green' && snapshot.solver_quality.status === 'SOLVED'
          ? 'READY'
          : 'WARNING';
  entries.push({
    item: 'solver_summary',
    state: solverState,
    detail:
      snapshot == null
        ? 'No solver summary in the snapshot.'
        : `Solver ${snapshot.solver_quality.status} · energy error ${snapshot.solver_quality.energy_error_pct.toFixed(2)}%.`,
    detail_zh:
      snapshot == null
        ? '快照中沒有求解摘要。'
        : `Solver ${snapshot.solver_quality.status}，能量誤差 ${snapshot.solver_quality.energy_error_pct.toFixed(2)}%。`,
  });

  // --- 6. report notes ------------------------------------------------------
  const noteCount =
    (config.notes?.trim() ? 1 : 0) +
    (config.conclusion_notes?.trim() ? 1 : 0) +
    config.sections.filter((section) => section.note?.trim()).length;
  entries.push({
    item: 'report_notes',
    state: 'READY',
    detail:
      noteCount > 0
        ? `${noteCount} report-only note(s) will be included.`
        : 'No report-only notes. Notes are optional.',
    detail_zh:
      noteCount > 0 ? `將納入 ${noteCount} 則報告專用備註。` : '沒有報告專用備註（非必填）。',
  });

  // --- 7. section data availability (11 §17, §18, §35, AC-11-20) -----------
  for (const id of evaluation.unavailable_sections) {
    if (!included.has(id)) continue;
    const definition = sectionDefinition(id);
    if (REQUIRED_SECTION_IDS.includes(id)) {
      // 11 §35 — a REQUIRED section with no data blocks: the report cannot
      // explain where its results came from, which is why the section is
      // required in the first place. An optional one only warns (§17).
      block(
        `Required section ${definition.title} references unavailable data.`,
        `必要章節 ${definition.zh} 引用的資料不存在。`,
      );
      continue;
    }
    warn(
      `${definition.title} has no data in this snapshot and will render as Not Available.`,
      `${definition.zh} 在此快照中沒有資料，將顯示為 Not Available。`,
      true,
    );
  }

  // --- 7b. page configuration (11 §35) --------------------------------------
  // The selects only offer valid values, but a config restored from storage or
  // from a template written by an older build can still carry something else.
  if (
    !PAGE_SIZES.includes(config.page_size) ||
    !ORIENTATIONS.includes(config.orientation) ||
    !LANGUAGE_MODES.includes(config.language_mode)
  ) {
    block(
      `Invalid page configuration: ${config.page_size} / ${config.orientation} / ${config.language_mode}.`,
      `頁面設定無效：${config.page_size} / ${config.orientation} / ${config.language_mode}。`,
    );
  }

  // --- 8. source-quality warnings the specification names (11 §35) ---------
  if (snapshot) {
    if (snapshot.overall_status === 'WARNING' || snapshot.overall_status === 'INCOMPLETE') {
      warn(
        `Source Overall Status is ${snapshot.overall_status}.`,
        `來源 Overall Status 為 ${snapshot.overall_status}。`,
      );
    }
    if (snapshot.completeness.components_without_limits > 0) {
      warn(
        `${snapshot.completeness.components_without_limits} component(s) lack thermal limits.`,
        `有 ${snapshot.completeness.components_without_limits} 個元件缺少 thermal limit。`,
      );
    }
    if (snapshot.completeness.low_confidence_critical_edges > 0) {
      warn(
        `${snapshot.completeness.low_confidence_critical_edges} critical edge(s) use low-confidence inputs.`,
        `有 ${snapshot.completeness.low_confidence_critical_edges} 段關鍵連線使用低可信度輸入。`,
      );
    }
    if (snapshot.completeness.data_confidence === 'Analytical-only') {
      warn(
        'Analytical-only: no FloTHERM or measurement validation exists yet.',
        '僅 analytical：尚未有 FloTHERM 或量測驗證。',
      );
    }
    // 11 §30, AC-11-30 — FAIL is reported, never used to block.
    if (snapshot.overall_status === 'FAIL') {
      warn(
        'Source Overall Status is FAIL. A failure report is valid engineering output and does not block export.',
        '來源 Overall Status 為 FAIL；失敗報告仍是有效的工程輸出，不會阻擋匯出。',
      );
    }
  }

  // --- readiness roll-up (11 §29) ------------------------------------------
  let readiness: ReportReadiness;
  if (blocking.length > 0) {
    // 11 §3 — a stale snapshot may still preview; it just cannot be exported.
    readiness = 'BLOCKED';
  } else if (demotes) {
    readiness = 'WARNING';
  } else {
    readiness = 'EXPORT_READY';
  }

  entries.push({
    item: 'export_payload',
    state:
      readiness === 'BLOCKED' ? 'MISSING' : readiness === 'WARNING' ? 'WARNING' : 'READY',
    detail:
      readiness === 'BLOCKED'
        ? 'Export preparation is blocked until the issues above are resolved.'
        : readiness === 'WARNING'
          ? 'Export payload can be prepared, with warnings recorded.'
          : 'Export payload can be prepared.',
    detail_zh:
      readiness === 'BLOCKED'
        ? '上述問題解決前無法準備匯出資料包。'
        : readiness === 'WARNING'
          ? '可準備匯出資料包，但會記錄警告。'
          : '可準備匯出資料包。',
  });

  return { entries, blocking, blocking_zh, warnings, warnings_zh, readiness };
}

/**
 * 11 §29 — what the preview itself can do.
 *
 * BLOCKED covers export; the preview only becomes impossible when there is no
 * snapshot at all, and a stale one previews behind a strong warning (§3).
 */
export function previewReadiness(
  validation: ReportValidation,
  state: SnapshotState,
): ReportReadiness {
  if (state === 'MISSING') return 'BLOCKED';
  if (validation.readiness === 'EXPORT_READY') return 'EXPORT_READY';
  if (validation.readiness === 'BLOCKED') return 'PREVIEW_READY';
  return 'WARNING';
}
