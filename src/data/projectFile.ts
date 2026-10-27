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

import { createBaselineScenario, type Project, type Scenario } from '@/domain/project';
import { AI_KEY, projectAiAfterRename, projectAiLinkOf } from '@/domain/projectAiLink';
import type { ComponentRevisionSet } from '@/domain/revision';
import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { BottleneckAnalysis, ImprovementStudy } from '@/thermal/analysis/analysisTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { TemperatureDistributionResult } from '@/thermal/analysis/distributionResult';
import type {
  ReportExportPayload,
  ReportTemplate,
  ThermalReportConfig,
} from '@/report/reportTypes';

import {
  clearProjectData,
  withPersistenceTransaction,
  loadAnalyses,
  loadBoundarySets,
  loadComponentRevisions,
  loadComponents,
  loadExportPayloads,
  loadExportPreferences,
  normalizeExportPreferences,
  loadExportStamp,
  loadNetwork,
  loadNetworkReviewState,
  loadProject,
  loadProposals,
  loadReportConfigs,
  loadReportTemplates,
  saveReportTemplate,
  loadScenarios,
  loadSnapshots,
  loadSolutions,
  projectIdExists,
  saveAnalysis,
  saveBoundarySet,
  saveComponentRevisions,
  saveComponents,
  saveExportPayload,
  saveExportPreferences,
  saveExportStamp,
  saveNetwork,
  saveNetworkReviewState,
  saveProject,
  saveProposal,
  saveReportConfig,
  saveScenarios,
  saveSnapshot,
  saveSolution,
  type ExportPreferences,
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
  proposals: ImprovementStudy[];
  snapshots: ResultsOverviewSnapshot[];
  report_configs: ThermalReportConfig[];
  /**
   * Saved report templates.
   *
   * They live in a browser-global list, which is what a template library is —
   * but that made them the one thing on Screen 10 the .tnv.json did not carry,
   * so a template survived a reload and not a machine. They travel with the
   * file now and merge back into the library on import.
   */
  report_templates: ReportTemplate[];
  export_payloads: ReportExportPayload[];
  export_stamp: ExportStamp | null;
  /**
   * What the Export Center was last set to.
   *
   * It used to live only in a browser-local key, which made it the one part of
   * the screen a .tnv.json did not carry -- the settings survived a reload on
   * one machine and were gone on the next. They travel with the file now, the
   * way the report layout does.
   */
  export_preferences: ExportPreferences | null;
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
      // Derived from the solution since Temperature Distribution was removed. The key
      // stays, empty, so a file this build writes still loads in one that
      // expects it.
      distributions: [],
      proposals: loadProposals(projectId),
      snapshots: loadSnapshots(projectId),
      report_configs: loadReportConfigs(projectId),
      report_templates: loadReportTemplates(),
      export_payloads: loadExportPayloads(projectId),
      export_stamp: loadExportStamp(projectId),
      export_preferences: loadExportPreferences(projectId),
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

/** The bundle's list sections; each, when present, must be a list of records. */
const LIST_SECTIONS = [
  'scenarios',
  'components',
  'boundary_sets',
  'solutions',
  'analyses',
  'distributions',
  'proposals',
  'snapshots',
  'report_configs',
  'report_templates',
  'export_payloads',
] as const;

/** The bundle's single-record sections; each, when present, must be a record. */
const RECORD_SECTIONS = ['network', 'component_revisions', 'network_review', 'export_stamp'] as const;

/**
 * The first section whose SHAPE is wrong, or null.
 *
 * Shape only — a list where a list belongs, records inside it, a record where
 * a record belongs. Field-level tolerance stays with the loaders. This used to
 * be skipped entirely, so a file whose `scenarios` was an object reached
 * `applyProjectFile`, wrote the project record, then threw on `.map` and left
 * a half-imported project behind.
 */
function malformedSection(data: Record<string, unknown>): string | null {
  for (const section of LIST_SECTIONS) {
    const value = data[section];
    if (value == null) continue;
    if (!Array.isArray(value) || !value.every(isRecord)) return section;
  }
  for (const section of RECORD_SECTIONS) {
    const value = data[section];
    if (value != null && !isRecord(value)) return section;
  }
  return null;
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

  const malformed = malformedSection(data);
  if (malformed) {
    return {
      ok: false,
      error: `The file's "${malformed}" section is malformed, so nothing was imported.`,
      error_zh: `此檔案的「${malformed}」區段格式錯誤，未匯入任何資料。`,
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
 * Writes a parsed file into storage — all of it, or none of it.
 *
 * In `copy` mode every record is re-pointed at the new project id before being
 * written; the id appears on each collection's rows as well as on the project,
 * so rewriting only the project record would leave orphans behind.
 *
 * In `overwrite` mode the project's existing data is cleared first, so the
 * file REPLACES it. It used to be merged in: a solution, analysis or boundary
 * set for a scenario the file no longer had survived the import and stayed
 * attached to a network it was never solved on.
 *
 * The whole write is one transaction. A failure part-way used to leave a
 * half-written project in the cache — which the folder mirror would then copy
 * over the good file.
 */
export function applyProjectFile(file: ProjectFile, mode: ImportMode): ImportOutcome {
  return withPersistenceTransaction(() => {
    const targetId = mode === 'copy' ? availableProjectId(file.project_id) : file.project_id;
    if (mode === 'overwrite') clearProjectData(targetId);
    // A copy that keeps the original's name leaves two indistinguishable rows in
    // the project selector, since the id is not shown there.
    const projectName =
      mode === 'copy'
        ? `${file.data.project.project_name} (copy)`.trim()
        : file.data.project.project_name;
    return { ...writeBundle(file.data, targetId, projectName), mode };
  });
}

/** What Screen 01's Duplicate Project carries over, beyond the project record itself. */
export interface DuplicateOptions {
  components: boolean;
  network: boolean;
  scenarios: boolean;
  /** Solutions and everything read from them: analyses, studies, snapshots, report and export state. */
  results: boolean;
}

/**
 * The options a copy can actually stand on.
 *
 * A network is built out of components, so it cannot come without them; a
 * solution belongs to one network and one scenario, so results bring both.
 * The dialog shows these as ticked and locked rather than letting a copy come
 * out with nodes that point at parts it does not have.
 */
export function resolveDuplicateOptions(options: DuplicateOptions): DuplicateOptions {
  const results = options.results;
  const network = options.network || results;
  const scenarios = options.scenarios || results;
  const components = options.components || network;
  return { components, network, scenarios, results };
}

/**
 * Screen 01's Duplicate Project: a new project with its own id and name, holding
 * what was ticked.
 *
 * Records are copied as they are, revisions included, exactly as importing a
 * project file as a copy does: a solution is only valid against the revisions
 * it was solved on, so a fresh revision anywhere would turn copied results
 * stale the moment they arrived. Boundary sets go along when both the network
 * they attach to and the scenarios they belong to do; without either they would
 * be orphans. Without the scenarios the copy starts from a Baseline, as a new
 * project does.
 *
 * One transaction: all of it lands, or none of it.
 */
export function duplicateProject(
  sourceId: string,
  target: { id: string; name: string },
  options: DuplicateOptions,
  appBuild: string,
): ImportOutcome | null {
  const file = collectProject(sourceId, appBuild);
  if (!file) return null;
  const take = resolveDuplicateOptions(options);
  const source = file.data;
  const now = new Date().toISOString();

  const keepScenarios = take.scenarios && source.scenarios.length > 0;
  const fresh = keepScenarios ? null : createBaselineScenario(target.id);
  // A fresh Baseline of a linked project starts from the ambient the link holds, not from 55.
  const linkedAmbient = projectAiLinkOf(source.project)?.values[AI_KEY.ambient];
  const baseline =
    fresh && typeof linkedAmbient === 'number' ? { ...fresh, ambient_C: linkedAmbient } : fresh;
  const results = take.results;

  const data: ProjectBundle = {
    ...source,
    project: {
      // A copy named differently keeps the AI-Thermal link with the name taken over.
      ...projectAiAfterRename(source.project, target.name),
      status: 'active',
      active_scenario_id: baseline ? baseline.id : source.project.active_scenario_id,
      meta: { ...source.project.meta, created_at: now, updated_at: now },
    },
    scenarios: baseline ? [baseline] : source.scenarios,
    components: take.components ? source.components : [],
    network: take.network ? source.network : null,
    boundary_sets: take.network && keepScenarios ? source.boundary_sets : [],
    network_review: take.network
      ? source.network_review
      : { requires_review: false, reasons: [], updated_at: now },
    solutions: results ? source.solutions : [],
    analyses: results ? source.analyses : [],
    distributions: [],
    proposals: results ? source.proposals : [],
    snapshots: results ? source.snapshots : [],
    report_configs: results ? source.report_configs : [],
    // The template library belongs to the browser, not to either project.
    report_templates: [],
    export_payloads: results ? source.export_payloads : [],
    export_stamp: results ? source.export_stamp : null,
    export_preferences: results ? source.export_preferences : null,
  };

  return withPersistenceTransaction(() => ({
    ...writeBundle(data, target.id, target.name, take.components),
    mode: 'copy' as const,
  }));
}

/**
 * Re-points a record at the project it is being written into.
 *
 * Boundary sets, analyses, snapshots and report configs carry the project id
 * on the row as well as in the storage key; a copy that rewrote only the key
 * left them naming the project they came from.
 */
function repoint<T>(record: T, projectId: string): T {
  if (record && typeof record === 'object' && 'project_id' in record) {
    return { ...record, project_id: projectId };
  }
  return record;
}

function writeBundle(
  data: ProjectBundle,
  targetId: string,
  projectName: string,
  /** False leaves the component revision record out, for a copy without components. */
  withComponentRevisions = true,
): Omit<ImportOutcome, 'mode'> {
  const written: string[] = [];
  const note = (label: string, count: number) => {
    if (count > 0) written.push(`${label} (${count})`);
  };

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

  if (withComponentRevisions && data.component_revisions) {
    saveComponentRevisions(targetId, data.component_revisions);
  }

  if (data.network) {
    saveNetwork(targetId, { ...data.network, project_id: targetId });
    note('network nodes', Object.keys(data.network.nodes ?? {}).length);
  }

  for (const set of data.boundary_sets ?? []) saveBoundarySet(targetId, repoint(set, targetId));
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

  for (const analysis of data.analyses ?? []) saveAnalysis(targetId, repoint(analysis, targetId));
  note('analyses', (data.analyses ?? []).length);

  // `data.distributions` in an older file is read past: the rows are a
  // projection of the solution, and the solution is imported above.

  for (const proposal of data.proposals ?? []) saveProposal(targetId, repoint(proposal, targetId));
  note('proposals', (data.proposals ?? []).length);

  for (const snapshot of data.snapshots ?? []) saveSnapshot(targetId, repoint(snapshot, targetId));
  note('snapshots', (data.snapshots ?? []).length);

  for (const config of data.report_configs ?? []) {
    saveReportConfig(targetId, repoint(config, targetId));
  }
  note('report configs', (data.report_configs ?? []).length);
  // Merged, not replaced: the library belongs to the browser and may already
  // hold templates this file has never heard of.
  const existingTemplates = new Set(loadReportTemplates().map((entry) => entry.name));
  for (const template of data.report_templates ?? []) {
    if (!existingTemplates.has(template.name)) saveReportTemplate(template);
  }
  note('report templates', (data.report_templates ?? []).length);

  for (const payload of data.export_payloads ?? []) {
    saveExportPayload(targetId, repoint(payload, targetId));
  }
  note('report payloads', (data.export_payloads ?? []).length);

  if (data.export_stamp) saveExportStamp(targetId, data.export_stamp);
  // Shape-checked on the way in, like everything else the file carries: a
  // preference block that is not one is left out rather than stored for the
  // Export Center to trip over later.
  const exportPreferences = normalizeExportPreferences(data.export_preferences);
  if (exportPreferences) saveExportPreferences(targetId, exportPreferences);

  return { project_id: targetId, written };
}
