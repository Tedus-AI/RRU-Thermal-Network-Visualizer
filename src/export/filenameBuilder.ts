/**
 * Filename convention and sanitization — 12 §18, §19, §21, AC-12-20, AC-12-21.
 *
 * The convention is
 *
 *   <ProjectID>_<Scenario>_<Artifact>_<YYYYMMDD_HHmm>
 *
 * and the sanitizer is deliberately strict: a filename that survives Windows,
 * macOS, Linux, a ZIP entry and an email attachment is worth more than one that
 * preserves the engineer's punctuation. Overriding the base name changes the
 * FILE only — no project or scenario master data is touched (§19).
 */

import { artifactDefinition, type ArtifactType, type ExportConfiguration } from './exportTypes';

/** Longest single path segment we will produce, extension included. */
export const FILENAME_MAX = 120;

/**
 * 12 §18 — spaces become underscores, anything a filesystem may reject is
 * dropped, and the result is a safe ASCII slug.
 *
 * Non-ASCII is transliterated away rather than kept: a Traditional Chinese
 * scenario name survives inside the file (CSV, JSON, the report itself), but a
 * package emailed to a supplier should not depend on their filesystem's
 * encoding to be openable.
 */
export function sanitizeSegment(raw: string): string {
  return (
    raw
      .normalize('NFKD')
      // Combining marks left behind by the decomposition.
      .replace(/[\u0300-\u036f]/g, '')
      // Everything the major filesystems reserve.
      .replace(/[\\/:*?"<>|]/g, ' ')
      // Control characters and anything outside printable ASCII.
      .replace(/[^\x20-\x7e]/g, ' ')
      // 12 §18 — spaces become underscores, and so does every other leftover.
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
  );
}

/** Joins pre-sanitized parts, dropping the empties so no `__` appears. */
function join(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ? sanitizeSegment(part) : ''))
    .filter((part) => part.length > 0)
    .join('_');
}

/** 12 §18 — `YYYYMMDD_HHmm`, in local time, which is what the engineer reads. */
export function timestampOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export interface FilenameInput {
  config: ExportConfiguration;
  project_id: string;
  scenario_name: string;
  now: Date;
  /** Overrides the catalog's slug — used for the two network CSV tables. */
  slug_override?: string;
  extension_override?: string;
}

/**
 * The default base name, used when the engineer has not typed one (12 §19).
 * Kept separate from `filenameFor` so the Base Filename field can be seeded
 * with something meaningful and still be edited freely.
 */
export function defaultBaseFilename(projectId: string, scenarioName: string): string {
  return join([projectId, scenarioName]);
}

export function filenameFor(type: ArtifactType, input: FilenameInput): string {
  const definition = artifactDefinition(type);
  const { config } = input;

  const base = sanitizeSegment(config.base_filename);
  const parts: string[] = [];

  // A base filename the engineer typed replaces the project/scenario prefix
  // rather than being appended to it, which is what "override" has to mean for
  // the preview to be readable.
  if (base.length > 0) parts.push(base);
  else {
    if (config.include_project_id) parts.push(sanitizeSegment(input.project_id));
    if (config.include_scenario_id) parts.push(sanitizeSegment(input.scenario_name));
  }

  parts.push(sanitizeSegment(input.slug_override ?? definition.artifact_slug));
  if (config.timestamp) parts.push(timestampOf(input.now));

  const extension = input.extension_override ?? definition.extension;
  const stem = parts.filter(Boolean).join('_');
  return capLength(stem, extension);
}

/**
 * 12 §18 — length is capped on the STEM, never on the extension: truncating
 * `.json` to `.js` would change what the file claims to be.
 */
export function capLength(stem: string, extension: string): string {
  const suffix = extension ? `.${extension}` : '';
  const room = Math.max(8, FILENAME_MAX - suffix.length);
  const trimmed = stem.length > room ? stem.slice(0, room).replace(/[._-]+$/, '') : stem;
  return `${trimmed || 'export'}${suffix}`;
}

/**
 * 12 §24 — Auto Rename. The browser does this for a real download, but a ZIP
 * entry and the session history both need it applied in-process too, otherwise
 * two artifacts generated in the same minute silently overwrite each other.
 */
export function uniqueFilename(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const suffix = dot > 0 ? name.slice(dot) : '';

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}_${index}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}_${Date.now()}${suffix}`;
}
