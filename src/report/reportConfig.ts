/**
 * Report configuration mutations — 11 §6, §25, §27, §33.
 *
 * Every function here returns a NEW config. 11 §6 is explicit that reordering a
 * section must never mutate the Screen 10 snapshot, and the simplest way to keep
 * that promise is for this module never to hold a reference to snapshot data at
 * all: it only ever sees layout.
 */

import {
  REPORT_SCHEMA_VERSION,
  type ReportSectionConfig,
  type ReportTemplate,
  type SectionContentOptions,
  type SectionDisplayOptions,
  type SectionId,
  type ThermalReportConfig,
} from './reportTypes';
import { RECOMMENDED_SECTION_IDS, sectionDefinition } from './sectionRegistry';
import { defaultSections } from './defaultTemplate';

function touched(config: ThermalReportConfig, sections: ReportSectionConfig[]): ThermalReportConfig {
  return { ...config, sections: renumber(sections), updated_at: new Date().toISOString() };
}

/**
 * The layout revision a config has been brought forward to.
 *
 * Separate from `schema_version`, which describes the SHAPE of the stored
 * object and is shared with the export payload. This counts the one-time
 * migrations applied to a config's contents, so each runs exactly once.
 */
export const REPORT_LAYOUT_REVISION = 2;

/**
 * Bring a stored config forward to what Keep Table Together now means.
 *
 * The flag used to default ON for every section, and for a splittable one the
 * paginator ignored it while the Inspector hid the control — so a stored `true`
 * there records the old default and nothing a reader chose. Read literally
 * under the new rule it would move whole tables to a fresh page, which is the
 * blank-footed layout the measured heights were meant to end.
 *
 * Stamped, and therefore applied ONCE. Without the stamp this ran on every
 * load, and since the Inspector now offers the control on every section it
 * spent its time undoing the reader's own choice: tick Keep Table Together,
 * leave for another screen, come back to find it cleared — and the export,
 * which reads the same stored config, laid the report out the way nobody had
 * asked for. A migration that cannot tell its own default from a decision has
 * to stop after the one pass it was written for.
 *
 * A NON-splittable section is left alone: the flag always worked there, so a
 * `true` on it may well be deliberate and it does the same thing either way.
 */
export function normaliseDisplay(config: ThermalReportConfig): ThermalReportConfig {
  if ((config.layout_revision ?? 1) >= REPORT_LAYOUT_REVISION) return config;

  const sections = config.sections.map((section) => {
    if (!sectionDefinition(section.id).splittable) return section;
    if (!section.display.keep_table_together) return section;
    return { ...section, display: { ...section.display, keep_table_together: false } };
  });
  return { ...config, sections, layout_revision: REPORT_LAYOUT_REVISION };
}

/** Order numbers stay 1..n and contiguous, whatever the caller did to the array. */
export function renumber(sections: ReportSectionConfig[]): ReportSectionConfig[] {
  return sections.map((section, index) => ({ ...section, order: index + 1 }));
}

export function orderedSections(config: ThermalReportConfig): ReportSectionConfig[] {
  return [...config.sections].sort((a, b) => a.order - b.order);
}

export function includedSections(config: ThermalReportConfig): ReportSectionConfig[] {
  return orderedSections(config).filter((section) => section.included);
}

/**
 * 11 §6 — a required section cannot be excluded. The call is refused rather than
 * silently ignored, so the UI can say why instead of appearing not to respond.
 */
/**
 * Ticks or unticks a section. It never refuses.
 *
 * Four sections used to be locked on, and unticking one produced an error
 * toast. That is a rule about what a THERMAL report ought to contain enforced
 * on the engineer writing this one, who may be sending three pages to a
 * supplier. The validator still says when a recommended section is missing —
 * saying so is useful, preventing it was not.
 */
export function toggleSection(
  config: ThermalReportConfig,
  id: SectionId,
): { config: ThermalReportConfig; refused?: string } {
  const current = config.sections.find((section) => section.id === id);
  if (!current) return { config };

  return {
    config: touched(
      config,
      orderedSections(config).map((section) =>
        section.id === id ? { ...section, included: !section.included } : section,
      ),
    ),
  };
}

export function moveSection(
  config: ThermalReportConfig,
  id: SectionId,
  direction: -1 | 1,
): ThermalReportConfig {
  const sections = orderedSections(config);
  const index = sections.findIndex((section) => section.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sections.length) return config;

  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return touched(config, next);
}

/** Drag-and-drop reorder: move `id` to sit at `toIndex` in the ordered list. */
export function reorderSection(
  config: ThermalReportConfig,
  id: SectionId,
  toIndex: number,
): ThermalReportConfig {
  const sections = orderedSections(config);
  const from = sections.findIndex((section) => section.id === id);
  if (from < 0) return config;

  const bounded = Math.min(Math.max(toIndex, 0), sections.length - 1);
  if (bounded === from) return config;

  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(bounded, 0, moved);
  return touched(config, next);
}

/** 11 §6 — Reset to Default restores order, inclusion and every option. */
export function resetSections(config: ThermalReportConfig): ThermalReportConfig {
  return touched(config, defaultSections());
}

export function patchContent(
  config: ThermalReportConfig,
  id: SectionId,
  patch: Partial<SectionContentOptions>,
): ThermalReportConfig {
  return touched(
    config,
    orderedSections(config).map((section) =>
      section.id === id ? { ...section, content: { ...section.content, ...patch } } : section,
    ),
  );
}

export function patchDisplay(
  config: ThermalReportConfig,
  id: SectionId,
  patch: Partial<SectionDisplayOptions>,
): ThermalReportConfig {
  return touched(
    config,
    orderedSections(config).map((section) =>
      section.id === id ? { ...section, display: { ...section.display, ...patch } } : section,
    ),
  );
}

/** 11 §27 — a section note lives in the report config and nowhere else. */
export function setSectionNote(
  config: ThermalReportConfig,
  id: SectionId,
  note: string,
): ThermalReportConfig {
  return touched(
    config,
    orderedSections(config).map((section) =>
      section.id === id ? { ...section, note } : section,
    ),
  );
}

export function patchConfig(
  config: ThermalReportConfig,
  patch: Partial<
    Pick<
      ThermalReportConfig,
      | 'title'
      | 'subtitle'
      | 'language_mode'
      | 'page_size'
      | 'orientation'
      | 'notes'
      | 'conclusion_notes'
      | 'cover'
      | 'header_footer'
      | 'template_name'
    >
  >,
): ThermalReportConfig {
  return { ...config, ...patch, updated_at: new Date().toISOString() };
}

// --- templates (11 §33, AC-11-33) -------------------------------------------

/**
 * Freeze the LAYOUT of a config as a reusable template.
 *
 * Everything project-specific is dropped on the way out: the title, subtitle,
 * cover fields, notes, section notes, project and scenario ids, and the snapshot
 * id. What remains is inclusion, order, page settings, header/footer and the
 * per-section display and content options — none of which can carry a
 * temperature, a component id or a bottleneck score.
 */
export function toTemplate(
  config: ThermalReportConfig,
  name: string,
  now = new Date().toISOString(),
): ReportTemplate {
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    id: `TPL_${name.replace(/\s+/g, '_')}_${now}`,
    name,
    created_at: now,
    language_mode: config.language_mode,
    page_size: config.page_size,
    orientation: config.orientation,
    header_footer: { ...config.header_footer },
    sections: orderedSections(config).map((section) => ({
      id: section.id,
      included: section.included,
      order: section.order,
      content: { ...section.content },
      display: { ...section.display },
      // `note` is deliberately not copied: a section note is written about one
      // project's results and must not follow the layout into another report.
    })),
  };
}

export function applyTemplate(
  config: ThermalReportConfig,
  template: ReportTemplate,
): ThermalReportConfig {
  const byId = new Map(template.sections.map((section) => [section.id, section]));

  const sections = orderedSections(config)
    .map((section) => {
      const stored = byId.get(section.id);
      if (!stored) return section;
      return {
        ...section,
        included: stored.included,
        order: stored.order,
        content: { ...stored.content },
        display: { ...stored.display },
      };
    })
    .sort((a, b) => a.order - b.order);

  return {
    ...config,
    template_name: template.name,
    language_mode: template.language_mode,
    page_size: template.page_size,
    orientation: template.orientation,
    header_footer: { ...template.header_footer },
    sections: renumber(sections),
    updated_at: new Date().toISOString(),
  };
}

export { RECOMMENDED_SECTION_IDS };
