/**
 * Traceability manifest — 12 §17, §30, §37, AC-12-19.
 *
 * The manifest is the reason a package can be trusted six months later: it names
 * the project, scenario, solver, snapshot and every file, with the warnings that
 * were live at the time. §30 makes it carry failures too — a PARTIAL package
 * that stays silent about the artifact that did not make it is worse than no
 * package at all.
 *
 * §37: `External CFD Validation: Deferred` is stated as a warning line. It is
 * never rendered as a validated result, and no FloTHERM value is invented.
 */

import { SOLVER_VERSION } from '@/thermal/solver/solverTypes';

import {
  APP_VERSION,
  EXPORT_SCHEMA_VERSION,
  artifactDefinition,
  type ExportArtifactResult,
  type ExportManifest,
  type ExportSession,
} from './exportTypes';

export interface ManifestInput {
  session: ExportSession;
  results: ExportArtifactResult[];
  /** Validation warnings live at export time (12 §31, §46). */
  warnings: string[];
  now: string;
}

export function buildManifest(input: ManifestInput): ExportManifest {
  const artifacts: ExportManifest['artifacts'] = [];

  for (const result of input.results) {
    // The manifest describes the package's CONTENTS. A file that never made it
    // in is recorded as a warning line instead of being listed as included.
    if (result.status === 'FAILED' || result.status === 'SKIPPED') continue;
    const definition = artifactDefinition(result.type);
    artifacts.push({
      type: definition.label,
      filename: result.filename,
      status: result.status === 'WARNING' ? 'warning' : 'included',
      sourceScreen: definition.source_screen,
      sourceVersion: sourceVersionOf(result.type, input.session),
      // 12 §41 — omitted rather than fabricated when checksums are off.
      ...(result.checksum_sha256 ? { checksum: result.checksum_sha256 } : {}),
    });
  }

  const warnings = [...input.warnings];
  for (const result of input.results) {
    if (result.status === 'FAILED') {
      warnings.push(
        `${artifactDefinition(result.type).label} failed to generate: ${result.error ?? 'unknown error'}`,
      );
    }
    if (result.status === 'SKIPPED') {
      warnings.push(`${artifactDefinition(result.type).label} was skipped.`);
    }
    for (const warning of result.warnings) {
      warnings.push(`${artifactDefinition(result.type).label}: ${warning}`);
    }
  }

  return {
    packageId: input.session.id,
    projectId: input.session.project_id,
    scenarioId: input.session.scenario_id,
    createdAt: input.now,
    appVersion: APP_VERSION,
    schemaVersion: EXPORT_SCHEMA_VERSION,

    ...(input.session.report_snapshot_id ? { reportSnapshotId: input.session.report_snapshot_id } : {}),
    ...(input.session.report_config_id ? { reportConfigId: input.session.report_config_id } : {}),
    solverVersion: SOLVER_VERSION,

    artifacts,
    warnings: dedupe(warnings),
  };
}

/**
 * Which frozen source produced this artifact (12 §47). A reader asking "which
 * solve is this CSV from?" gets an answer without having to trust file times.
 */
function sourceVersionOf(type: ExportArtifactResult['type'], session: ExportSession): string | undefined {
  switch (type) {
    case 'pdf_report':
    case 'html_report':
      return session.report_snapshot_id;
    case 'temperature_csv':
      return session.distribution_id;
    case 'png_snapshots':
      return session.solver_solution_id;
    case 'bottleneck_csv':
      return session.analysis_id;
    case 'network_json':
    case 'network_csv':
      return session.solver_solution_id;
    default:
      return undefined;
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
