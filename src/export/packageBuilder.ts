/**
 * Engineering Package ZIP — 12 §16, §17, §40, AC-12-18, AC-12-19.
 *
 * §40's order matters and is followed literally: the manifest is generated
 * BEFORE the ZIP is finalized, so `manifest.json` describes the package it is
 * actually inside — including the artifacts that failed, which §30 requires it
 * to record rather than quietly omit.
 */

import JSZip from 'jszip';

import { buildManifest } from './manifestBuilder';
import { encodeJson } from './csv';
import {
  artifactDefinition,
  type ExportArtifactResult,
  type ExportManifest,
  type ExportSession,
  type JsonFormat,
} from './exportTypes';

/** One produced file: an artifact may yield several (network CSV, PNG set). */
export interface GeneratedFile {
  /** Path inside the ZIP — 12 §16's directory layout. */
  package_path: string;
  /** Stand-alone download name — 12 §18's convention. */
  filename: string;
  blob: Blob;
  mime_type: string;
}

export interface GeneratedArtifact {
  type: ExportArtifactResult['type'];
  files: GeneratedFile[];
  warnings: string[];
  error?: string;
}

export interface PackageInput {
  session: ExportSession;
  artifacts: GeneratedArtifact[];
  results: ExportArtifactResult[];
  warnings: string[];
  json_format: JsonFormat;
  compress: boolean;
  now: string;
}

export interface PackageOutput {
  blob: Blob;
  manifest: ExportManifest;
  entry_count: number;
}

export async function buildPackage(input: PackageInput): Promise<PackageOutput> {
  const zip = new JSZip();
  let entries = 0;

  for (const artifact of input.artifacts) {
    if (artifact.error) continue;
    for (const file of artifact.files) {
      zip.file(file.package_path, file.blob);
      entries += 1;
    }
  }

  // 12 §40 — manifest first, then finalize.
  const manifest = buildManifest({
    session: input.session,
    results: input.results,
    warnings: input.warnings,
    now: input.now,
  });
  zip.file(
    artifactDefinition('manifest').package_path,
    encodeJson(manifest, input.json_format),
  );
  entries += 1;

  const blob = await zip.generateAsync({
    type: 'blob',
    // 12 §24 — ZIP Compression. `STORE` still produces a valid archive; it is
    // simply faster and larger, which is the trade the switch offers.
    compression: input.compress ? 'DEFLATE' : 'STORE',
    ...(input.compress ? { compressionOptions: { level: 6 } } : {}),
  });

  return { blob, manifest, entry_count: entries };
}
