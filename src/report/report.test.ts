/**
 * Screen 11 tests — the developer test cases in 11 §50 (A–E), plus the section
 * rules of §6, the pagination of §40, the readiness rules of §29/§30 and the
 * export-payload contract of §32/§38.
 */

import { describe, expect, it } from 'vitest';

import type {
  ResultsOverview,
  ResultsOverviewSnapshot,
} from '@/thermal/overview/overviewTypes';

import {
  applyTemplate,
  includedSections,
  moveSection,
  orderedSections,
  patchContent,
  patchDisplay,
  reorderSection,
  resetSections,
  setSectionNote,
  toTemplate,
  toggleSection,
} from './reportConfig';
import { createReportConfig } from './defaultTemplate';
import { evaluateSnapshot, blocksExport, blocksPreview } from './snapshotAdapter';
import { paginate, pageOfSection, sectionHeight } from './pagination';
import { previewReadiness, validateReport } from './reportValidator';
import { buildExportPayload } from './exportPayloadBuilder';
import { REQUIRED_SECTION_IDS, SECTION_DEFINITIONS } from './sectionRegistry';

// --- builders --------------------------------------------------------------

function snapshot(options: {
  signature?: string;
  overall?: ResultsOverviewSnapshot['overall_status'];
  readiness?: ResultsOverviewSnapshot['report_readiness'];
  bottlenecks?: number;
  distribution?: boolean;
  withoutLimits?: number;
  lowConfidence?: number;
  solverStatus?: 'SOLVED' | 'WARNING' | 'FAILED';
} = {}): ResultsOverviewSnapshot {
  const count = options.bottlenecks ?? 3;
  return {
    schema_version: '1.0',
    id: 'SNAP_1',
    project_id: 'TEST',
    scenario_id: 'SCN_A',
    scenario_name: 'Baseline 55C',
    created_at: '2026-02-01T00:00:00.000Z',
    created_by: 'Thermal Engineer',

    overall_status: options.overall ?? 'WARNING',
    result_mode: 'Analytical',
    kpis: {
      max_temperature_C: 103.4,
      max_temperature_node: 'PA1',
      worst_margin_C: 13.2,
      worst_margin_node: 'FPGA',
      top_bottleneck: count > 0 ? 'RF Left Base → HSK Base' : null,
      energy_error_pct: 0.05,
      total_power_W: 412.3,
    },
    critical_components: Array.from({ length: 5 }, (_, index) => ({
      component_name: `CMP${index}`,
      node_id: `N${index}`,
      node_name: `N${index}`,
      temperature_C: 100 - index,
      limit_C: 110,
      limit_type: 'Tj' as const,
      margin_C: 10 + index,
      status: 'PASS' as const,
      monitored_node_count: 1,
    })),
    bottlenecks: Array.from({ length: count }, (_, index) => ({
      rank: index + 1,
      edge_id: `E${index}`,
      edge_label: `Edge ${index}`,
      score: 90 - index,
      classification: 'Critical' as const,
      sensitivity_improvement_C: 6.8,
      affected_components: 6,
      confidence: 'medium' as const,
      reduction_pct: 20,
    })),
    bottleneck_availability: count > 0 ? 'current' : 'not_run',
    distribution:
      options.distribution === false
        ? null
        : {
            average_C: 74.8,
            p95_C: 96.8,
            min_C: 58.9,
            max_C: 103.4,
            nodes_above_warning: 3,
            warning_threshold_C: 90,
            row_count: 18,
            scope_label: 'All Solved Nodes',
          },
    solver_quality: {
      status: options.solverStatus ?? 'SOLVED',
      solved_nodes: 42,
      solved_edges: 47,
      generated_W: 412.3,
      rejected_W: 412.1,
      residual_W: 0.2,
      energy_error_pct: 0.05,
      quality: 'green',
      solved_at: '2026-01-31T00:00:00.000Z',
    },
    completeness: {
      components_with_limits: 15,
      components_without_limits: options.withoutLimits ?? 0,
      rth_source_counts: { Analytical: 31, Manual: 16, Measurement: 0, FloTHERM: 0, Other: 0 },
      low_confidence_critical_edges: options.lowConfidence ?? 0,
      external_cfd_validation: 'Deferred',
      data_confidence: 'Analytical-only',
    },
    action_summary: ['FPGA is the lowest-margin monitored component (+13.2 °C).'],
    readiness: [],
    report_readiness: options.readiness ?? 'READY',

    source_signature: options.signature ?? 'sig-1',
    produces_document: false,
  };
}

function live(signature = 'sig-1', scenarioId = 'SCN_A'): ResultsOverview {
  return {
    scenario_id: scenarioId,
    source_signature: signature,
  } as unknown as ResultsOverview;
}

function config(now = '2026-02-01T00:00:00.000Z') {
  return createReportConfig({
    project_id: 'TEST',
    project_name: 'CBNG FR1 RRU EVT2',
    scenario_id: 'SCN_A',
    scenario_name: 'Baseline 55C',
    snapshot_id: 'SNAP_1',
    now,
  });
}

const ROWS = { critical: 18, bottleneck: 18, hot_nodes: 10 };

function validate(options: Parameters<typeof snapshot>[0] = {}, overrides: { signature?: string; liveSignature?: string } = {}) {
  const snap = snapshot({ ...options, signature: overrides.signature ?? 'sig-1' });
  const evaluation = evaluateSnapshot(
    snap,
    overrides.liveSignature === undefined ? live() : live(overrides.liveSignature),
    'Baseline 55C',
  );
  return {
    evaluation,
    validation: validateReport({
      config: config(),
      evaluation,
      project_name: 'CBNG FR1 RRU EVT2',
      project_id: 'TEST',
      scenario_name: 'Baseline 55C',
    }),
  };
}

// --- Test A — current warning snapshot (11 §50 A) ---------------------------

describe('Test A — current snapshot with WARNING (11 §50 A)', () => {
  it('previews, reports WARNING, and still allows export preparation', () => {
    const { evaluation, validation } = validate({ readiness: 'WARNING', overall: 'WARNING' });

    expect(evaluation.state).toBe('WARNING');
    expect(blocksPreview(evaluation.state)).toBe(false);
    expect(blocksExport(evaluation.state)).toBe(false);
    expect(validation.readiness).toBe('WARNING');
    expect(validation.blocking).toEqual([]);
    expect(validation.warnings.join(' ')).toMatch(/Report Readiness from Screen 10 is WARNING/);
  });
});

// --- Test B — stale snapshot (11 §50 B) -------------------------------------

describe('Test B — stale snapshot (11 §50 B)', () => {
  it('marks the preview stale and blocks export preparation', () => {
    const { evaluation, validation } = validate({}, { liveSignature: 'sig-2' });

    expect(evaluation.state).toBe('STALE');
    // 11 §3 — stale previews, behind a strong warning.
    expect(blocksPreview(evaluation.state)).toBe(false);
    expect(blocksExport(evaluation.state)).toBe(true);
    expect(validation.readiness).toBe('BLOCKED');
    expect(validation.blocking.join(' ')).toMatch(/stale/i);
    expect(previewReadiness(validation, evaluation.state)).toBe('PREVIEW_READY');
  });

  it('treats a missing snapshot as unpreviewable', () => {
    const evaluation = evaluateSnapshot(null, live(), 'Baseline 55C');
    expect(evaluation.state).toBe('MISSING');
    expect(blocksPreview(evaluation.state)).toBe(true);
    expect(blocksExport(evaluation.state)).toBe(true);
  });

  it('treats a snapshot from another scenario as stale', () => {
    const evaluation = evaluateSnapshot(snapshot(), live('sig-1', 'SCN_B'), 'Cold 25C');
    expect(evaluation.state).toBe('STALE');
  });
});

// --- Test C — FAIL result (11 §50 C, §30) -----------------------------------

describe('Test C — FAIL does not block reporting (11 §50 C, §30)', () => {
  it('keeps the preview valid and export unblocked', () => {
    const { evaluation, validation } = validate({ overall: 'FAIL', readiness: 'READY' });

    expect(evaluation.state).toBe('CURRENT');
    expect(validation.blocking).toEqual([]);
    // 11 §30 — blocking is about stale/missing/inconsistent data, not about
    // unfavourable thermal performance. Screen 10 said READY, so the report is
    // export-ready and simply carries the failure callout.
    expect(validation.readiness).toBe('EXPORT_READY');
    expect(validation.warnings.join(' ')).toMatch(
      /failure report is valid engineering output and does not block export/,
    );
  });

  it('still produces an export payload for a FAIL result', () => {
    const { validation } = validate({ overall: 'FAIL', readiness: 'READY' });
    const payload = buildExportPayload({
      config: config(),
      snapshot_id: 'SNAP_1',
      readiness: validation.readiness,
      estimated_page_count: 8,
      now: '2026-02-02T00:00:00.000Z',
    });
    expect(payload.readiness).toBe('EXPORT_READY');
    expect(payload.contains_file_bytes).toBe(false);
  });
});

// --- Test D — no bottleneck data (11 §50 D) ---------------------------------

describe('Test D — bottleneck data unavailable (11 §50 D)', () => {
  it('marks the section unavailable, warns, and fabricates no rows', () => {
    const { evaluation, validation } = validate({ bottlenecks: 0, readiness: 'READY' });

    expect(evaluation.unavailable_sections).toContain('bottleneck');
    expect(evaluation.snapshot?.bottlenecks).toEqual([]);
    expect(validation.readiness).toBe('WARNING');
    expect(validation.warnings.join(' ')).toMatch(/Bottleneck Analysis Summary has no data/);
    expect(validation.blocking).toEqual([]);
  });

  it('marks the distribution section unavailable when the snapshot has none', () => {
    const { evaluation } = validate({ distribution: false, readiness: 'READY' });
    expect(evaluation.unavailable_sections).toContain('distribution');
  });
});

// --- Test E — save as template (11 §50 E, §33, AC-11-33) -------------------

describe('Test E — Save As Template stores layout only (11 §50 E)', () => {
  it('carries no project result data of any kind', () => {
    let base = config();
    base = setSectionNote(base, 'critical', 'Highlight components with margin < 15 °C.');
    base = patchContent(base, 'critical', { row_count: 10 });

    const template = toTemplate(base, 'Compact Summary', '2026-02-02T00:00:00.000Z');
    const serialized = JSON.stringify(template);

    // Layout survives.
    expect(template.page_size).toBe('A4');
    expect(template.sections.find((entry) => entry.id === 'critical')?.content.row_count).toBe(10);

    // Nothing project-specific does.
    expect(serialized).not.toContain('103.4');
    expect(serialized).not.toContain('CMP0');
    expect(serialized).not.toContain('SNAP_1');
    expect(serialized).not.toContain('SCN_A');
    expect(serialized).not.toContain('Highlight components');
    expect(serialized).not.toContain('CBNG');
    // A section note is written about one project's numbers and never travels.
    expect(template.sections.every((entry) => !('note' in entry))).toBe(true);
  });

  it('re-applies a template onto another config without importing results', () => {
    let source = config();
    source = patchDisplay(source, 'critical', { page_break_before: true });
    source = toggleSection(source, 'appendix').config;

    const template = toTemplate(source, 'Layout A', '2026-02-02T00:00:00.000Z');
    const target = applyTemplate(config(), template);

    expect(target.sections.find((entry) => entry.id === 'critical')?.display.page_break_before).toBe(
      true,
    );
    expect(target.sections.find((entry) => entry.id === 'appendix')?.included).toBe(false);
    expect(target.scenario_id).toBe('SCN_A');
    expect(target.snapshot_id).toBe('SNAP_1');
  });
});

// --- sections (11 §5, §6) ---------------------------------------------------

describe('Section selection and order (11 §5, §6)', () => {
  it('starts from the specification default order', () => {
    expect(orderedSections(config()).map((entry) => entry.id)).toEqual([
      'cover',
      'project',
      'overall',
      'critical',
      'network',
      'bottleneck',
      'distribution',
      'quality',
      'confidence',
      'actions',
      'appendix',
    ]);
  });

  it('refuses to exclude a required section', () => {
    for (const id of REQUIRED_SECTION_IDS) {
      const result = toggleSection(config(), id);
      expect(result.refused).toMatch(/required section/);
      expect(result.config.sections.find((entry) => entry.id === id)?.included).toBe(true);
    }
  });

  it('excludes and re-includes an optional section', () => {
    const off = toggleSection(config(), 'appendix').config;
    expect(off.sections.find((entry) => entry.id === 'appendix')?.included).toBe(false);
    const on = toggleSection(off, 'appendix').config;
    expect(on.sections.find((entry) => entry.id === 'appendix')?.included).toBe(true);
  });

  it('moves a section up and down, keeping order numbers contiguous', () => {
    const moved = moveSection(config(), 'critical', -1);
    expect(orderedSections(moved).map((entry) => entry.id).slice(0, 5)).toEqual([
      'cover',
      'project',
      'critical',
      'overall',
      'network',
    ]);
    expect(orderedSections(moved).map((entry) => entry.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('does not move past either end', () => {
    expect(orderedSections(moveSection(config(), 'cover', -1))[0].id).toBe('cover');
    const last = orderedSections(config()).at(-1)!.id;
    expect(orderedSections(moveSection(config(), last, 1)).at(-1)!.id).toBe(last);
  });

  it('drops a dragged section at the requested index', () => {
    const dragged = reorderSection(config(), 'appendix', 1);
    expect(orderedSections(dragged).map((entry) => entry.id).slice(0, 3)).toEqual([
      'cover',
      'appendix',
      'project',
    ]);
  });

  it('resets order, inclusion and options together', () => {
    let edited = toggleSection(config(), 'appendix').config;
    edited = moveSection(edited, 'critical', -1);
    edited = patchContent(edited, 'critical', { row_count: 0 });

    const reset = resetSections(edited);
    expect(orderedSections(reset).map((entry) => entry.id)).toEqual(
      SECTION_DEFINITIONS.map((entry) => entry.id),
    );
    expect(reset.sections.every((entry) => entry.included)).toBe(true);
    expect(reset.sections.find((entry) => entry.id === 'critical')?.content.row_count).toBe(5);
  });
});

// --- pagination (11 §10, §40) -----------------------------------------------

describe('Pagination (11 §10, §40)', () => {
  it('gives the cover its own page and never shares it', () => {
    const pages = paginate(orderedSections(config()), ROWS);
    expect(pages[0].section_ids).toEqual(['cover']);
    expect(pages[1].section_ids).not.toContain('cover');
  });

  it('is deterministic for the same configuration', () => {
    const first = paginate(orderedSections(config()), ROWS);
    const second = paginate(orderedSections(config()), ROWS);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('starts a new page when Page Break Before is set', () => {
    const withBreak = patchDisplay(config(), 'overall', { page_break_before: true });
    const pages = paginate(orderedSections(withBreak), ROWS);
    const page = pages.find((entry) => entry.section_ids.includes('overall'));
    expect(page?.section_ids[0]).toBe('overall');
  });

  it('grows the page count when more rows are included', () => {
    const small = paginate(orderedSections(config()), ROWS).length;
    const all = patchContent(config(), 'critical', { row_count: 0 });
    const large = paginate(orderedSections(all), { ...ROWS, critical: 60 }).length;
    expect(large).toBeGreaterThan(small);
  });

  it('grows when an embedded histogram snapshot is included', () => {
    const before = sectionHeight(
      orderedSections(config()).find((entry) => entry.id === 'distribution')!,
      ROWS,
    );
    const withChart = patchContent(config(), 'distribution', {
      include_histogram_snapshot: true,
    });
    const after = sectionHeight(
      orderedSections(withChart).find((entry) => entry.id === 'distribution')!,
      ROWS,
    );
    expect(after).toBeGreaterThan(before);
  });

  it('drops excluded sections from the page list', () => {
    const without = toggleSection(config(), 'appendix').config;
    const pages = paginate(orderedSections(without), ROWS);
    expect(pages.some((page) => page.section_ids.includes('appendix'))).toBe(false);
  });

  it('locates the page a section starts on', () => {
    const pages = paginate(orderedSections(config()), ROWS);
    expect(pageOfSection(pages, 'cover')).toBe(1);
    expect(pageOfSection(pages, 'quality')).toBeGreaterThan(1);
  });
});

// --- validation and readiness (11 §29, §35, §36) ---------------------------

describe('Validation and readiness (11 §29, §35, §36)', () => {
  it('reports EXPORT_READY when nothing is outstanding', () => {
    const { validation } = validate({ readiness: 'READY', overall: 'PASS' });
    expect(validation.readiness).toBe('EXPORT_READY');
    expect(validation.entries).toHaveLength(7);
    expect(validation.entries.every((entry) => entry.state === 'READY')).toBe(true);
  });

  it('blocks on an empty report title', () => {
    const evaluation = evaluateSnapshot(snapshot({ readiness: 'READY', overall: 'PASS' }), live(), 'Baseline 55C');
    const validation = validateReport({
      config: { ...config(), title: '   ' },
      evaluation,
      project_name: 'CBNG',
      project_id: 'TEST',
      scenario_name: 'Baseline 55C',
    });
    expect(validation.readiness).toBe('BLOCKED');
    expect(validation.blocking.join(' ')).toMatch(/title is empty/i);
  });

  it('blocks when a required section has been removed from the config', () => {
    const evaluation = evaluateSnapshot(snapshot({ readiness: 'READY', overall: 'PASS' }), live(), 'Baseline 55C');
    const broken = config();
    broken.sections = broken.sections.map((section) =>
      section.id === 'quality' ? { ...section, included: false } : section,
    );
    const validation = validateReport({
      config: broken,
      evaluation,
      project_name: 'CBNG',
      project_id: 'TEST',
      scenario_name: 'Baseline 55C',
    });
    expect(validation.readiness).toBe('BLOCKED');
    expect(validation.blocking.join(' ')).toMatch(/Solver & Energy Quality/);
  });

  it('blocks when a REQUIRED section references unavailable data (11 §35)', () => {
    // A required section with nothing behind it cannot explain where the
    // report's numbers came from, which is the reason it is required.
    const evaluation = evaluateSnapshot(
      snapshot({ readiness: 'READY', overall: 'PASS' }),
      live(),
      'Baseline 55C',
    );
    const validation = validateReport({
      config: config(),
      evaluation: { ...evaluation, unavailable_sections: ['quality'] },
      project_name: 'CBNG',
      project_id: 'TEST',
      scenario_name: 'Baseline 55C',
    });
    expect(validation.readiness).toBe('BLOCKED');
    expect(validation.blocking.join(' ')).toMatch(
      /Required section Solver & Energy Quality references unavailable data/,
    );
  });

  it('only warns when an OPTIONAL section references unavailable data (11 §17)', () => {
    const evaluation = evaluateSnapshot(
      snapshot({ readiness: 'READY', overall: 'PASS' }),
      live(),
      'Baseline 55C',
    );
    const validation = validateReport({
      config: config(),
      evaluation: { ...evaluation, unavailable_sections: ['bottleneck'] },
      project_name: 'CBNG',
      project_id: 'TEST',
      scenario_name: 'Baseline 55C',
    });
    expect(validation.blocking).toEqual([]);
    expect(validation.readiness).toBe('WARNING');
    expect(validation.warnings.join(' ')).toMatch(/Bottleneck Analysis Summary has no data/);
  });

  it('blocks an invalid page configuration (11 §35)', () => {
    // The selects cannot produce this; a config restored from storage can.
    const evaluation = evaluateSnapshot(
      snapshot({ readiness: 'READY', overall: 'PASS' }),
      live(),
      'Baseline 55C',
    );
    const validation = validateReport({
      config: { ...config(), page_size: 'A3' as never },
      evaluation,
      project_name: 'CBNG',
      project_id: 'TEST',
      scenario_name: 'Baseline 55C',
    });
    expect(validation.readiness).toBe('BLOCKED');
    expect(validation.blocking.join(' ')).toMatch(/Invalid page configuration/);
  });

  it('lists the source-quality advisories §35 names', () => {
    const { validation } = validate({
      readiness: 'READY',
      overall: 'PASS',
      withoutLimits: 3,
      lowConfidence: 2,
    });
    const text = validation.warnings.join(' ');
    expect(text).toMatch(/3 component\(s\) lack thermal limits/);
    expect(text).toMatch(/2 critical edge\(s\) use low-confidence inputs/);
    expect(text).toMatch(/Analytical-only/);
  });

  it('leaves readiness to Screen 10 rather than re-deriving it from advisories', () => {
    // Screen 10 already weighed missing limits and low confidence when it set
    // its own Report Readiness. When 10 says READY, Screen 11 does not overrule
    // it — otherwise every V1 report would sit at WARNING purely because
    // Screen 03 is deferred (§20: analytical-only is not a failure).
    const stillReady = validate({ readiness: 'READY', overall: 'PASS', withoutLimits: 3 });
    expect(stillReady.validation.readiness).toBe('EXPORT_READY');

    // The realistic case: 10 reports WARNING for the same coverage gap, and
    // that verdict flows straight through.
    const demoted = validate({ readiness: 'WARNING', overall: 'PASS', withoutLimits: 3 });
    expect(demoted.validation.readiness).toBe('WARNING');
  });

  it('demotes readiness when an included optional section has no data', () => {
    const { validation } = validate({ readiness: 'READY', overall: 'PASS', bottlenecks: 0 });
    expect(validation.readiness).toBe('WARNING');
  });
});

// --- export payload (11 §32, §38) -------------------------------------------

describe('Export payload (11 §32, §38)', () => {
  it('carries metadata and never file bytes', () => {
    const payload = buildExportPayload({
      config: config(),
      snapshot_id: 'SNAP_1',
      readiness: 'EXPORT_READY',
      estimated_page_count: 8,
      now: '2026-02-02T00:00:00.000Z',
    });

    expect(payload.contains_file_bytes).toBe(false);
    expect(payload.section_order).toHaveLength(11);
    expect(payload.included_sections).toHaveLength(11);
    expect(payload.estimated_page_count).toBe(8);
    expect(payload.readiness).toBe('EXPORT_READY');

    // Nothing in the payload should look like a rendered artefact.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/base64|%PDF|data:application/i);
  });

  it('records only the included sections', () => {
    const trimmed = toggleSection(config(), 'appendix').config;
    const payload = buildExportPayload({
      config: trimmed,
      snapshot_id: 'SNAP_1',
      readiness: 'EXPORT_READY',
      estimated_page_count: 7,
    });
    expect(payload.section_order).toContain('appendix');
    expect(payload.included_sections).not.toContain('appendix');
  });

  it('downgrades a preview-only readiness to BLOCKED rather than exporting it', () => {
    const payload = buildExportPayload({
      config: config(),
      snapshot_id: 'SNAP_1',
      readiness: 'PREVIEW_READY',
      estimated_page_count: 8,
    });
    expect(payload.readiness).toBe('BLOCKED');
  });
});

// --- included sections helper ------------------------------------------------

describe('includedSections', () => {
  it('returns only included sections, in order', () => {
    const trimmed = toggleSection(config(), 'network').config;
    const ids = includedSections(trimmed).map((entry) => entry.id);
    expect(ids).not.toContain('network');
    expect(ids[0]).toBe('cover');
  });
});
