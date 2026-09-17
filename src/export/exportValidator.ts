/**
 * Export prerequisites, per-artifact readiness and validation —
 * 12 §3, §4, §5, §31, §32, §42, §43, §44, §45.
 *
 * The distinction the whole screen turns on (§44): blocking is about STALE,
 * MISSING or INCONSISTENT data. A thermal FAIL is a valid engineering result and
 * never blocks an export by itself — the failure is recorded in the manifest and
 * shipped, because "this design is over its limit" is exactly the finding an
 * engineering package exists to deliver.
 *
 * §43 is the other half: a BLOCKED report takes the PDF down with it and
 * NOTHING else. Network JSON, scenario JSON and the CSV tables have their own
 * prerequisites and stay exportable on their own merits.
 */

import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { ReportExportPayload } from '@/report/reportTypes';
import type { TemperatureDistributionResult } from '@/thermal/analysis/distributionResult';

import {
  ARTIFACT_DEFINITIONS,
  isExportable,
  type ArtifactStatus,
  type ArtifactType,
  type ExportValidation,
  type GlobalExportStatus,
} from './exportTypes';

export interface ReadinessInput {
  network: ThermalNetwork | null;
  solution: ThermalSolution | null;
  /** True when Screen 07's result no longer matches the current inputs. */
  solution_stale: boolean;
  analysis: BottleneckAnalysis | null;
  /** True when Screen 08's analysis was built on a superseded solve. */
  analysis_stale: boolean;
  distribution?: TemperatureDistributionResult | null;
  distribution_stale?: boolean;
  boundary: ScenarioBoundaryConditionSet | null;
  snapshot: ResultsOverviewSnapshot | null;
  /** True when the Screen 09 snapshot no longer matches the live overview. */
  snapshot_stale: boolean;
  payload: ReportExportPayload | null;
  /** Number of components with no thermal limit, for the §31 warning list. */
  components_without_limits: number;
  /** Low-confidence edges on the critical path, from the Screen 09 snapshot. */
  low_confidence_edges: number;
  /** How many pictures the snapshot matrix is currently ticked for. */
  snapshot_count?: number;
}

export interface ArtifactReadiness {
  type: ArtifactType;
  status: ArtifactStatus;
  /** Why, in the engineer's language. Always set for anything but READY. */
  reason: string;
  reason_zh: string;
}

// --- per-artifact readiness (12 §3, §4) -------------------------------------

function reportReadiness(input: ReadinessInput): ArtifactReadiness['status'] {
  if (!input.payload) return 'NOT_AVAILABLE';
  // 12 §43 — a BLOCKED report cannot produce a PDF. §9's whole source is the
  // Screen 10 payload, and Screen 10 refuses to build one it cannot stand behind.
  if (input.payload.readiness === 'BLOCKED') return 'BLOCKED';
  if (input.snapshot_stale) return 'BLOCKED';
  if (input.payload.readiness === 'WARNING') return 'WARNING';
  return 'READY';
}

function reportReason(input: ReadinessInput): { en: string; zh: string } {
  if (!input.payload) {
    return {
      en: 'No export payload. Prepare one in Screen 10 Report Preview.',
      zh: '尚無匯出資料包，請於 10 Report Preview 準備。',
    };
  }
  if (input.payload.readiness === 'BLOCKED') {
    return {
      en: 'Screen 10 Report Readiness is BLOCKED.',
      zh: 'Screen 10 的 Report Readiness 為 BLOCKED。',
    };
  }
  if (input.snapshot_stale) {
    return {
      en: 'The report snapshot no longer matches the current results.',
      zh: '報告快照已與目前結果不一致。',
    };
  }
  if (input.payload.readiness === 'WARNING') {
    return {
      en: 'Screen 10 reported WARNING. Export requires confirmation.',
      zh: 'Screen 10 為 WARNING，匯出前需確認。',
    };
  }
  return { en: '', zh: '' };
}

/** 12 §3, §45 — the solved-result artifacts share one prerequisite. */
function solvedResultStatus(input: ReadinessInput): ArtifactStatus {
  if (!input.solution) return 'NOT_AVAILABLE';
  if (input.solution.status === 'FAILED') return 'BLOCKED';
  // 12 §45 — Screen 07 DIRTY blocks anything that IS a result.
  if (input.solution_stale) return 'BLOCKED';
  return 'READY';
}

function solvedResultReason(input: ReadinessInput): { en: string; zh: string } {
  if (!input.solution) {
    return {
      en: 'No thermal solution. Solve the scenario in Screen 07.',
      zh: '尚無求解結果，請於 07 Thermal Network 求解。',
    };
  }
  if (input.solution.status === 'FAILED') {
    return { en: 'The last solve failed.', zh: '上次求解失敗。' };
  }
  if (input.solution_stale) {
    return {
      en: 'The solution is stale — inputs changed since the last solve. Re-solve in Screen 07.',
      zh: '求解結果已過期，輸入在求解後被修改，請於 07 重新求解。',
    };
  }
  return { en: '', zh: '' };
}

export function evaluateArtifact(type: ArtifactType, input: ReadinessInput): ArtifactReadiness {
  const wrap = (
    status: ArtifactStatus,
    reason: { en: string; zh: string } = { en: '', zh: '' },
  ): ArtifactReadiness => ({ type, status, reason: reason.en, reason_zh: reason.zh });

  switch (type) {
    case 'pdf_report':
    case 'html_report':
      return wrap(reportReadiness(input), reportReason(input));





    case 'png_snapshots': {
      // A solved result and a tick, and nothing else. This row used to raise a
      // WARNING when Screen 08 had no current analysis, which put a caution
      // triangle on an artifact that exports perfectly well; the fixed
      // bottleneck overlay that warning was about is gone, and what the export
      // draws now is whatever the matrix asks for.
      const solved = solvedResultStatus(input);
      if (solved !== 'READY') return wrap(solved, solvedResultReason(input));
      // An empty matrix is not a broken export, it is an unanswered question.
      // Saying so on the row is better than letting the run reach the renderer
      // and come back with a FAILED artifact and no files.
      if (input.snapshot_count === 0) {
        return wrap('NOT_AVAILABLE', {
          en: 'No snapshot is ticked. Choose at least one in the snapshot matrix.',
          zh: '尚未勾選任何快照，請於快照矩陣至少選擇一張。',
        });
      }
      return wrap('READY');
    }

    case 'package_zip': {
      const others = ARTIFACT_DEFINITIONS.filter(
        (definition) => definition.type !== 'package_zip',
      );
      const usable = others.filter((definition) =>
        isExportable(evaluateArtifact(definition.type, input).status),
      );
      if (usable.length === 0) {
        return wrap('NOT_AVAILABLE', {
          en: 'Nothing to package — no artifact currently passes its own prerequisites.',
          zh: '沒有可封裝的內容，目前沒有任何產出符合前置條件。',
        });
      }
      return wrap('READY');
    }
  }
}

export function evaluateAllArtifacts(input: ReadinessInput): Record<ArtifactType, ArtifactReadiness> {
  const result = {} as Record<ArtifactType, ArtifactReadiness>;
  for (const definition of ARTIFACT_DEFINITIONS) {
    result[definition.type] = evaluateArtifact(definition.type, input);
  }
  return result;
}

// --- validation (12 §31) ----------------------------------------------------

export interface ValidationInput extends ReadinessInput {
  selected: ArtifactType[];
  base_filename: string;
  readiness: Record<ArtifactType, ArtifactReadiness>;
  /** From the Screen 09 snapshot when one exists. */
  analytical_only: boolean;
}

export function validateExport(input: ValidationInput): ExportValidation {
  const blocking: string[] = [];
  const blocking_zh: string[] = [];
  const warnings: string[] = [];
  const warnings_zh: string[] = [];

  const block = (en: string, zh: string) => {
    blocking.push(en);
    blocking_zh.push(zh);
  };
  const warn = (en: string, zh: string) => {
    warnings.push(en);
    warnings_zh.push(zh);
  };

  // 12 §31 — "no artifact selected" and "filename empty" are blocking.
  if (input.selected.length === 0) {
    block('No artifact is selected.', '尚未選取任何匯出項目。');
  }
  if (input.base_filename.trim().length === 0) {
    block('The base filename is empty.', '基本檔名為空。');
  }

  // A selected artifact that cannot be produced is blocking for THIS export.
  // Anything unselected is simply not this export's problem (§43).
  for (const type of input.selected) {
    const readiness = input.readiness[type];
    if (!readiness || isExportable(readiness.status)) continue;
    const definition = ARTIFACT_DEFINITIONS.find((entry) => entry.type === type);
    block(
      `${definition?.label ?? type} is ${readiness.status}: ${readiness.reason}`,
      `${definition?.zh ?? type} 為 ${readiness.status}：${readiness.reason_zh}`,
    );
  }

  // --- warnings (§31, §46) --------------------------------------------------
  for (const type of input.selected) {
    const readiness = input.readiness[type];
    if (readiness?.status !== 'WARNING') continue;
    const definition = ARTIFACT_DEFINITIONS.find((entry) => entry.type === type);
    warn(
      `${definition?.label ?? type}: ${readiness.reason}`,
      `${definition?.zh ?? type}：${readiness.reason_zh}`,
    );
  }

  if (input.analytical_only) {
    warn(
      'Analytical-only: no FloTHERM or measurement validation exists yet.',
      '僅 analytical：尚未有 FloTHERM 或量測驗證。',
    );
    // 12 §37 — stated as Deferred, never as a validated zero.
    warn('External CFD validation is Deferred (Screen 03).', '外部 CFD 驗證為 Deferred（Screen 03）。');
  }
  if (input.components_without_limits > 0) {
    warn(
      `${input.components_without_limits} component(s) lack thermal limits.`,
      `有 ${input.components_without_limits} 個元件缺少 thermal limit。`,
    );
  }
  if (input.low_confidence_edges > 0) {
    warn(
      `${input.low_confidence_edges} critical edge(s) use low-confidence Rth.`,
      `有 ${input.low_confidence_edges} 段關鍵連線使用低可信度 Rth。`,
    );
  }
  // 12 §44 — reported, never used to block.
  if (input.snapshot?.overall_status === 'FAIL') {
    warn(
      'Overall Thermal Status is FAIL. A failure report is valid engineering output and does not block export.',
      '整體熱狀態為 FAIL；失敗報告仍是有效的工程輸出，不會阻擋匯出。',
    );
  }

  return { blocking, blocking_zh, warnings, warnings_zh };
}

// --- global status (12 §5) --------------------------------------------------

export function globalStatus(input: {
  validation: ExportValidation;
  selected: ArtifactType[];
  exporting: boolean;
  results: Array<{ status: 'EXPORTED' | 'WARNING' | 'FAILED' | 'SKIPPED' }>;
}): GlobalExportStatus {
  if (input.exporting) return 'EXPORTING';

  if (input.results.length > 0) {
    const failed = input.results.filter((result) => result.status === 'FAILED').length;
    const succeeded = input.results.filter(
      (result) => result.status === 'EXPORTED' || result.status === 'WARNING',
    ).length;
    if (failed > 0 && succeeded > 0) return 'PARTIAL';
    if (failed > 0) return 'FAILED';
    if (succeeded > 0) return 'COMPLETE';
  }

  if (input.validation.blocking.length > 0) return 'WARNING';
  if (input.validation.warnings.length > 0) return 'WARNING';
  return 'READY';
}

/** 12 §42 — a WARNING in the selection means the export must be confirmed. */
export function requiresConfirmation(
  selected: ArtifactType[],
  readiness: Record<ArtifactType, ArtifactReadiness>,
): boolean {
  return selected.some((type) => readiness[type]?.status === 'WARNING');
}
