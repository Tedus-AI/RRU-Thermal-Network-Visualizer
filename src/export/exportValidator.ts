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
  type SourceKey,
  type SourceReadiness,
  type SourceReadinessEntry,
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
  /** True when the Screen 10 snapshot no longer matches the live overview. */
  snapshot_stale: boolean;
  payload: ReportExportPayload | null;
  /** Number of components with no thermal limit, for the §31 warning list. */
  components_without_limits: number;
  /** Low-confidence edges on the critical path, from the Screen 10 snapshot. */
  low_confidence_edges: number;
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
  // Screen 11 payload, and Screen 11 refuses to build one it cannot stand behind.
  if (input.payload.readiness === 'BLOCKED') return 'BLOCKED';
  if (input.snapshot_stale) return 'BLOCKED';
  if (input.payload.readiness === 'WARNING') return 'WARNING';
  return 'READY';
}

function reportReason(input: ReadinessInput): { en: string; zh: string } {
  if (!input.payload) {
    return {
      en: 'No export payload. Prepare one in Screen 11 Report Preview.',
      zh: '尚無匯出資料包，請於 11 Report Preview 準備。',
    };
  }
  if (input.payload.readiness === 'BLOCKED') {
    return {
      en: 'Screen 11 Report Readiness is BLOCKED.',
      zh: 'Screen 11 的 Report Readiness 為 BLOCKED。',
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
      en: 'Screen 11 reported WARNING. Export requires confirmation.',
      zh: 'Screen 11 為 WARNING，匯出前需確認。',
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

    case 'temperature_csv':
      if (('distribution' in input || 'distribution_stale' in input) && !input.distribution) {
        return wrap('NOT_AVAILABLE', {
          en: 'No formal Screen 09 distribution. Refresh Screen 09 first.',
          zh: '尚無正式的 Screen 09 溫度分佈結果，請先重新整理 Screen 09。',
        });
      }
      if (input.distribution_stale) {
        return wrap('BLOCKED', {
          en: 'The Screen 09 distribution is stale. Refresh it before export.',
          zh: 'Screen 09 溫度分佈已過期，請先重新整理。',
        });
      }
      return wrap(solvedResultStatus(input), solvedResultReason(input));

    case 'bottleneck_csv': {
      if (!input.analysis) {
        return wrap('NOT_AVAILABLE', {
          en: 'No bottleneck analysis. Run one in Screen 08.',
          zh: '尚無瓶頸分析，請於 08 執行。',
        });
      }
      if (input.analysis.state === 'FAILED') {
        return wrap('BLOCKED', { en: 'The last analysis failed.', zh: '上次分析失敗。' });
      }
      // 12 §13 — a ranking built on a superseded solve is blocked, not caveated.
      if (input.analysis_stale || input.solution_stale) {
        return wrap('BLOCKED', {
          en: 'The analysis was built on a superseded solve. Re-run Screen 08.',
          zh: '分析基於已被取代的求解結果，請於 08 重新分析。',
        });
      }
      if (input.analysis.state === 'WARNING') {
        return wrap('WARNING', {
          en: 'Screen 08 completed with warnings.',
          zh: '08 分析完成但有警告。',
        });
      }
      return wrap('READY');
    }

    case 'network_json':
    case 'network_csv': {
      if (!input.network || Object.keys(input.network.nodes).length === 0) {
        return wrap('NOT_AVAILABLE', {
          en: 'No thermal network. Build one in Screen 05.',
          zh: '尚無熱網路，請於 05 建立。',
        });
      }
      // 12 §45 — the graph is a CONFIGURATION. It stays exportable when the
      // solve is stale; the document says so rather than the export refusing.
      if (input.solution_stale || !input.solution) {
        return wrap('WARNING', {
          en: 'Exported as configuration — the solved result is marked stale or absent.',
          zh: '以設定形式匯出，求解結果標記為過期或不存在。',
        });
      }
      return wrap('READY');
    }

    case 'scenario_json': {
      if (!input.boundary) {
        return wrap('NOT_AVAILABLE', {
          en: 'No boundary set for this scenario. Configure Screen 06.',
          zh: '此情境尚無邊界設定，請於 06 設定。',
        });
      }
      if (input.boundary.status === 'draft') {
        return wrap('WARNING', {
          en: 'The boundary set is still a draft.',
          zh: '邊界設定仍為草稿。',
        });
      }
      return wrap('READY');
    }

    case 'png_snapshots': {
      const solved = solvedResultStatus(input);
      if (solved !== 'READY') return wrap(solved, solvedResultReason(input));
      if (!input.analysis || input.analysis_stale) {
        // 12 §31 — "optional image unavailable" is a warning, never a blocker.
        return wrap('WARNING', {
          en: 'The bottleneck overlay is unavailable; the other views still export.',
          zh: '瓶頸疊圖不可用，其餘視圖仍可匯出。',
        });
      }
      if (
        ('distribution' in input || 'distribution_stale' in input) &&
        (!input.distribution || input.distribution_stale)
      ) {
        return wrap('WARNING', {
          en: 'The Screen 09 distribution snapshot is unavailable; current 07/08 views still export.',
          zh: 'Screen 09 分佈快照不可用；目前的 07/08 畫面仍可匯出。',
        });
      }
      return wrap('READY');
    }

    case 'manifest':
      // 12 §17 — the manifest describes the session and is always producible.
      return wrap('READY');

    case 'package_zip': {
      const others = ARTIFACT_DEFINITIONS.filter(
        (definition) => definition.type !== 'package_zip' && definition.type !== 'manifest',
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

// --- source readiness panel (12 §32) ----------------------------------------

export function evaluateSources(input: ReadinessInput): SourceReadinessEntry[] {
  const entry = (
    key: SourceKey,
    state: SourceReadiness,
    detail: string,
    detail_zh: string,
  ): SourceReadinessEntry => ({ key, state, detail, detail_zh });

  const solutionState: SourceReadiness = !input.solution
    ? 'NOT_AVAILABLE'
    : input.solution.status === 'FAILED'
      ? 'BLOCKED'
      : input.solution_stale
        ? 'BLOCKED'
        : input.solution.status === 'WARNING'
          ? 'WARNING'
          : 'READY';

  return [
    entry(
      'report',
      !input.payload
        ? 'NOT_AVAILABLE'
        : input.payload.readiness === 'BLOCKED' || input.snapshot_stale
          ? 'BLOCKED'
          : input.payload.readiness === 'WARNING'
            ? 'WARNING'
            : 'READY',
      input.payload
        ? `Screen 11 payload · readiness ${input.payload.readiness}`
        : 'No Screen 11 export payload.',
      input.payload ? `Screen 11 匯出資料包，狀態 ${input.payload.readiness}` : '尚無 Screen 11 匯出資料包。',
    ),
    entry(
      'thermal_solution',
      solutionState,
      input.solution
        ? `Solver ${input.solution.status}${input.solution_stale ? ' · stale' : ''} · ${input.solution.solved_at}`
        : 'No solution for this scenario.',
      input.solution
        ? `求解 ${input.solution.status}${input.solution_stale ? '（已過期）' : ''}`
        : '此情境尚無求解結果。',
    ),
    entry(
      'bottleneck_analysis',
      !input.analysis
        ? 'NOT_AVAILABLE'
        : input.analysis.state === 'FAILED'
          ? 'BLOCKED'
          : input.analysis_stale || input.solution_stale
            ? 'BLOCKED'
            : input.analysis.state === 'WARNING'
              ? 'WARNING'
              : 'READY',
      input.analysis
        ? `${input.analysis.results.length} ranked edge(s) · ${input.analysis.analyzed_at}`
        : 'Screen 08 has not been run.',
      input.analysis ? `已排名 ${input.analysis.results.length} 段連線` : '尚未執行 08 瓶頸分析。',
    ),
    entry(
      'temperature_distribution',
      'distribution' in input || 'distribution_stale' in input
        ? !input.distribution
          ? 'NOT_AVAILABLE'
          : input.distribution_stale || input.solution_stale
            ? 'BLOCKED'
            : 'READY'
        : solutionState,
      input.solution
        ? `Derived from the current solve · ${Object.keys(input.solution.node_temperatures_C).length} node(s)`
        : 'No solved temperatures.',
      input.solution ? '由目前求解結果推導' : '尚無求解溫度。',
    ),
    entry(
      'network_data',
      !input.network || Object.keys(input.network.nodes).length === 0 ? 'NOT_AVAILABLE' : 'READY',
      input.network
        ? `${Object.keys(input.network.nodes).length} node(s) · ${Object.keys(input.network.edges).length} edge(s)`
        : 'No thermal network.',
      input.network
        ? `${Object.keys(input.network.nodes).length} 個節點、${Object.keys(input.network.edges).length} 段連線`
        : '尚無熱網路。',
    ),
    entry(
      'scenario_boundary',
      !input.boundary ? 'NOT_AVAILABLE' : input.boundary.status === 'draft' ? 'WARNING' : 'READY',
      input.boundary
        ? `Boundary set ${input.boundary.status} · ${input.boundary.profiles.length} profile(s)`
        : 'No boundary set.',
      input.boundary ? `邊界設定：${input.boundary.status}` : '尚無邊界設定。',
    ),
    entry(
      'snapshots',
      solutionState === 'READY'
        ? input.analysis && !input.analysis_stale
          ? 'READY'
          : 'WARNING'
        : solutionState,
      solutionState === 'READY'
        ? input.analysis && !input.analysis_stale
          ? 'Network, overlay and histogram views are renderable.'
          : 'Network and histogram renderable; overlay needs Screen 08.'
        : 'Chart snapshots need a current solve.',
      solutionState === 'READY' ? '可重繪圖表快照。' : '圖表快照需要目前的求解結果。',
    ),
  ];
}

// --- validation (12 §31) ----------------------------------------------------

export interface ValidationInput extends ReadinessInput {
  selected: ArtifactType[];
  base_filename: string;
  readiness: Record<ArtifactType, ArtifactReadiness>;
  /** From the Screen 10 snapshot when one exists. */
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
