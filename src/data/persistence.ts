/**
 * Persistence adapter.
 *
 * V1 uses localStorage as its synchronous working cache. The selected folder's
 * project JSON files are the durable source of truth and are hydrated into this
 * adapter at startup. Screens never talk to this module directly.
 *
 * Shared-DB safety rules it must honour (01 §35, 00 §35.2, AC-09):
 *   - merge semantics, never whole-document replace;
 *   - unknown sibling fields written by other tools are preserved verbatim;
 *   - this tool only owns `project_name`, `project_context`, `active_scenario_id`,
 *     `status` and `meta`.
 *
 * Storage layout
 * --------------
 * The project index (`tnv.projects`) and the shared report templates are one
 * document each. Everything that belongs to ONE project lives under its own key,
 * `<collection>::<projectId>`. It used to be one document per collection for
 * every project at once, so each keystroke re-read, re-parsed, re-serialised
 * and re-compressed every project in the folder, and a folder of twenty
 * projects paid for all twenty on every save. Data written in the older layout
 * is still read, and is split into per-project keys the first time that
 * collection is written.
 *
 * When the browser refuses a write
 * --------------------------------
 * localStorage has a small per-origin quota, shared on GitHub Pages with every
 * other app on the origin. A refused `setItem` used to throw out of the save,
 * leave the edit only in the screen's memory, and — because the folder mirror
 * is triggered by a successful write — keep it out of the project file too,
 * while the save light stayed on "Writing…" forever. Now the value is held in
 * an in-memory overlay that every read consults first, the write listeners
 * still fire so the folder (the durable copy) receives it, and the refusal is
 * published for the UI to show (`onPersistenceWriteFailure`).
 */

import type { Project, ProjectContext, Scenario } from '@/domain/project';
import { SCHEMA_VERSION, normalizeProjectContext } from '@/domain/project';
import { normalizeMaterials } from '@/domain/materials';
import {
  hydrateComponentRevisionSet,
  hydrateRevision,
  hydrateSourceRevision,
  type ComponentRevisionSet,
} from '@/domain/revision';
import type { Component } from '@/domain/component';
import {
  normalizeNodeType,
  normalizeSolverSettings,
  type ThermalNetwork,
  type ThermalNode,
} from '@/thermal/types';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import { normalizeBoundarySet } from '@/thermal/boundary/boundaryMigration';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { BottleneckAnalysis, ImprovementStudy } from '@/thermal/analysis/analysisTypes';
import { isImprovementStudy } from '@/thermal/analysis/analysisTypes';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type {
  ReportExportPayload,
  ReportTemplate,
  ThermalReportConfig,
} from '@/report/reportTypes';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { UNSYNCED_SP_STORAGE_KEY, UNSYNCED_STORAGE_KEY, clearOwnedStorage } from './buildStamp';
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
/**
 * Written by builds that had a Temperature Distribution screen; nothing writes it now. Kept so that
 * deleting a project still clears what those builds left behind.
 */
const DISTRIBUTIONS_KEY = 'tnv.temperature_distributions';
const PROPOSALS_KEY = 'tnv.improvement_proposals';
const SNAPSHOTS_KEY = 'tnv.results_snapshots';
const REPORT_CONFIGS_KEY = 'tnv.report_configs';
const REPORT_TEMPLATES_KEY = 'tnv.report_templates';
const REPORT_PAYLOADS_KEY = 'tnv.report_export_payloads';
const EXPORT_STAMPS_KEY = 'tnv.export_stamps';
const EXPORT_PREFS_KEY = 'tnv.export_prefs';

/**
 * localStorage is only the synchronous working cache; the selected folder is
 * the durable source of truth. GitHub Pages also shares one localStorage quota
 * across every app on the same origin, so a perfectly ordinary project can hit
 * the browser's small string limit even though its .tnv.json file is healthy.
 *
 * Keep the small project/revision indexes plain JSON for compatibility with
 * lightweight boot and migration checks. Heavier collections are stored as
 * LZ-compressed UTF-16 strings and transparently decoded here.
 */
export const PERSISTENCE_COMPRESSION_PREFIX = 'tnv:lz16:';
const PLAIN_JSON_KEYS = new Set([PROJECTS_KEY, COMPONENT_REVISIONS_KEY]);

/** Separates a collection from the project its per-project key belongs to. */
const BUCKET_SEPARATOR = '::';

/** The localStorage key one project's slice of a collection lives under. */
export function projectStorageKey(collectionKey: string, projectId: string): string {
  return `${collectionKey}${BUCKET_SEPARATOR}${projectId}`;
}

/** Keys on a project document that belong to this tool. Everything else is foreign. */
const OWNED_PROJECT_KEYS = [
  'project_id',
  'project_name',
  'revision',
  'project_context',
  'materials',
  'active_scenario_id',
  'status',
  'meta',
] as const;

type RawDoc = Record<string, unknown>;

// --- own-property access ---------------------------------------------------
// Project, scenario and proposal ids are user text and become object keys
// here. Plain bracket access treats `__proto__` as the prototype and finds
// `constructor` / `toString` on every object, so `projectIdExists('constructor')`
// was true and a project named `__proto__` could never be stored. Every
// id-keyed read and write goes through these instead.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function own<T = unknown>(record: Record<string, unknown>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? (record[key] as T) : undefined;
}

function setOwn(record: Record<string, unknown>, key: string, value: unknown): void {
  // `defineProperty` never invokes the `__proto__` setter, so the id is stored
  // as an ordinary property that JSON round-trips.
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// --- corruption ------------------------------------------------------------

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

export function getPersistenceRecoveryIssues(): PersistenceRecoveryIssue[] {
  return [...recoveryIssues.values()].map((issue) => ({ ...issue }));
}

// --- write failures and the in-memory overlay ------------------------------

export interface PersistenceWriteFailure {
  /** Storage key the browser refused. */
  key: string;
  message: string;
  /** True for the browser's quota error, which is the usual cause. */
  quota: boolean;
  at: string;
}

/** Values the browser refused to store, held here so nothing is lost. */
const overlay = new Map<string, string>();
let writeFailure: PersistenceWriteFailure | null = null;
const failureListeners = new Set<(failure: PersistenceWriteFailure | null) => void>();

/** The current refusal, or null while every value is in localStorage. */
export function getPersistenceWriteFailure(): PersistenceWriteFailure | null {
  return writeFailure ? { ...writeFailure } : null;
}

/** Called whenever a refusal starts or clears. */
export function onPersistenceWriteFailure(
  listener: (failure: PersistenceWriteFailure | null) => void,
): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

function publishFailure(next: PersistenceWriteFailure | null): void {
  writeFailure = next;
  for (const listener of failureListeners) {
    try {
      listener(next ? { ...next } : null);
    } catch {
      // A broken listener must not turn a held value into a lost one.
    }
  }
}

function isQuotaError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const { name } = error as { name?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage != null;
  } catch {
    return false;
  }
}

/** Retries the held values, oldest first, until the browser refuses again. */
function flushOverlay(): void {
  if (!storageAvailable()) return;
  for (const [key, text] of [...overlay]) {
    try {
      localStorage.setItem(key, text);
      overlay.delete(key);
    } catch {
      return;
    }
  }
  if (overlay.size === 0 && writeFailure) publishFailure(null);
}

// --- transactions ----------------------------------------------------------

interface Transaction {
  /** What each touched key held before, so a failure can put it back. */
  originals: Map<string, { stored: string | null; held: string | undefined }>;
  /** Write notifications, sent once on commit. */
  notifications: Array<{ key: string; projectId?: string }>;
}

let transaction: Transaction | null = null;

function recordOriginal(storageKey: string): void {
  if (!transaction || transaction.originals.has(storageKey)) return;
  transaction.originals.set(storageKey, {
    stored: storageAvailable() ? localStorage.getItem(storageKey) : null,
    held: overlay.get(storageKey),
  });
}

/**
 * Runs `body` as one unit: either every write it makes lands, or none does.
 *
 * Importing a project is a dozen separate writes. One of them failing used to
 * leave a half-written project behind — and the folder mirror, triggered by
 * the writes that did land, would then copy that half over a good file. Inside
 * a transaction the write listeners are held until the end, and a throw puts
 * every touched key back exactly as it was before rethrowing. Nested calls
 * join the outer transaction.
 */
export function withPersistenceTransaction<T>(body: () => T): T {
  if (transaction) return body();
  const current: Transaction = { originals: new Map(), notifications: [] };
  transaction = current;
  try {
    const result = body();
    transaction = null;
    const seen = new Set<string>();
    for (const entry of current.notifications) {
      const id = `${entry.key}\u0000${entry.projectId ?? ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      notify(entry.key, entry.projectId);
    }
    return result;
  } catch (error) {
    transaction = null;
    for (const [key, original] of current.originals) {
      if (original.held !== undefined) overlay.set(key, original.held);
      else overlay.delete(key);
      if (!storageAvailable()) continue;
      try {
        if (original.stored == null) localStorage.removeItem(key);
        else localStorage.setItem(key, original.stored);
      } catch {
        // Putting back a value the browser held a moment ago can only fail if
        // something else filled the quota since; keep it in memory instead.
        if (original.stored != null) overlay.set(key, original.stored);
      }
    }
    throw error;
  }
}

// --- raw access ------------------------------------------------------------

function rawGet(storageKey: string): string | null {
  const held = overlay.get(storageKey);
  if (held !== undefined) return held;
  if (!storageAvailable()) return null;
  return localStorage.getItem(storageKey);
}

function rawSet(storageKey: string, text: string): void {
  recordOriginal(storageKey);
  if (!storageAvailable()) {
    overlay.set(storageKey, text);
    return;
  }
  try {
    localStorage.setItem(storageKey, text);
    overlay.delete(storageKey);
    if (overlay.size > 0) flushOverlay();
    else if (writeFailure) publishFailure(null);
  } catch (error) {
    overlay.set(storageKey, text);
    publishFailure({
      key: storageKey,
      message: error instanceof Error ? error.message : String(error),
      quota: isQuotaError(error),
      at: new Date().toISOString(),
    });
  }
}

function rawRemove(storageKey: string): void {
  recordOriginal(storageKey);
  overlay.delete(storageKey);
  if (storageAvailable()) localStorage.removeItem(storageKey);
  if (overlay.size === 0 && writeFailure) publishFailure(null);
}

function decode(storageKey: string, raw: string): unknown {
  try {
    const encoded = raw.startsWith(PERSISTENCE_COMPRESSION_PREFIX)
      ? raw.slice(PERSISTENCE_COMPRESSION_PREFIX.length)
      : null;
    const json = encoded == null ? raw : decompressFromUTF16(encoded);
    if (json == null || json === '') {
      throw new Error('compressed collection could not be decoded');
    }
    const parsed: unknown = JSON.parse(json);
    recoveryIssues.delete(storageKey);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    recoveryIssues.set(storageKey, { key: storageKey, raw, message });
    throw new PersistenceCorruptionError(storageKey, message);
  }
}

function encode(value: unknown, plain: boolean): string {
  const json = JSON.stringify(value);
  if (plain) return json;
  const compressed = `${PERSISTENCE_COMPRESSION_PREFIX}${compressToUTF16(json)}`;
  // Tiny documents can grow after adding the prefix. Keep those, and the
  // project index, as readable JSON; compression starts automatically once it
  // actually saves quota.
  return compressed.length < json.length ? compressed : json;
}

/**
 * Refuses to overwrite a value that was read as corrupt.
 *
 * Every save reads before it writes, so a corrupt value has always been met —
 * and recorded — by the time a write to it is attempted. The raw blob is kept
 * until someone explicitly discards it, so the next save cannot quietly replace
 * user data nobody has looked at.
 */
function guardCorrupt(storageKey: string): void {
  const issue = recoveryIssues.get(storageKey);
  if (issue) throw new PersistenceCorruptionError(storageKey, issue.message);
}

/** Explicit recovery only; callers may export the raw issue before discarding. */
export function discardCorruptCollection(key: string): void {
  overlay.delete(key);
  if (storageAvailable()) localStorage.removeItem(key);
  recoveryIssues.delete(key);
}

// --- write listeners -------------------------------------------------------

/**
 * Write listeners.
 *
 * Every persisted change in the app passes through here, which makes it the
 * one place a mirror can hook without each store having to remember to
 * announce itself. Used by the local-folder sync. `projectId` names the project
 * whose data changed, when the write belongs to one.
 */
type StorageWriteListener = (key: string, projectId?: string) => void;
const writeListeners = new Set<StorageWriteListener>();

export function onStorageWrite(listener: StorageWriteListener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function notify(key: string, projectId?: string): void {
  if (transaction) {
    transaction.notifications.push({ key, projectId });
    return;
  }
  for (const listener of writeListeners) {
    try {
      listener(key, projectId);
    } catch {
      // A broken mirror must never stop the write that already succeeded.
    }
  }
}

// --- documents -------------------------------------------------------------

/** A whole-document collection: the project index, the shared templates. */
function readCollection(key: string): Record<string, RawDoc> {
  const raw = rawGet(key);
  if (!raw) {
    recoveryIssues.delete(key);
    return {};
  }
  const parsed = decode(key, raw);
  if (!isPlainObject(parsed)) {
    const message = 'expected a JSON object at the collection root';
    recoveryIssues.set(key, { key, raw, message });
    throw new PersistenceCorruptionError(key, message);
  }
  return parsed as Record<string, RawDoc>;
}

function writeCollection(key: string, value: Record<string, unknown>, projectId?: string): void {
  guardCorrupt(key);
  rawSet(key, encode(value, PLAIN_JSON_KEYS.has(key)));
  notify(key, projectId);
}

/** The pre-bucket layout of a per-project collection, or null if absent. */
function readLegacyCollection(key: string): Record<string, unknown> | null {
  const raw = rawGet(key);
  if (!raw) return null;
  const parsed = decode(key, raw);
  if (!isPlainObject(parsed)) {
    const message = 'expected a JSON object at the collection root';
    recoveryIssues.set(key, { key, raw, message });
    throw new PersistenceCorruptionError(key, message);
  }
  return parsed;
}

/**
 * Splits an old whole-collection document into per-project keys.
 *
 * A key that already exists in the new layout was written after the old one
 * and wins. Runs only on a write, so reading never changes storage.
 */
function migrateLegacyCollection(key: string): void {
  const legacy = readLegacyCollection(key);
  if (!legacy) return;
  for (const [projectId, value] of Object.entries(legacy)) {
    const storageKey = projectStorageKey(key, projectId);
    if (rawGet(storageKey) != null) continue;
    rawSet(storageKey, encode(value, PLAIN_JSON_KEYS.has(key)));
  }
  rawRemove(key);
}

/** One project's slice of a collection, or undefined when it has none. */
function readBucket<T = unknown>(key: string, projectId: string): T | undefined {
  const storageKey = projectStorageKey(key, projectId);
  const raw = rawGet(storageKey);
  if (raw) return decode(storageKey, raw) as T;
  recoveryIssues.delete(storageKey);
  const legacy = readLegacyCollection(key);
  return legacy ? own<T>(legacy, projectId) : undefined;
}

/** Writes one project's slice; `undefined` removes it. */
function writeBucket(key: string, projectId: string, value: unknown): void {
  migrateLegacyCollection(key);
  const storageKey = projectStorageKey(key, projectId);
  guardCorrupt(storageKey);
  if (value === undefined) rawRemove(storageKey);
  else rawSet(storageKey, encode(value, PLAIN_JSON_KEYS.has(key)));
  notify(key, projectId);
}

/** A project's slice that is itself keyed by id — scenarios, solutions, … */
function readMap(key: string, projectId: string): Record<string, unknown> {
  const value = readBucket(key, projectId);
  return isPlainObject(value) ? { ...value } : {};
}

// --- working cache ---------------------------------------------------------

/**
 * Empties the working cache: every `tnv.*` key, and whatever the overlay was
 * holding for them. Hydration and unbinding a folder start from here.
 */
export function clearWorkingCache(options: { keepSyncState?: boolean } = {}): string[] {
  overlay.clear();
  recoveryIssues.clear();
  if (writeFailure) publishFailure(null);
  if (!storageAvailable()) return [];
  // A refill from one target must not forget what the OTHER target is still
  // owed: with SharePoint offline, its pending markers are the only record of
  // the edits that still have to go up.
  const kept = options.keepSyncState
    ? SYNC_BOOKKEEPING_KEYS.map((key) => [key, rawGet(key)] as const)
    : [];
  const cleared = clearOwnedStorage(localStorage);
  for (const [key, value] of kept) if (value != null) rawSet(key, value);
  return cleared;
}

// --- projects --------------------------------------------------------------

function splitForeignFields(raw: RawDoc): Record<string, unknown> {
  const foreign: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(OWNED_PROJECT_KEYS as readonly string[]).includes(key)) setOwn(foreign, key, value);
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
    // A file written before this section existed still opens: every field
    // falls back to the shipped default rather than to null.
    materials: normalizeMaterials(raw.materials),
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
  return Object.values(readCollection(PROJECTS_KEY))
    .filter(isPlainObject)
    .map(hydrateProject);
}

export function loadProject(projectId: string): Project | null {
  const raw = own<RawDoc>(readCollection(PROJECTS_KEY), projectId);
  return isPlainObject(raw) ? hydrateProject(raw) : null;
}

/**
 * Merge-save. Reads the document that is currently on disk, overwrites only the
 * keys this tool owns, and re-attaches every other key exactly as found.
 */
export function saveProject(project: Project): Project {
  const collection = readCollection(PROJECTS_KEY);
  const existing = own<RawDoc>(collection, project.project_id) ?? {};
  const preserved = splitForeignFields(existing);

  const merged: RawDoc = {};
  // Foreign fields first so an owned key can never be shadowed by a stale one.
  for (const [key, value] of Object.entries({ ...preserved, ...(project.foreign_fields ?? {}) })) {
    setOwn(merged, key, value);
  }
  Object.assign(merged, {
    project_id: project.project_id,
    project_name: project.project_name,
    revision: project.revision,
    project_context: project.project_context,
    materials: project.materials,
    active_scenario_id: project.active_scenario_id,
    status: project.status,
    meta: { ...project.meta, updated_at: new Date().toISOString() },
  });

  setOwn(collection, project.project_id, merged);
  writeCollection(PROJECTS_KEY, collection, project.project_id);
  return hydrateProject(merged);
}

export function deleteProject(projectId: string): void {
  const collection = readCollection(PROJECTS_KEY);
  if (Object.hasOwn(collection, projectId)) delete collection[projectId];
  writeCollection(PROJECTS_KEY, collection, projectId);
}

/**
 * Every collection that stores one slice per project.
 *
 * Each of these is keyed `<collection>::<projectId>`, which is what makes a
 * purge uniform: the project's keys leave and no other project's do.
 */
const PER_PROJECT_KEYS = [
  SCENARIOS_KEY,
  COMPONENTS_KEY,
  COMPONENT_REVISIONS_KEY,
  NETWORKS_KEY,
  NETWORK_REVIEW_KEY,
  BOUNDARY_KEY,
  SOLUTIONS_KEY,
  ANALYSES_KEY,
  DISTRIBUTIONS_KEY,
  PROPOSALS_KEY,
  SNAPSHOTS_KEY,
  REPORT_CONFIGS_KEY,
  REPORT_PAYLOADS_KEY,
  EXPORT_STAMPS_KEY,
  // Export preferences are per project too; they were missing here, so a
  // deleted project's were left behind.
  EXPORT_PREFS_KEY,
] as const;

/**
 * Removes everything stored under a project EXCEPT its index document.
 *
 * What "overwrite" has to mean for an import: the file replaces the project's
 * data, rather than being merged into whatever an older copy left behind — a
 * solution for a scenario the file no longer has would otherwise survive and
 * be offered against a network it was never solved on. The index document is
 * kept, because it carries foreign fields other tools wrote.
 */
export function clearProjectData(projectId: string): void {
  withPersistenceTransaction(() => {
    for (const key of PER_PROJECT_KEYS) {
      if (readBucket(key, projectId) === undefined) continue;
      writeBucket(key, projectId, undefined);
    }
  });
}

/**
 * Deletes a project AND everything stored under it.
 *
 * `deleteProject` alone removes the project document and leaves its components,
 * network, boundary sets, solutions, analyses and report payloads behind. They
 * are keyed by a project id nothing can reach any more, so they are pure
 * ballast: invisible, un-openable, and counting against the browser's storage
 * quota until it fills. A delete the engineer asked for has to mean all of it.
 *
 * Report TEMPLATES are deliberately left alone — they are not per-project.
 */
export function purgeProject(projectId: string): void {
  withPersistenceTransaction(() => {
    clearProjectData(projectId);
    deleteProject(projectId);
  });
}

export function projectIdExists(projectId: string): boolean {
  return Object.hasOwn(readCollection(PROJECTS_KEY), projectId);
}

// --- Scenarios -------------------------------------------------------------
// Stored in their own collection so large per-project thermal data never rides
// inside the shared project document (00 §35.2).

export function loadScenarios(projectId: string): Scenario[] {
  const bucket = readMap(SCENARIOS_KEY, projectId) as Record<string, Scenario>;
  const projectUpdatedAt = loadProject(projectId)?.meta.updated_at ?? projectId;
  return Object.values(bucket)
    .filter(isPlainObject)
    .map((scenario) => ({
      ...scenario,
      revision: hydrateRevision(
        scenario.revision,
        'scenario',
        `${projectUpdatedAt}:${scenario.id}`,
      ),
    }));
}

export function saveScenarios(projectId: string, scenarios: Scenario[]): void {
  const bucket: Record<string, Scenario> = {};
  for (const scenario of scenarios) {
    setOwn(bucket, scenario.id, {
      ...scenario,
      revision: hydrateRevision(scenario.revision, 'scenario', `${projectId}:${scenario.id}`),
    });
  }
  writeBucket(SCENARIOS_KEY, projectId, bucket);
}

// --- Components ------------------------------------------------------------
// Screen 02 owns the import flow; this is the storage contract it will write to.

export function loadComponents(projectId: string): Component[] {
  // Records written by earlier versions are upgraded here, so no screen ever
  // sees a stale component shape.
  return migrateComponents(readBucket(COMPONENTS_KEY, projectId));
}

export function saveComponents(projectId: string, components: Component[]): void {
  writeBucket(COMPONENTS_KEY, projectId, components);
}

/**
 * The component collection remains the legacy-compatible array shape. Its three
 * store-level clocks therefore live in one additive, namespaced collection.
 */
export function loadComponentRevisions(
  projectId: string,
  components: Component[] = loadComponents(projectId),
): ComponentRevisionSet {
  const stored = readBucket<Partial<ComponentRevisionSet>>(COMPONENT_REVISIONS_KEY, projectId);
  const latestComponentTimestamp = components
    .flatMap((component) => [
      component.provenance.last_modified_at,
      component.provenance.imported_at,
    ])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const fallback = latestComponentTimestamp ?? loadProject(projectId)?.meta.updated_at ?? projectId;
  return hydrateComponentRevisionSet(isPlainObject(stored) ? stored : undefined, fallback);
}

export function saveComponentRevisions(
  projectId: string,
  revisions: ComponentRevisionSet,
): void {
  writeBucket(COMPONENT_REVISIONS_KEY, projectId, revisions);
}

// --- Thermal network -------------------------------------------------------
// The graph lives in its own collection, never inside the shared project
// document — it is far too large and changes on a different cadence (00 §35.2).

/**
 * Repairs a node whose type was removed from `NODE_TYPES`.
 *
 * The Node Inspector offered the whole list, so a stored project can name a
 * type that no longer exists — `main_base`, `fin_root`, `external_air`,
 * `internal_air`, `heat_source`. TypeScript cannot catch that: the file was
 * written by an older build and is only checked at compile time. Left alone the
 * node would drop out of every `switch` and `Set.has` that decides whether it
 * is structural, a boundary, or a heat sink, and it would do so silently.
 * `normalizeNodeType` maps each onto the survivor that always meant the same
 * thing. Nothing else about the node is touched.
 */
function migrateNodeTypes(nodes: Record<string, ThermalNode>): Record<string, ThermalNode> {
  let changed = false;
  const migrated: Record<string, ThermalNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    const type = normalizeNodeType(node.type);
    if (type !== node.type) changed = true;
    setOwn(migrated, id, type === node.type ? node : { ...node, type });
  }
  return changed ? migrated : nodes;
}

export function loadNetwork(projectId: string): ThermalNetwork | null {
  const stored = readBucket(NETWORKS_KEY, projectId);
  if (!isPlainObject(stored)) return null;
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
    nodes: migrateNodeTypes(network.nodes ?? {}),
    edges: network.edges ?? {},
    status: network.status ?? 'DRAFT',
    templates: network.templates ?? {},
    zones: network.zones ?? {},
    layout: {
      mode: network.layout?.mode ?? 'Auto',
      positions: network.layout?.positions ?? {},
      // Absent in files written before the flag existed, and false is right for
      // them: their positions came from the automatic layout.
      hand_placed: network.layout?.hand_placed ?? false,
    },
    flotherm_mappings: network.flotherm_mappings ?? {},
    solver_settings: normalizeSolverSettings(network.solver_settings),
  };
}

export function saveNetwork(projectId: string, network: ThermalNetwork): void {
  // 05 §53 — unknown metadata written by other tools survives a save.
  const existing = readBucket(NETWORKS_KEY, projectId);
  writeBucket(NETWORKS_KEY, projectId, {
    ...(isPlainObject(existing) ? existing : {}),
    ...network,
  });
}

// --- Scenario boundary conditions ------------------------------------------
// 06 §14.1 — keyed by project + network + scenario, and stored apart from the
// base topology so saving Screen 06 can never rewrite Screen 05's graph.

function boundaryKey(networkId: string, scenarioId: string): string {
  return `${networkId}::${scenarioId}`;
}

export function loadBoundarySets(projectId: string): ScenarioBoundaryConditionSet[] {
  const bucket = readMap(BOUNDARY_KEY, projectId) as Record<string, ScenarioBoundaryConditionSet>;
  return Object.values(bucket)
    .filter((set) => set && typeof set === 'object')
    .map(normalizeBoundarySet);
}

export function saveBoundarySet(
  projectId: string,
  set: ScenarioBoundaryConditionSet,
): void {
  const bucket = readMap(BOUNDARY_KEY, projectId);
  // Normalized on write as well as on read: reading alone would clean what the
  // app sees while leaving the retired keys in storage for the next reader.
  setOwn(bucket, boundaryKey(set.network_id, set.scenario_id), normalizeBoundarySet(set));
  writeBucket(BOUNDARY_KEY, projectId, bucket);
}

export function deleteBoundarySet(
  projectId: string,
  networkId: string,
  scenarioId: string,
): void {
  const bucket = readMap(BOUNDARY_KEY, projectId);
  delete bucket[boundaryKey(networkId, scenarioId)];
  writeBucket(BOUNDARY_KEY, projectId, bucket);
}

// --- Thermal solutions ------------------------------------------------------
// 07 §40, §41 — one analytical solution per scenario, stored apart from both the
// topology and the boundary set. A solver result is never written back into
// component master data or into the graph (07 §53).

export function loadSolutions(projectId: string): ThermalSolution[] {
  const bucket = readMap(SOLUTIONS_KEY, projectId) as Record<string, ThermalSolution>;
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
  const stored = readBucket<Partial<NetworkReviewState>>(NETWORK_REVIEW_KEY, projectId);
  const review = isPlainObject(stored) ? stored : undefined;
  return {
    requires_review: review?.requires_review === true,
    reasons: Array.isArray(review?.reasons)
      ? review.reasons.filter((reason): reason is string => typeof reason === 'string')
      : [],
    updated_at: typeof review?.updated_at === 'string' ? review.updated_at : '',
  };
}

export function saveNetworkReviewState(
  projectId: string,
  review: Omit<NetworkReviewState, 'updated_at'>,
): void {
  writeBucket(NETWORK_REVIEW_KEY, projectId, {
    ...review,
    updated_at: new Date().toISOString(),
  });
}

export function saveSolution(projectId: string, solution: ThermalSolution): void {
  const bucket = readMap(SOLUTIONS_KEY, projectId);
  setOwn(bucket, boundaryKey(solution.network_id, solution.scenario_id), solution);
  writeBucket(SOLUTIONS_KEY, projectId, bucket);
}

export function deleteSolution(
  projectId: string,
  networkId: string,
  scenarioId: string,
): void {
  const bucket = readMap(SOLUTIONS_KEY, projectId);
  delete bucket[boundaryKey(networkId, scenarioId)];
  writeBucket(SOLUTIONS_KEY, projectId, bucket);
}

// --- Bottleneck analyses and improvement proposals --------------------------
// 08 §23, §25 — one analysis per scenario, and proposals as a separate list.
// A proposal is a record of an assumption: it never carries an applied Rth, and
// nothing here writes back into the network or the component records.

export function loadAnalyses(projectId: string): BottleneckAnalysis[] {
  const bucket = readMap(ANALYSES_KEY, projectId) as Record<string, BottleneckAnalysis>;
  return Object.values(bucket).filter(
    (analysis) => analysis && typeof analysis === 'object' && analysis.scenario_id,
  );
}

export function saveAnalysis(projectId: string, analysis: BottleneckAnalysis): void {
  const bucket = readMap(ANALYSES_KEY, projectId);
  setOwn(bucket, boundaryKey(analysis.network_id, analysis.scenario_id), analysis);
  writeBucket(ANALYSES_KEY, projectId, bucket);
}

export function deleteAnalysis(projectId: string, networkId: string, scenarioId: string): void {
  const bucket = readMap(ANALYSES_KEY, projectId);
  delete bucket[boundaryKey(networkId, scenarioId)];
  writeBucket(ANALYSES_KEY, projectId, bucket);
}


export function loadProposals(projectId: string): ImprovementStudy[] {
  const bucket = readMap(PROPOSALS_KEY, projectId) as Record<string, ImprovementStudy>;
  // A record saved by the ranking screen was a single edge with no `segments`;
  // this build cannot render one, so it is left in storage rather than shown
  // half-empty.
  return Object.values(bucket).filter(isImprovementStudy);
}

export function saveProposal(projectId: string, proposal: ImprovementStudy): void {
  const bucket = readMap(PROPOSALS_KEY, projectId);
  setOwn(bucket, proposal.id, proposal);
  writeBucket(PROPOSALS_KEY, projectId, bucket);
}

export function deleteProposal(projectId: string, proposalId: string): void {
  const bucket = readMap(PROPOSALS_KEY, projectId);
  if (Object.hasOwn(bucket, proposalId)) delete bucket[proposalId];
  writeBucket(PROPOSALS_KEY, projectId, bucket);
}

// --- Results Overview snapshots ---------------------------------------------
// 10 §18, §19 — one frozen summary per scenario, kept apart from the solution it
// froze. A snapshot is metadata for Screen 10; nothing here writes an overview
// KPI back into component master data (10 §30).

export function loadSnapshots(projectId: string): ResultsOverviewSnapshot[] {
  const bucket = readMap(SNAPSHOTS_KEY, projectId) as Record<string, ResultsOverviewSnapshot>;
  return Object.values(bucket).filter(
    (snapshot) => snapshot && typeof snapshot === 'object' && snapshot.scenario_id,
  );
}

export function saveSnapshot(projectId: string, snapshot: ResultsOverviewSnapshot): void {
  const bucket = readMap(SNAPSHOTS_KEY, projectId);
  setOwn(bucket, snapshot.scenario_id, snapshot);
  writeBucket(SNAPSHOTS_KEY, projectId, bucket);
}

export function deleteSnapshot(projectId: string, scenarioId: string): void {
  const bucket = readMap(SNAPSHOTS_KEY, projectId);
  if (Object.hasOwn(bucket, scenarioId)) delete bucket[scenarioId];
  writeBucket(SNAPSHOTS_KEY, projectId, bucket);
}

// --- Report configuration, templates and export payloads --------------------
// 11 §33, §46 — layout only. Thermal master data is never stored in the report
// collections: a config references a snapshot by id, and a template carries no
// project result at all (11 §33, AC-11-33).

export function loadReportConfigs(projectId: string): ThermalReportConfig[] {
  const bucket = readMap(REPORT_CONFIGS_KEY, projectId) as Record<string, ThermalReportConfig>;
  return Object.values(bucket).filter(
    (config) => config && typeof config === 'object' && config.scenario_id,
  );
}

export function saveReportConfig(projectId: string, config: ThermalReportConfig): void {
  const bucket = readMap(REPORT_CONFIGS_KEY, projectId);
  setOwn(bucket, config.scenario_id, config);
  writeBucket(REPORT_CONFIGS_KEY, projectId, bucket);
}

export function deleteReportConfig(projectId: string, scenarioId: string): void {
  const bucket = readMap(REPORT_CONFIGS_KEY, projectId);
  if (Object.hasOwn(bucket, scenarioId)) delete bucket[scenarioId];
  writeBucket(REPORT_CONFIGS_KEY, projectId, bucket);
}

/** Templates are layout only, so they are shared across projects on purpose. */
export function loadReportTemplates(): ReportTemplate[] {
  const all = readCollection(REPORT_TEMPLATES_KEY);
  const shared = own<Record<string, ReportTemplate>>(all, 'shared');
  const bucket = isPlainObject(shared) ? shared : {};
  return Object.values(bucket).filter((entry) => entry && typeof entry === 'object' && entry.name);
}

export function saveReportTemplate(template: ReportTemplate): void {
  const all = readCollection(REPORT_TEMPLATES_KEY);
  const shared = own(all, 'shared');
  const bucket: Record<string, unknown> = isPlainObject(shared) ? { ...shared } : {};
  setOwn(bucket, template.id, template);
  all.shared = bucket as RawDoc;
  writeCollection(REPORT_TEMPLATES_KEY, all);
}

export function loadExportPayloads(projectId: string): ReportExportPayload[] {
  const bucket = readMap(REPORT_PAYLOADS_KEY, projectId) as Record<string, ReportExportPayload>;
  return Object.values(bucket).filter(
    (entry) => entry && typeof entry === 'object' && entry.scenario_id,
  );
}

export function saveExportPayload(projectId: string, payload: ReportExportPayload): void {
  const bucket = readMap(REPORT_PAYLOADS_KEY, projectId);
  setOwn(bucket, payload.scenario_id, payload);
  writeBucket(REPORT_PAYLOADS_KEY, projectId, bucket);
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
  const entry = readBucket<ExportStamp>(EXPORT_STAMPS_KEY, projectId);
  return entry && typeof entry === 'object' && entry.lastExportAt ? entry : null;
}

export function saveExportStamp(projectId: string, stamp: ExportStamp): void {
  writeBucket(EXPORT_STAMPS_KEY, projectId, stamp);
}

/**
 * What the engineer last set the Export Center to.
 *
 * Settings, not results: a filename pattern, a CSV encoding, a decimal
 * precision, which artifacts were ticked. §36 forbids an export writing file
 * bytes or thermal data to storage and this writes neither -- it is the same
 * kind of preference every other screen already remembers. Without it the
 * Export Center was the one screen that forgot what it had been told the
 * moment you left it, and an engineer who had set up a filename and a
 * precision found both back at their defaults on the next visit.
 *
 * Under its own key, for the reason the stamp is: writing it can never
 * overwrite a sibling field this build does not know about.
 */
export interface ExportPreferences {
  config: Record<string, unknown>;
  selected: string[];
  /**
   * The folder the engineer last pointed the export at, by name.
   *
   * A `FileSystemDirectoryHandle` is not serializable and a browser will not
   * re-grant one without a fresh gesture, so what is kept is the name: enough
   * for the screen to say which folder it was using and ask for it again.
   */
  output_folder_name?: string | null;
  /**
   * The snapshot matrix: which subject is ticked for which view.
   *
   * Stored loosely rather than as the typed selection, because the subjects a
   * matrix has depend on the network it is opened against -- a board removed or
   * a bottleneck cleared changes the rows. It is reconciled against the current
   * subjects on the way in; see `reconcileSnapshotSelection`.
   */
  snapshot_selection?: Record<string, unknown> | null;
}

/**
 * The preferences' shape, checked field by field.
 *
 * They arrive from two places a person can edit -- browser storage and an
 * imported .tnv.json -- and were trusted as long as `config` was truthy. A
 * `selected` that was not an array then reached the screen's `.includes`, and
 * an id this build does not offer reached the exporter, which throws on it.
 * What each field MEANS (which artifact ids exist, which scales) is the export
 * store's business; this only guarantees each field is the kind of thing its
 * type says, so nothing downstream has to guess.
 */
export function normalizeExportPreferences(raw: unknown): ExportPreferences | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const config = entry.config;
  if (config == null || typeof config !== 'object' || Array.isArray(config)) return null;
  const snapshot = entry.snapshot_selection;
  return {
    config: config as Record<string, unknown>,
    selected: Array.isArray(entry.selected)
      ? entry.selected.filter((value): value is string => typeof value === 'string')
      : [],
    output_folder_name:
      typeof entry.output_folder_name === 'string' && entry.output_folder_name
        ? entry.output_folder_name
        : null,
    snapshot_selection:
      snapshot != null && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? (snapshot as Record<string, unknown>)
        : null,
  };
}

export function loadExportPreferences(projectId: string): ExportPreferences | null {
  return normalizeExportPreferences(readBucket(EXPORT_PREFS_KEY, projectId));
}

export function saveExportPreferences(projectId: string, prefs: ExportPreferences): void {
  writeBucket(EXPORT_PREFS_KEY, projectId, prefs);
}

// --- sync bookkeeping --------------------------------------------------------
// Small plain-JSON records the folder sync keeps beside the cache. Written
// straight through rather than via `writeCollection`: they describe the cache,
// they are not project data, and announcing them would make the mirror chase
// its own bookkeeping.

/**
 * Where a project file is written. Every save goes to each configured target,
 * and each keeps its own bookkeeping: an edit can be on the local disk and not
 * yet on SharePoint (offline, signed out), or the other way round.
 */
export type SyncTarget = 'local' | 'sharepoint';

/** `tnv.unsynced` / `tnv.sync_state` predate SharePoint and stay the local folder's. */
const UNSYNCED_KEYS: Record<SyncTarget, string> = {
  local: UNSYNCED_STORAGE_KEY,
  sharepoint: UNSYNCED_SP_STORAGE_KEY,
};
const SYNC_STATE_KEYS: Record<SyncTarget, string> = {
  local: 'tnv.sync_state',
  sharepoint: 'tnv.sync_state_sp',
};

/** Every bookkeeping key, so a cache refill can carry them across (see `clearWorkingCache`). */
const SYNC_BOOKKEEPING_KEYS = [...Object.values(UNSYNCED_KEYS), ...Object.values(SYNC_STATE_KEYS)];

/** A project whose cached data changed after its last successful write to a target. */
export interface UnsyncedMarker {
  since: string;
  /** Bumped on every write, so a mirror can tell it raced a newer edit. */
  version: number;
}

/** Which file a project was last written to, and its timestamp right after. */
export interface SyncRecord {
  filename: string;
  modified_at: number;
}

function readPlain(key: string): Record<string, unknown> {
  try {
    const raw = rawGet(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePlain(key: string, value: Record<string, unknown>): void {
  rawSet(key, JSON.stringify(value));
}

export function loadUnsyncedMarkers(target: SyncTarget = 'local'): Record<string, UnsyncedMarker> {
  const markers: Record<string, UnsyncedMarker> = {};
  for (const [projectId, entry] of Object.entries(readPlain(UNSYNCED_KEYS[target]))) {
    if (!isPlainObject(entry)) continue;
    setOwn(markers, projectId, {
      since: typeof entry.since === 'string' ? entry.since : '',
      version: typeof entry.version === 'number' ? entry.version : 0,
    });
  }
  return markers;
}

/** Records that `projectId`'s cache is ahead of its file in `target`. Returns the new version. */
export function markProjectUnsynced(projectId: string, target: SyncTarget = 'local'): number {
  const key = UNSYNCED_KEYS[target];
  const markers = readPlain(key);
  const current = own<UnsyncedMarker>(markers, projectId);
  const version = (current?.version ?? 0) + 1;
  setOwn(markers, projectId, { since: current?.since || new Date().toISOString(), version });
  writePlain(key, markers);
  return version;
}

/**
 * Clears the marker after a successful write to `target` — but only if no
 * newer edit arrived while the file was being written. `version` is the
 * marker's version when that write started.
 */
export function markProjectSynced(
  projectId: string,
  version?: number,
  target: SyncTarget = 'local',
): void {
  const key = UNSYNCED_KEYS[target];
  const markers = readPlain(key);
  const current = own<UnsyncedMarker>(markers, projectId);
  if (!current) return;
  if (version != null && current.version !== version) return;
  delete markers[projectId];
  writePlain(key, markers);
}

export function loadSyncState(target: SyncTarget = 'local'): Record<string, SyncRecord> {
  const state: Record<string, SyncRecord> = {};
  for (const [projectId, entry] of Object.entries(readPlain(SYNC_STATE_KEYS[target]))) {
    if (!isPlainObject(entry)) continue;
    if (typeof entry.filename !== 'string' || typeof entry.modified_at !== 'number') continue;
    setOwn(state, projectId, { filename: entry.filename, modified_at: entry.modified_at });
  }
  return state;
}

export function saveSyncRecord(
  projectId: string,
  record: SyncRecord | null,
  target: SyncTarget = 'local',
): void {
  const key = SYNC_STATE_KEYS[target];
  const state = readPlain(key);
  if (record) setOwn(state, projectId, record);
  else if (Object.hasOwn(state, projectId)) delete state[projectId];
  writePlain(key, state);
}
