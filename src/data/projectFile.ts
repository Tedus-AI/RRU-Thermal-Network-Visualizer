/**
 * Project file — the whole of one project as a single portable document.
 *
 * localStorage is the working store, but it is tied to one browser profile on
 * one machine and is cleared by the build stamp. A project file is the copy the
 * engineer owns: it goes on a disk, into a backup, or onto a colleague's
 * machine, and it is the unit the header's Export / Import act on.
 *
 * Scope is deliberately one project. The component library and report templates
 * are cross-project settings, so they are not swept into a project's file —
 * exporting a project must not drag along someone else's library.
 *
 * Everything goes through `persistence`'s public loaders and savers rather than
 * touching localStorage directly, so a project file inherits the same migration
 * and merge behaviour as any other read or write.
 */

import type { Project, Scenario } from '@/domain/project';
import type { ComponentRevisionSet } from '@/domain/revision';
import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { BottleneckAnalysis, BottleneckProposal } from '@/thermal/analysis/analysisTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { TemperatureDistributionResult } from '@/thermal/analysis/distributionResult';
import type { ReportExportPayload, ThermalReportConfig } from '@/report/reportTypes';

import {
  loadAnalyses,
  loadBoundarySets,
  loadComponentRevisions,
  loadComponents,
  loadDistributions,
  loadExportPayloads,
  loadExportStamp,
  loadNetwork,
  loadNetworkReviewState,
  loadProject,
  loadProposals,
  loadReportConfigs,
  loadScenarios,
  loadSnapshots,
  loadSolutions,
  projectIdExists,
  saveAnalysis,
  saveBoundarySet,
  saveComponentRevisions,
  saveComponents,
  saveDistribution,
  saveExportPayload,
  saveExportStamp,
  saveNetwork,
  saveNetworkReviewState,
  saveProject,
  saveProposal,
  saveReportConfig,
  saveScenarios,
  saveSnapshot,
  saveSolution,
  type ExportStamp,
  type NetworkReviewState,
} from './persistence';

export const PROJECT_FILE_FORMAT = 'tnv.project';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.tnv.json';

/** Every per-project collection, in the order it is written back. */
export interface ProjectBundle {
  project: Project;
  scenarios: Scenario[];
  components: Component[];
  component_revisions: ComponentRevisionSet;
  network: ThermalNetwork | null;
  boundary_sets: ScenarioBoundaryConditionSet[];
  solutions: ThermalSolution[];
  network_review: NetworkReviewState;
  analyses: BottleneckAnalysis[];
  distributions: TemperatureDistributionResult[];
  proposals: BottleneckProposal[];
  snapshots: ResultsOverviewSnapshot[];
  report_configs: ThermalReportConfig[];
  export_payloads: ReportExportPayload[];
  export_stamp: ExportStamp | null;
}

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  format_version: number;
  exported_at: string;
  /** Which build wrote the file, so a mismatch can be reported rather than guessed at. */
  app_build: string;
  project_id: string;
  project_name: string;
  data: ProjectBundle;
}

/** What a file contains, for the confirmation dialog to show before it writes. */
export interface ProjectFileSummary {
  project_id: string;
  project_name: string;
  exported_at: string;
  app_build: string;
  scenarios: number;
  components: number;
  nodes: number;
  edges: number;
  solutions: number;
  analyses: number;
  snapshots: number;
  /** True when a project with this id is already in local storage. */
  collides: boolean;
}

// --- Export ----------------------------------------------------------------

/** Collects one project, or null when the id is not in storage. */
export function collectProject(projectId: string, appBuild: string): ProjectFile | null {
  const project = loadProject(projectId);
  if (!project) return null;

  const components = loadComponents(projectId);

  return {
    format: PROJECT_FILE_FORMAT,
    format_version: PROJECT_FILE_VERSION,
    exported_at: new Date().toISOString(),
    app_build: appBuild,
    project_id: projectId,
    project_name: project.project_name,
    data: {
      project,
      scenarios: loadScenarios(projectId),
      components,
      component_revisions: loadComponentRevisions(projectId, components),
      network: loadNetwork(projectId),
      boundary_sets: loadBoundarySets(projectId),
      solutions: loadSolutions(projectId),
      network_review: loadNetworkReviewState(projectId),
      analyses: loadAnalyses(projectId),
      distributions: loadDistributions(projectId),
      proposals: loadProposals(projectId),
      snapshots: loadSnapshots(projectId),
      report_configs: loadReportConfigs(projectId),
      export_payloads: loadExportPayloads(projectId),
      export_stamp: loadExportStamp(projectId),
    },
  };
}

export function serializeProjectFile(file: ProjectFile): string {
  // Indented: a project file is something an engineer may open and read.
  return JSON.stringify(file, null, 2);
}

/**
 * `<project id>_<timestamp>.tnv.json`, with anything filesystem-hostile removed.
 */
export function projectFilename(projectId: string, at: Date = new Date()): string {
  const safe = projectId.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'project';
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '');
  return `${safe}_${stamp}${PROJECT_FILE_EXTENSION}`;
}

// --- Import ----------------------------------------------------------------

export type ParseResult =
  | { ok: true; file: ProjectFile; summary: ProjectFileSummary }
  | { ok: false; error: string; error_zh: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Validates a candidate file far enough to describe it, without trusting it.
 *
 * The checks stop at structure. Deep-validating every node and edge here would
 * duplicate the per-collection hydration in `persistence`, which already
 * tolerates missing fields and is where that responsibility lives.
 */
export function parseProjectFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'The file is not valid JSON.',
      error_zh: '此檔案不是有效的 JSON。',
    };
  }

  if (!isRecord(raw) || raw.format !== PROJECT_FILE_FORMAT) {
    return {
      ok: false,
      error: 'Not a Thermal Network Visualizer project file.',
      error_zh: '這不是 Thermal Network Visualizer 的專案檔。',
    };
  }

  const version = typeof raw.format_version === 'number' ? raw.format_version : 0;
  if (version > PROJECT_FILE_VERSION) {
    return {
      ok: false,
      error: `The file was written by a newer format (v${version}); this build reads up to v${PROJECT_FILE_VERSION}.`,
      error_zh: `此檔案為較新的格式版本（v${version}），目前版本僅支援到 v${PROJECT_FILE_VERSION}。`,
    };
  }

  const data = raw.data;
  if (!isRecord(data) || !isRecord(data.project)) {
    return {
      ok: false,
      error: 'The file is missing its project record.',
      error_zh: '此檔案缺少專案主記錄。',
    };
  }

  const projectId = typeof raw.project_id === 'string' ? raw.project_id : '';
  if (!projectId) {
    return {
      ok: false,
      error: 'The file has no project id.',
      error_zh: '此檔案沒有專案代號。',
    };
  }

  const network = isRecord(data.network) ? data.network : null;

  return {
    ok: true,
    file: raw as unknown as ProjectFile,
    summary: {
      project_id: projectId,
      project_name: typeof raw.project_name === 'string' ? raw.project_name : projectId,
      exported_at: typeof raw.exported_at === 'string' ? raw.exported_at : '',
      app_build: typeof raw.app_build === 'string' ? raw.app_build : 'unknown',
      scenarios: arrayLength(data.scenarios),
      components: arrayLength(data.components),
      nodes: network ? Object.keys((network.nodes as object) ?? {}).length : 0,
      edges: network ? Object.keys((network.edges as object) ?? {}).length : 0,
      solutions: arrayLength(data.solutions),
      analyses: arrayLength(data.analyses),
      snapshots: arrayLength(data.snapshots),
      collides: projectIdExists(projectId),
    },
  };
}

/** How to resolve a project id that is already present locally. */
export type ImportMode = 'overwrite' | 'copy';

export interface ImportOutcome {
  project_id: string;
  mode: ImportMode;
  /** Collections that actually carried something, for the success message. */
  written: string[];
}

/** `ID`, `ID_copy`, `ID_copy2`, … — the first that is free. */
export function availableProjectId(base: string): string {
  if (!projectIdExists(base)) return base;
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? `${base}_copy` : `${base}_copy${n}`;
    if (!projectIdExists(candidate)) return candidate;
  }
  return `${base}_copy_${Date.now()}`;
}

/**
 * Writes a parsed file into storage.
 *
 * In `copy` mode every record is re-pointed at the new project id before being
 * written; the id appears on each collection's rows as well as on the project,
 * so rewriting only the project record would leave orphans behind.
 */
export function applyProjectFile(file: ProjectFile, mode: ImportMode): ImportOutcome {
  const targetId = mode === 'copy' ? availableProjectId(file.project_id) : file.project_id;
  const { data } = file;
  const written: string[] = [];
  const note = (label: string, count: number) => {
    if (count > 0) written.push(`${label} (${count})`);
  };

  // A copy that keeps the original's name leaves two indistinguishable rows in
  // the project selector, since the id is not shown there.
  const projectName =
    mode === 'copy' ? `${data.project.project_name} (copy)`.trim() : data.project.project_name;
  saveProject({ ...data.project, project_id: targetId, project_name: projectName });

  const scenarios = (data.scenarios ?? []).map((scenario) => ({
    ...scenario,
    project_id: targetId,
  }));
  saveScenarios(targetId, scenarios);
  note('scenarios', scenarios.length);

  const components = data.components ?? [];
  saveComponents(targetId, components);
  note('components', components.length);

  if (data.component_revisions) saveComponentRevisions(targetId, data.component_revisions);

  if (data.network) {
    saveNetwork(targetId, { ...data.network, project_id: targetId });
    note('network nodes', Object.keys(data.network.nodes ?? {}).length);
  }

  for (const set of data.boundary_sets ?? []) saveBoundarySet(targetId, set);
  note('boundary sets', (data.boundary_sets ?? []).length);

  for (const solution of data.solutions ?? []) {
    saveSolution(targetId, { ...solution, project_id: targetId });
  }
  note('solutions', (data.solutions ?? []).length);

  if (data.network_review) {
    saveNetworkReviewState(targetId, {
      requires_review: data.network_review.requires_review,
      reasons: data.network_review.reasons,
    });
  }

  for (const analysis of data.analyses ?? []) saveAnalysis(targetId, analysis);
  note('analyses', (data.analyses ?? []).length);

  for (const distribution of data.distributions ?? []) saveDistribution(targetId, distribution);
  note('distributions', (data.distributions ?? []).length);

  for (const proposal of data.proposals ?? []) saveProposal(targetId, proposal);
  note('proposals', (data.proposals ?? []).length);

  for (const snapshot of data.snapshots ?? []) saveSnapshot(targetId, snapshot);
  note('snapshots', (data.snapshots ?? []).length);

  for (const config of data.report_configs ?? []) saveReportConfig(targetId, config);
  note('report configs', (data.report_configs ?? []).length);

  for (const payload of data.export_payloads ?? []) saveExportPayload(targetId, payload);
  note('report payloads', (data.export_payloads ?? []).length);

  if (data.export_stamp) saveExportStamp(targetId, data.export_stamp);

  return { project_id: targetId, mode, written };
}
