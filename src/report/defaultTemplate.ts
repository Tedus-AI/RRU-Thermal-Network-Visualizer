/**
 * The built-in V1 template — 11 §5, §34.
 *
 * `Thermal Engineering Summary` is the only template the specification defines,
 * and §34 is explicit that other names may be reserved but must not be
 * implemented until specified. So exactly one template ships, and it is built
 * from the registry rather than from a second hand-written list that could drift
 * away from it.
 */

import {
  REPORT_SCHEMA_VERSION,
  type HeaderFooterConfig,
  type ReportCoverConfig,
  type ReportSectionConfig,
  type ThermalReportConfig,
} from './reportTypes';
import { SECTION_DEFINITIONS, defaultDisplay } from './sectionRegistry';

export const DEFAULT_TEMPLATE_NAME = 'Thermal Engineering Summary';

export function defaultSections(): ReportSectionConfig[] {
  return SECTION_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    included: true,
    order: index + 1,
    content: { ...definition.defaultContent },
    // The cover owns its page, and the appendix starts a fresh one so the
    // traceability block is not stranded at the foot of a results page.
    display: defaultDisplay(definition.id === 'appendix'),
  }));
}

export function defaultHeaderFooter(): HeaderFooterConfig {
  return {
    show_project_name: true,
    show_scenario: true,
    show_report_title: false,
    show_page_number: true,
    show_prepared_date: false,
    show_confidentiality: true,
    // 11 §9's suggested wording.
    footer_text: 'Confidential — Engineering Use Only',
  };
}

export function defaultCover(options: { preparedBy?: string; now: string }): ReportCoverConfig {
  return {
    customer_program: '',
    prepared_by: options.preparedBy || 'Thermal Engineer',
    prepared_date: options.now.slice(0, 10),
    company_team: '',
    confidentiality: 'Confidential',
    show_logo: true,
  };
}

export function createReportConfig(input: {
  project_id: string;
  project_name: string;
  scenario_id: string;
  scenario_name: string;
  snapshot_id: string;
  prepared_by?: string;
  now?: string;
}): ThermalReportConfig {
  const now = input.now ?? new Date().toISOString();

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    id: `RPT_${input.scenario_id}`,
    project_id: input.project_id,
    scenario_id: input.scenario_id,
    snapshot_id: input.snapshot_id,

    template_name: DEFAULT_TEMPLATE_NAME,
    title: `${input.project_name} Thermal Engineering Report`,
    subtitle: input.scenario_name,

    // 11 §8 — A4 Portrait, Bilingual.
    language_mode: 'bilingual',
    page_size: 'A4',
    orientation: 'portrait',

    cover: defaultCover({ preparedBy: input.prepared_by, now }),
    sections: defaultSections(),
    header_footer: defaultHeaderFooter(),

    created_at: now,
    updated_at: now,
  };
}
