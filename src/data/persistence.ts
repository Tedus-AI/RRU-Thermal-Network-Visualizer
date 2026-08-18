/**
 * Persistence adapter.
 *
 * V1 uses localStorage. The screens never talk to this module directly — they go
 * through the stores — so the backend can be swapped for the shared project DB
 * without touching any UI (01 §37).
 *
 * Shared-DB safety rules it must honour (01 §35, 00 §35.2, AC-09):
 *   - merge semantics, never whole-document replace;
 *   - unknown sibling fields written by other tools are preserved verbatim;
 *   - this tool only owns `project_name`, `project_context`, `active_scenario_id`,
 *     `status` and `meta`.
 */

import type { Project, ProjectContext, Scenario } from '@/domain/project';
import { SCHEMA_VERSION, normalizeProjectContext } from '@/domain/project';
import {
  hydrateComponentRevisionSet,
  hydrateRevision,
  hydrateSourceRevision,
  type ComponentRevisionSet,
} from '@/domain/revision';
import type { Component } from '@/domain/component';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork } from '@/thermal/types';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type {
  BottleneckAnalysis,
  BottleneckProposal,
} from '@/thermal/analysis/analysisTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { TemperatureDistributionResult } from '@/thermal/analysis/distributionResult';
import type {
  ReportExportPayload,
  ReportTemplate,
  ThermalReportConfig,
} from '@/report/reportTypes';
import { migrateComponents } from './componentMigration';

const PROJECTS_KEY = 'tnv.projects';
const SCENARIOS_KEY = 'tnv.scenarios';
const COMPONENTS_KEY = 'tnv.components';
const COMPONENT_REVISIONS_KEY = 'tnv.component_revisions';
const NETWORKS_KEY = 'tnv.thermal_networks';
const NETWORK_REVIEW_KEY = 'tnv.network_review_state';
const BOUNDARY_KEY = 'tnv.boundary_sets';
const SOLUTIONS_KEY = 'tnv.thermal_solutions';
const ANALYSES_KEY = 'tnv.bottleneck_analyses';
const DISTRIBUTIONS_KEY = 'tnv.temperature_distributions';
const PROPOSALS_KEY = 'tnv.improvement_proposals';
const SNAPSHOTS_KEY = 'tnv.results_snapshots';
const REPORT_CONFIGS_KEY = 'tnv.report_configs';
const REPORT_TEMPLATES_KEY = 'tnv.report_templates';
const REPORT_PAYLOADS_KEY = 'tnv.report_export_payloads';
const EXPORT_STAMPS_KEY = 'tnv.export_stamps';

/** Keys on a project document that belong to this tool. Everything else is foreign. */
const OWNED_PROJECT_KEYS = [
  'project_id',
  'project_name',
  'revision',
  'project_context',
  'active_scenario_id',
  'status',
  'meta',
] as const;

type RawDoc = Record<string, unknown>;

export interface PersistenceRecoveryIssue {
  key: string;
  raw: string;
  message: string;
}

export class PersistenceCorruptionError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(`Stored collection "${key}" is corrupt and has been opened read-only: ${message}`);
    this.name = 'PersistenceCorruptionError';
    this.key = key;
  }
}

const recoveryIssues = new Map<string, PersistenceRecoveryIssue>();

function parseCollection(key: string, raw: string): Record<string, RawDoc> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object at the collection root');
    }
    recoveryIssues.delete(key);
    return parsed as Record<string, RawDoc>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    recoveryIssues.set(key, { key, raw, message });
    throw new PersistenceCorruptionError(key, message);
  }
}

export function getPersistenceRecoveryIssues(): PersistenceRecoveryIssue[] {
  return [...recoveryIssues.values()].map((issue) => ({ ...issue }));
}

/** Explicit recovery only; callers may export the raw issue before discarding. */
export function discardCorruptCollection(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
  recoveryIssues.delete(key);
}

function readCollection(key: string): Record<string, RawDoc> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      recoveryIssues.delete(key);
      return {};
    }
    return parseCollection(key, raw);
  } catch (error) {
    // Preserve the raw blob and surface a typed error. The caller can present
    // recovery options without silently replacing user data on the next save.
    if (error instanceof PersistenceCorruptionError) throw error;
    throw new PersistenceCorruptionError(key, error instanceof Error ? error.message : 'invalid JSON');
  }
}

/**
 * Write listeners.
 *
 * Every persisted change in the app passes through `writeCollection`, which
 * makes it the one place a mirror can hook without each store having to
 * remember to announce itself. Used by the local-folder sync.
 */
type StorageWriteListener = (key: string) => void;
const writeListeners = new Set<StorageWriteListener>();

export function onStorageWrite(listener: StorageWriteListener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function writeCollection(key: string, value: Record<string, RawDoc>): void {
  if (typeof localStorage === 'undefined') return;
  const existing = localStorage.getItem(key);
  if (existing) parseCollection(key, existing);
  localStorage.setItem(key, JSON.stringify(value));

  for (const listener of writeListeners) {
    try {
      listener(key);
    } catch {
      // A broken mirror must never stop the write that already succeeded.
    }
  }
}

function splitForeignFields(raw: RawDoc): Record<string, unknown> {
  const foreign: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(OWNED_PROJECT_KEYS as readonly string[]).includes(key)) foreign[key] = value;
  }
  return foreign;
}

function hydrateProject(raw: RawDoc): Project {
  const context = (raw.project_context ?? {}) as Partial<ProjectContext>;
  const meta = (raw.meta ?? {}) as Partial<Project['meta']>;
  const now = new Date().toISOString();
  return {
    project_id: String(raw.project_id ?? ''),
    project_name: String(raw.project_name ?? ''),
    revision: hydrateRevision(raw.revision, 'project', meta.updated_at ?? now),
    // Files on disk outlive any one version of the option sets, so a context
    // written by an older build is mapped forward rather than shown as a value
    // its own dropdown can no longer offer.
    project_context: normalizeProjectContext(context),
    active_scenario_id: (raw.active_scenario_id as string | null) ?? null,
    status: raw.status === 'archived' ? 'archived' : 'active',
    meta: {
      created_at: meta.created_at ?? now,
      updated_at: meta.updated_at ?? now,
      schema_version: meta.schema_version ?? SCHEMA_VERSION,
    },
    foreign_fields: splitForeignFields(raw),
  };
}

export function loadProjects(): Project[] {
  return Object.values(readCollection(PROJECTS_KEY)).map(hydrateProject);
}

export function loadProject(projectId: string): Project | null {
  const raw = readCollection(PROJECTS_KEY)[projectId];
  return raw ? hydrateProject(raw) : null;
}

/**
 * Merge-save. Reads the document that is currently on disk, overwrites only the
 * keys this tool owns, and re-attaches every other key exactly as found.
 */
export function saveProject(project: Project): Project {
  const collection = readCollection(PROJECTS_KEY);
  const existing = collection[project.project_id] ?? {};
  const preserved = splitForeignFields(existing);

  const merged: RawDoc = {
    // Foreign fields first so an owned key can never be shadowed by a stale one.
    ...preserved,
    ...(project.foreign_fields ?? {}),
    project_id: project.project_id,
    project_name: project.project_name,
    revision: project.revision,
    project_context: project.project_context,
    active_scenario_id: project.active_scenario_id,
    status: project.status,
    meta: { ...project.meta, updated_at: new Date().toISOString() },
  };

  collection[project.project_id] = merged;
  writeCollection(PROJECTS_KEY, collection);
  return hydrateProject(merged);
}

export function deleteProject(projectId: string): void {
  const collection = readCollection(PROJECTS_KEY);
  delete collection[projectId];
  writeCollection(PROJECTS_KEY, collection);
}

export function projectIdExists(projectId: string): boolean {
  return projectId in readCollection(PROJECTS_KEY);
}

// --- Scenarios -------------------------------------------------------------
// Stored in their own collection so large per-project thermal data never rides
// inside the shared project document (00 §35.2).

export function loadScenarios(projectId: string): Scenario[] {
  const all = readCollection(SCENARIOS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, Scenario>;
  const projectUpdatedAt = loadProject(projectId)?.meta.updated_at ?? projectId;
  return Object.values(bucket).map((scenario) => ({
    ...scenario,
    revision: hydrateRevision(
      scenario.revision,
      'scenario',
      `${projectUpdatedAt}:${scenario.id}`,
    ),
  }));
}

export function saveScenarios(projectId: string, scenarios: Scenario[]): void {
  const all = readCollection(SCENARIOS_KEY);
  const bucket: Record<string, Scenario> = {};
  for (const scenario of scenarios) {
    bucket[scenario.id] = {
      ...scenario,
      revision: hydrateRevision(scenario.revision, 'scenario', `${projectId}:${scenario.id}`),
    };
  }
  all[projectId] = bucket;
  writeCollection(SCENARIOS_KEY, all);
}

// --- Components ------------------------------------------------------------
// Screen 02 owns the import flow; this is the storage contract it will write to.

export function loadComponents(projectId: string): Component[] {
  const all = readCollection(COMPONENTS_KEY);
  // Records written by earlier versions are upgraded here, so no screen ever
  // sees a stale component shape.
  return migrateComponents(all[projectId]);
}

export function saveComponents(projectId: string, components: Component[]): void {
  const all = readCollection(COMPONENTS_KEY);
  all[projectId] = components as unknown as RawDoc;
  writeCollection(COMPONENTS_KEY, all);
}

/**
 * The component collection remains the legacy-compatible array shape. Its three
 * store-level clocks therefore live in one additive, namespaced collection.
 */
export function loadComponentRevisions(
  projectId: string,
  components: Component[] = loadComponents(projectId),
): ComponentRevisionSet {
  const all = readCollection(COMPONENT_REVISIONS_KEY);
  const stored = all[projectId] as Partial<ComponentRevisionSet> | undefined;
  const latestComponentTimestamp = components
    .flatMap((component) => [
      component.provenance.last_modified_at,
      component.provenance.imported_at,
    ])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const fallback = latestComponentTimestamp ?? loadProject(projectId)?.meta.updated_at ?? projectId;
  return hydrateComponentRevisionSet(stored, fallback);
}

export function saveComponentRevisions(
  projectId: string,
  revisions: ComponentRevisionSet,
): void {
  const all = readCollection(COMPONENT_REVISIONS_KEY);
  all[projectId] = revisions as unknown as RawDoc;
  writeCollection(COMPONENT_REVISIONS_KEY, all);
}

// --- Thermal network -------------------------------------------------------
// The graph lives in its own collection, never inside the shared project
// document — it is far too large and changes on a different cadence (00 §35.2).

export function loadNetwork(projectId: string): ThermalNetwork | null {
  const all = readCollection(NETWORKS_KEY);
  const stored = all[projectId];
  if (!stored || typeof stored !== 'object') return null;
  const network = stored as unknown as ThermalNetwork;
  // Tolerate networks written before a field existed.
  return {
    ...network,
    revision: hydrateRevision(
      network.revision,
      'network',
      (network.metadata?.updated_at as string | undefined) ??
        loadProject(projectId)?.meta.updated_at ??
        projectId,
    ),
    nodes: network.nodes ?? {},
    edges: network.edges ?? {},
    status: network.status ?? 'DRAFT',
    templates: network.templates ?? {},
    zones: network.zones ?? {},
    layout: {
      mode: network.layout?.mode ?? 'Auto',
      positions: network.layout?.positions ?? {},
    },
    flotherm_mappings: network.flotherm_mappings ?? {},
    solver_settings: network.solver_settings ?? { ...DEFAULT_SOLVER_SETTINGS },
  };
}

export function saveNetwork(projectId: string, network: ThermalNetwork): void {
  const all = readCollection(NETWORKS_KEY);
  // 05 §53 — unknown metadata written by other tools survives a save.
  const existing = (all[projectId] ?? {}) as Record<string, unknown>;
  all[projectId] = { ...existing, ...network } as unknown as RawDoc;
  writeCollection(NETWORKS_KEY, all);
}

// --- Scenario boundary conditions ------------------------------------------
// 06 §14.1 — keyed by project + network + scenario, and stored apart from the
// base topology so saving Screen 06 can never rewrite Screen 05's graph.

function boundaryKey(networkId: string, scenarioId: string): string {
  return `${networkId}::${scenarioId}`;
}

export function loadBoundarySets(projectId: string): ScenarioBoundaryConditionSet[] {
  const all = readCollection(BOUNDARY_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, ScenarioBoundaryConditionSet>;
  return Object.values(bucket).filter((set) => set && typeof set === 'object');
}

export function saveBoundarySet(
  projectId: string,
  set: ScenarioBoundaryConditionSet,
): void {
  const all = readCollection(BOUNDARY_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[boundaryKey(set.network_id, set.scenario_id)] = set;
  all[projectId] = bucket as RawDoc;
  writeCollection(BOUNDARY_KEY, all);
}

export function deleteBoundarySet(
  projectId: string,
  networkId: string,
  scenarioId: string,
): void {
  const all = readCollection(BOUNDARY_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[boundaryKey(networkId, scenarioId)];
  all[projectId] = bucket as RawDoc;
  writeCollection(BOUNDARY_KEY, all);
}

// --- Thermal solutions ------------------------------------------------------
// 07 §40, §41 — one analytical solution per scenario, stored apart from both the
// topology and the boundary set. A solver result is never written back into
// component master data or into the graph (07 §53).

export function loadSolutions(projectId: string): ThermalSolution[] {
  const all = readCollection(SOLUTIONS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, ThermalSolution>;
  return Object.values(bucket)
    .filter((solution) => solution && typeof solution === 'object' && solution.scenario_id)
    .map((solution) => ({
      ...solution,
      metadata: {
        ...solution.metadata,
        source_revision: hydrateSourceRevision(
          solution.metadata?.source_revision,
          `${solution.project_id}:${solution.network_id}:${solution.scenario_id}:${solution.solved_at}`,
        ),
      },
    }));
}

export interface NetworkReviewState {
  requires_review: boolean;
  reasons: string[];
  updated_at: string;
}

export function loadNetworkReviewState(projectId: string): NetworkReviewState {
  const all = readCollection(NETWORK_REVIEW_KEY);
  const stored = all[projectId] as Partial<NetworkReviewState> | undefined;
  return {
    requires_review: stored?.requires_review === true,
    reasons: Array.isArray(stored?.reasons)
      ? stored.reasons.filter((reason): reason is string => typeof reason === 'string')
      : [],
    updated_at: typeof stored?.updated_at === 'string' ? stored.updated_at : '',
  };
}

export function saveNetworkReviewState(
  projectId: string,
  review: Omit<NetworkReviewState, 'updated_at'>,
): void {
  const all = readCollection(NETWORK_REVIEW_KEY);
  all[projectId] = {
    ...review,
    updated_at: new Date().toISOString(),
  } as unknown as RawDoc;
  writeCollection(NETWORK_REVIEW_KEY, all);
}

export function saveSolution(projectId: string, solution: ThermalSolution): void {
  const all = readCollection(SOLUTIONS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[boundaryKey(solution.network_id, solution.scenario_id)] = solution;
  all[projectId] = bucket as RawDoc;
  writeCollection(SOLUTIONS_KEY, all);
}

export function deleteSolution(
  projectId: string,
  networkId: string,
  scenarioId: string,
): void {
  const all = readCollection(SOLUTIONS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[boundaryKey(networkId, scenarioId)];
  all[projectId] = bucket as RawDoc;
  writeCollection(SOLUTIONS_KEY, all);
}

// --- Bottleneck analyses and improvement proposals --------------------------
// 08 §23, §25 — one analysis per scenario, and proposals as a separate list.
// A proposal is a record of an assumption: it never carries an applied Rth, and
// nothing here writes back into the network or the component records.

export function loadAnalyses(projectId: string): BottleneckAnalysis[] {
  const all = readCollection(ANALYSES_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, BottleneckAnalysis>;
  return Object.values(bucket).filter(
    (analysis) => analysis && typeof analysis === 'object' && analysis.scenario_id,
  );
}

export function saveAnalysis(projectId: string, analysis: BottleneckAnalysis): void {
  const all = readCollection(ANALYSES_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[boundaryKey(analysis.network_id, analysis.scenario_id)] = analysis;
  all[projectId] = bucket as RawDoc;
  writeCollection(ANALYSES_KEY, all);
}

export function deleteAnalysis(projectId: string, networkId: string, scenarioId: string): void {
  const all = readCollection(ANALYSES_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[boundaryKey(networkId, scenarioId)];
  all[projectId] = bucket as RawDoc;
  writeCollection(ANALYSES_KEY, all);
}

// --- Temperature distribution results -------------------------------------

export function loadDistributions(projectId: string): TemperatureDistributionResult[] {
  const all = readCollection(DISTRIBUTIONS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, TemperatureDistributionResult>;
  return Object.values(bucket).filter(
    (entry) => entry && typeof entry === 'object' && entry.scenario_id && Array.isArray(entry.rows),
  );
}

export function saveDistribution(
  projectId: string,
  distribution: TemperatureDistributionResult,
): void {
  const all = readCollection(DISTRIBUTIONS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[boundaryKey(distribution.network_id, distribution.scenario_id)] = distribution;
  all[projectId] = bucket as RawDoc;
  writeCollection(DISTRIBUTIONS_KEY, all);
}

export function deleteDistribution(
  projectId: string,
  networkId: string,
  scenarioId: string,
): void {
  const all = readCollection(DISTRIBUTIONS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[boundaryKey(networkId, scenarioId)];
  all[projectId] = bucket as RawDoc;
  writeCollection(DISTRIBUTIONS_KEY, all);
}

export function loadProposals(projectId: string): BottleneckProposal[] {
  const all = readCollection(PROPOSALS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, BottleneckProposal>;
  return Object.values(bucket).filter((entry) => entry && typeof entry === 'object' && entry.edge_id);
}

export function saveProposal(projectId: string, proposal: BottleneckProposal): void {
  const all = readCollection(PROPOSALS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[proposal.id] = proposal;
  all[projectId] = bucket as RawDoc;
  writeCollection(PROPOSALS_KEY, all);
}

export function deleteProposal(projectId: string, proposalId: string): void {
  const all = readCollection(PROPOSALS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[proposalId];
  all[projectId] = bucket as RawDoc;
  writeCollection(PROPOSALS_KEY, all);
}

// --- Results Overview snapshots ---------------------------------------------
// 10 §18, §19 — one frozen summary per scenario, kept apart from the solution it
// froze. A snapshot is metadata for Screen 11; nothing here writes an overview
// KPI back into component master data (10 §30).

export function loadSnapshots(projectId: string): ResultsOverviewSnapshot[] {
  const all = readCollection(SNAPSHOTS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, ResultsOverviewSnapshot>;
  return Object.values(bucket).filter(
    (snapshot) => snapshot && typeof snapshot === 'object' && snapshot.scenario_id,
  );
}

export function saveSnapshot(projectId: string, snapshot: ResultsOverviewSnapshot): void {
  const all = readCollection(SNAPSHOTS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[snapshot.scenario_id] = snapshot;
  all[projectId] = bucket as RawDoc;
  writeCollection(SNAPSHOTS_KEY, all);
}

export function deleteSnapshot(projectId: string, scenarioId: string): void {
  const all = readCollection(SNAPSHOTS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[scenarioId];
  all[projectId] = bucket as RawDoc;
  writeCollection(SNAPSHOTS_KEY, all);
}

// --- Report configuration, templates and export payloads --------------------
// 11 §33, §46 — layout only. Thermal master data is never stored in the report
// collections: a config references a snapshot by id, and a template carries no
// project result at all (11 §33, AC-11-33).

export function loadReportConfigs(projectId: string): ThermalReportConfig[] {
  const all = readCollection(REPORT_CONFIGS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, ThermalReportConfig>;
  return Object.values(bucket).filter(
    (config) => config && typeof config === 'object' && config.scenario_id,
  );
}

export function saveReportConfig(projectId: string, config: ThermalReportConfig): void {
  const all = readCollection(REPORT_CONFIGS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[config.scenario_id] = config;
  all[projectId] = bucket as RawDoc;
  writeCollection(REPORT_CONFIGS_KEY, all);
}

export function deleteReportConfig(projectId: string, scenarioId: string): void {
  const all = readCollection(REPORT_CONFIGS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  delete bucket[scenarioId];
  all[projectId] = bucket as RawDoc;
  writeCollection(REPORT_CONFIGS_KEY, all);
}

/** Templates are layout only, so they are shared across projects on purpose. */
export function loadReportTemplates(): ReportTemplate[] {
  const all = readCollection(REPORT_TEMPLATES_KEY);
  const bucket = (all.shared ?? {}) as Record<string, ReportTemplate>;
  return Object.values(bucket).filter((entry) => entry && typeof entry === 'object' && entry.name);
}

export function saveReportTemplate(template: ReportTemplate): void {
  const all = readCollection(REPORT_TEMPLATES_KEY);
  const bucket = (all.shared ?? {}) as Record<string, unknown>;
  bucket[template.id] = template;
  all.shared = bucket as RawDoc;
  writeCollection(REPORT_TEMPLATES_KEY, all);
}

export function loadExportPayloads(projectId: string): ReportExportPayload[] {
  const all = readCollection(REPORT_PAYLOADS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, ReportExportPayload>;
  return Object.values(bucket).filter(
    (entry) => entry && typeof entry === 'object' && entry.scenario_id,
  );
}

export function saveExportPayload(projectId: string, payload: ReportExportPayload): void {
  const all = readCollection(REPORT_PAYLOADS_KEY);
  const bucket = (all[projectId] ?? {}) as Record<string, unknown>;
  bucket[payload.scenario_id] = payload;
  all[projectId] = bucket as RawDoc;
  writeCollection(REPORT_PAYLOADS_KEY, all);
}

/**
 * 12 §36 — the only thing an export is allowed to write.
 *
 * It lives under its own key rather than inside the project record, so writing
 * it cannot overwrite an unknown sibling field, and it holds metadata only:
 * never a file, never a byte of one.
 */
export interface ExportStamp {
  lastExportAt: string;
  lastExportPackageId: string;
  lastExportArtifactTypes: string[];
}

export function loadExportStamp(projectId: string): ExportStamp | null {
  const all = readCollection(EXPORT_STAMPS_KEY);
  const entry = all[projectId] as unknown as ExportStamp | undefined;
  return entry && typeof entry === 'object' && entry.lastExportAt ? entry : null;
}

export function saveExportStamp(projectId: string, stamp: ExportStamp): void {
  const all = readCollection(EXPORT_STAMPS_KEY);
  all[projectId] = stamp as unknown as RawDoc;
  writeCollection(EXPORT_STAMPS_KEY, all);
}
