/**
 * Export payload — 11 §32, §38.
 *
 * `Prepare for Export` produces METADATA for Screen 12 and nothing else. 11 §38
 * and AC-11-35 forbid generating a PDF, CSV, JSON file, PNG or ZIP here, and the
 * payload type carries `contains_file_bytes: false` as a literal so the promise
 * is checked by the compiler rather than only by a comment.
 */

import {
  REPORT_SCHEMA_VERSION,
  type ReportExportPayload,
  type ReportReadiness,
  type SectionId,
  type ThermalReportConfig,
} from './reportTypes';
import { includedSections, orderedSections } from './reportConfig';

export interface PayloadInput {
  config: ThermalReportConfig;
  snapshot_id: string;
  readiness: ReportReadiness;
  estimated_page_count: number;
  now?: string;
}

export function buildExportPayload(input: PayloadInput): ReportExportPayload {
  // PREVIEW_READY never reaches here: §3 blocks export preparation for a stale
  // or missing snapshot, and the caller refuses before building a payload.
  const readiness: ReportExportPayload['readiness'] =
    input.readiness === 'EXPORT_READY' || input.readiness === 'WARNING'
      ? input.readiness
      : 'BLOCKED';

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    report_config_id: input.config.id,
    snapshot_id: input.snapshot_id,
    project_id: input.config.project_id,
    scenario_id: input.config.scenario_id,

    page_size: input.config.page_size,
    orientation: input.config.orientation,
    language_mode: input.config.language_mode,

    section_order: orderedSections(input.config).map((section) => section.id as SectionId),
    included_sections: includedSections(input.config).map((section) => section.id as SectionId),

    readiness,
    generated_at: input.now ?? new Date().toISOString(),
    estimated_page_count: input.estimated_page_count,
    contains_file_bytes: false,
  };
}
