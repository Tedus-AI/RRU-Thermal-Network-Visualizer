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
import { SCHEMA_VERSION, defaultProjectContext } from '@/domain/project';
import type { Component } from '@/domain/component';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork } from '@/thermal/types';
import { migrateComponents } from './componentMigration';

const PROJECTS_KEY = 'tnv.projects';
const SCENARIOS_KEY = 'tnv.scenarios';
const COMPONENTS_KEY = 'tnv.components';
const NETWORKS_KEY = 'tnv.thermal_networks';

/** Keys on a project document that belong to this tool. Everything else is foreign. */
const OWNED_PROJECT_KEYS = [
  'project_id',
  'project_name',
  'project_context',
  'active_scenario_id',
  'status',
  'meta',
] as const;

type RawDoc = Record<string, unknown>;

function readCollection(key: string): Record<string, RawDoc> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RawDoc>) : {};
  } catch {
    // A corrupt blob must not take the app down — 00 §35.2 bad-file protection.
    return {};
  }
}

function writeCollection(key: string, value: Record<string, RawDoc>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
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
    project_context: { ...defaultProjectContext(), ...context },
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
  return Object.values(bucket);
}

export function saveScenarios(projectId: string, scenarios: Scenario[]): void {
  const all = readCollection(SCENARIOS_KEY);
  const bucket: Record<string, Scenario> = {};
  for (const scenario of scenarios) bucket[scenario.id] = scenario;
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
