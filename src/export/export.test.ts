/**
 * Export layer tests — 12 §58 A–F, plus the serialization contracts of
 * §10, §11, §12, §13, §14, §17, §18, §21, §26 and §27.
 *
 * Everything here is the pure part of Screen 12: readiness, validation,
 * filenames, CSV/JSON serialization and the manifest. The generators that need
 * a DOM (PDF, PNG, ZIP) are exercised in the browser verification instead.
 */

import { describe, expect, it } from 'vitest';

import type { Component } from '@/domain/component';
import type { Scenario } from '@/domain/project';
import type { BottleneckAnalysis } from '@/thermal/analysis/analysisTypes';
import type { ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { ResultsOverviewSnapshot } from '@/thermal/overview/overviewTypes';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { ThermalNetwork } from '@/thermal/types';
import type { ReportExportPayload } from '@/report/reportTypes';

import { buildCsv, encodeCsv, encodeJson } from './csv';
import { exportBottleneckCsv } from './exportBottleneckCsv';
import { exportNetworkCsv } from './exportNetworkCsv';
import { exportNetworkJson } from './exportNetworkJson';
import { exportScenarioJson } from './exportScenarioJson';
import { exportTemperatureCsv } from './exportTemperatureCsv';
import { createExportSession } from './exportSession';
import { buildManifest } from './manifestBuilder';
import {
  capLength,
  defaultBaseFilename,
  filenameFor,
  sanitizeSegment,
  timestampOf,
  uniqueFilename,
} from './filenameBuilder';
import {
  evaluateAllArtifacts,
  evaluateArtifact,
  evaluateSources,
  globalStatus,
  requiresConfirmation,
  validateExport,
  type ReadinessInput,
} from './exportValidator';
import {
  defaultConfiguration,
  PRESET_ARTIFACTS,
  type ArtifactType,
  type ExportArtifactResult,
} from './exportTypes';

// --- fixtures ---------------------------------------------------------------

const NOW = new Date('2026-08-12T12:50:00');

function network(): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'CBNG_FR1_RRU_EVT2',
    network_name: 'RRU',
    mode: 'analytical',
    status: 'VALID',
    nodes: {
      N_PA_J: {
        id: 'N_PA_J',
        name: 'PA Junction',
        type: 'junction',
        component_ref: 'CMP_PA',
        zone: 'RF Left',
        power_W: 52.13,
        temperature_C: null,
        temperature_source: null,
        limit_C: 180,
        limit_type: 'Tj',
        boundary_type: null,
      },
      N_BASE: {
        id: 'N_BASE',
        name: 'Main Base',
        type: 'heat_sink_base',
        power_W: 0,
        temperature_C: null,
        temperature_source: null,
        boundary_type: null,
      },
      N_AMB: {
        id: 'N_AMB',
        name: 'Ambient',
        type: 'ambient',
        power_W: 0,
        temperature_C: null,
        temperature_source: null,
        boundary_type: 'fixed_temperature',
        fixed_temperature_C: 55,
      },
    },
    edges: {
      E_1: {
        id: 'E_1',
        from: 'N_PA_J',
        to: 'N_BASE',
        type: 'package_rjc',
        method: 'direct_rth',
        rth: {
          analytical: 0.35,
          flotherm: null,
          measurement: null,
          manual: null,
          active_source: 'Analytical',
          provenance: { Analytical: { source: 'Analytical', confidence: 'high' } },
        },
        heat_flow_W: null,
        delta_T_C: null,
        resolution: 'resolved',
        enabled: true,
        confidence: 'high',
        // A field this build does not model, to prove §11's preservation rule.
        metadata: { supplier_note: 'keep me' },
      },
      E_2: {
        id: 'E_2',
        from: 'N_BASE',
        to: 'N_AMB',
        type: 'convection',
        method: 'convection_hA',
        rth: {
          analytical: 0.12,
          flotherm: null,
          measurement: null,
          manual: null,
          active_source: 'Analytical',
          provenance: {},
        },
        heat_flow_W: null,
        delta_T_C: null,
        resolution: 'resolved',
        enabled: true,
        confidence: 'low',
      },
    },
    templates: {},
    zones: {},
    layout: { mode: 'dagre', positions: {} },
    flotherm_mappings: {},
    solver_settings: { energy_warn_pct: 0.5, energy_error_pct: 2, max_iterations: 200, tolerance: 1e-9 },
    metadata: { origin: 'unit-test' },
  };
}

function solution(status: ThermalSolution['status'] = 'SOLVED'): ThermalSolution {
  return {
    schema_version: '1.0',
    project_id: 'CBNG_FR1_RRU_EVT2',
    network_id: 'RRU',
    scenario_id: 'SCN_1',
    status,
    solver_version: 'v1.0',
    solver_engine: 'Direct nodal',
    solved_at: '2026-08-12T12:00:00.000Z',
    node_temperatures_C: { N_PA_J: 102.4, N_BASE: 78.2, N_AMB: 55 },
    edge_results: {
      E_1: {
        edge_id: 'E_1',
        from: 'N_PA_J',
        to: 'N_BASE',
        heat_flow_W: 52.13,
        delta_T_C: 24.2,
        actual_direction: 'forward',
        active_rth_C_per_W: 0.35,
        active_rth_source: 'Analytical',
        rth_origin: 'edge',
      },
    },
    energy_balance: {
      generated_W: 100,
      rejected_W: 100,
      residual_W: 0,
      error_pct: 0,
      grade: 'green',
      component_W: 100,
      solar_W: 0,
    },
    warnings: [],
    metadata: {
      input_signature: 'sig-solve-1',
      solved_nodes: 3,
      solved_edges: 2,
      fixed_nodes: 1,
      max_node_residual_W: 0,
      solve_time_ms: 3,
      power_scale: 1,
      ambient_C: 55,
      matrix_size: 2,
    },
  };
}

function analysis(state: BottleneckAnalysis['state'] = 'COMPLETE'): BottleneckAnalysis {
  return {
    schema_version: '1.0',
    project_id: 'CBNG_FR1_RRU_EVT2',
    network_id: 'RRU',
    scenario_id: 'SCN_1',
    state,
    settings: {
      scope: 'all_edges',
      reduction_pct: 20,
      target_metric: 'worst_component_temperature',
      target_node_id: null,
      custom_edge_ids: [],
      filters: {
        edge_type: 'All',
        component: 'All',
        zone: 'All',
        rth_source: 'All',
        confidence: 'All',
        sharing: 'all',
        boundary: 'all',
      },
    },
    baseline_signature: 'sig-solve-1',
    analyzed_at: '2026-08-12T12:10:00.000Z',
    elapsed_ms: 120,
    results: [
      {
        edge_id: 'E_2',
        rank: 1,
        edge_label: 'Main Base → Ambient',
        path_label: 'Boundary',
        edge_type: 'convection',
        baseline: {
          rth_C_per_W: 0.12,
          heat_flow_W: 100,
          delta_T_C: 23.2,
          T_from_C: 78.2,
          T_to_C: 55,
          rth_source: 'Analytical',
          confidence: 'low',
        },
        sensitivity: {
          reduction_pct: 20,
          original_rth_C_per_W: 0.12,
          modified_rth_C_per_W: 0.096,
          baseline_target_C: 102.4,
          modified_target_C: 97.8,
          target_improvement_C: 4.6,
          baseline_worst_margin_C: 77.6,
          modified_worst_margin_C: 82.2,
          margin_improvement_C: 4.6,
          affected_component_count: 1,
          affected_components: [],
          solve_status: 'SOLVED',
          energy_error_pct: 0,
        },
        normalized: { delta_t: 1, sensitivity: 1, margin_impact: 1 },
        score: 92,
        classification: 'Critical',
        confidence: 'low',
        recommendation: { title: 'Improve boundary', zh: '改善邊界', points: [] },
      },
    ],
    rejected: [],
    issues: [],
    summary: {
      top_bottleneck: 'E_2',
      top_score: 92,
      worst_margin_C: 77.6,
      best_improvement_C: 4.6,
      analyzed_edges: 2,
      failed_candidates: 0,
    },
  };
}

function scenario(): Scenario {
  return {
    id: 'SCN_1',
    project_id: 'CBNG_FR1_RRU_EVT2',
    name: 'Baseline 55C / 0 m/s',
    ambient_C: 55,
    wind_mps: 0,
    solar_W_m2: 0,
    power_scale: 1,
    notes: '',
    is_default: true,
  };
}

function boundary(
  status: ScenarioBoundaryConditionSet['status'] = 'ready_for_solve',
): ScenarioBoundaryConditionSet {
  return {
    id: 'BND_1',
    schema_version: '1.0',
    project_id: 'CBNG_FR1_RRU_EVT2',
    network_id: 'RRU',
    scenario_id: 'SCN_1',
    network_topology_version: 1,
    status,
    ambient: {
      external_ambient_C: 55,
      source: 'Scenario',
      confidence: 'high',
    } as unknown as ScenarioBoundaryConditionSet['ambient'],
    site: {
      wind_speed_m_s: 0,
      wind_direction_deg: 180,
      wind_direction_label: 'S',
      airflow_mode: 'natural',
      convection_method: 'manual_h',
      solar_enabled: false,
    },
    profiles: [
      {
        id: 'PRF_1',
        name: 'Natural convection',
        type: 'convection',
        representation: 'h_area',
        parameters: { h_W_m2K: 8, area_m2: 0.42 },
        source: 'Assumed',
        confidence: 'medium',
      } as unknown as ScenarioBoundaryConditionSet['profiles'][number],
    ],
    assignments: [],
    external_loads: [],
    derived_preview: [],
    validation: { status: 'ready_for_07', errors: [], warnings: [], infos: [] },
    surface_properties: [],
    created_at: '2026-08-12T10:00:00.000Z',
    updated_at: '2026-08-12T11:00:00.000Z',
    updated_by: 'tester',
    source_screen: '06_Boundary_Conditions',
  };
}

function components(): Component[] {
  return [
    {
      id: 'CMP_PA',
      name: 'Final PA',
      category: 'RF',
      enabled: true,
      qty: 4,
      power_W: { value: 52.13 },
      thermal_spec: {},
      architecture_prep: {},
      provenance: {},
      external_mappings: {},
    } as unknown as Component,
  ];
}

function payload(
  readiness: ReportExportPayload['readiness'] = 'EXPORT_READY',
): ReportExportPayload {
  return {
    schema_version: '1.0',
    report_config_id: 'RPT_1',
    snapshot_id: 'SNAP_1',
    project_id: 'CBNG_FR1_RRU_EVT2',
    scenario_id: 'SCN_1',
    page_size: 'A4',
    orientation: 'portrait',
    language_mode: 'bilingual',
    section_order: ['cover', 'project', 'overall', 'quality'],
    included_sections: ['cover', 'project', 'overall', 'quality'],
    readiness,
    generated_at: '2026-08-12T12:40:00.000Z',
    estimated_page_count: 7,
    contains_file_bytes: false,
  };
}

function snapshot(
  overall: ResultsOverviewSnapshot['overall_status'] = 'PASS',
): ResultsOverviewSnapshot {
  return {
    id: 'SNAP_1',
    scenario_id: 'SCN_1',
    overall_status: overall,
    critical_components: [],
    bottlenecks: [],
    distribution: { row_count: 3 },
    completeness: { data_confidence: 'Analytical-only', external_cfd_validation: 'Deferred' },
  } as unknown as ResultsOverviewSnapshot;
}

function readiness(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    network: network(),
    solution: solution(),
    solution_stale: false,
    analysis: analysis(),
    analysis_stale: false,
    boundary: boundary(),
    snapshot: snapshot(),
    snapshot_stale: false,
    payload: payload(),
    components_without_limits: 0,
    low_confidence_edges: 1,
    ...overrides,
  };
}

const CONFIG = defaultConfiguration('CBNG_FR1_RRU_EVT2_Baseline_55C');

// --- Test A — Engineering Package (12 §58 A) --------------------------------

describe('Test A — Engineering Package (12 §58 A)', () => {
  it('offers every source artifact and requires confirmation for the WARNING report', () => {
    const input = readiness({ payload: payload('WARNING') });
    const all = evaluateAllArtifacts(input);

    expect(all.pdf_report.status).toBe('WARNING');
    expect(all.temperature_csv.status).toBe('READY');
    expect(all.bottleneck_csv.status).toBe('READY');
    expect(all.network_json.status).toBe('READY');
    expect(all.scenario_json.status).toBe('READY');
    expect(all.png_snapshots.status).toBe('READY');
    expect(all.package_zip.status).toBe('READY');

    const selected = PRESET_ARTIFACTS.engineering_package;
    expect(requiresConfirmation(selected, all)).toBe(true);

    const validation = validateExport({
      ...input,
      selected,
      base_filename: CONFIG.base_filename,
      readiness: all,
      analytical_only: true,
    });
    expect(validation.blocking).toEqual([]);
    expect(validation.warnings.join(' ')).toMatch(/Screen 11 reported WARNING/);
  });

  it('records the warning in the manifest', () => {
    const session = createExportSession({
      project_id: 'CBNG_FR1_RRU_EVT2',
      scenario_id: 'SCN_1',
      solution: solution(),
      analysis: analysis(),
      snapshot: snapshot(),
      payload: payload('WARNING'),
      requests: [{ type: 'pdf_report', filename: 'report.pdf' }],
      now: '2026-08-12T12:50:00.000Z',
    });

    const results: ExportArtifactResult[] = [
      {
        id: 'r1',
        type: 'pdf_report',
        filename: 'report.pdf',
        status: 'WARNING',
        mime_type: 'application/pdf',
        warnings: ['Screen 11 reported WARNING.'],
      },
    ];

    const manifest = buildManifest({
      session,
      results,
      warnings: ['Analytical-only: no FloTHERM or measurement validation exists yet.'],
      now: '2026-08-12T12:50:00.000Z',
    });

    expect(manifest.artifacts).toHaveLength(1);
    expect(manifest.artifacts[0].status).toBe('warning');
    expect(manifest.warnings.join(' ')).toMatch(/Analytical-only/);
    expect(manifest.warnings.join(' ')).toMatch(/Screen 11 reported WARNING/);
    expect(manifest.reportSnapshotId).toBe('SNAP_1');
    expect(manifest.solverVersion).toBe('v1.0');
  });
});

// --- Test B — Stale report only (12 §58 B, §43) -----------------------------

describe('Test B — stale report only (12 §58 B, §43)', () => {
  it('blocks the PDF and leaves the independent artifacts READY', () => {
    const all = evaluateAllArtifacts(readiness({ snapshot_stale: true }));

    expect(all.pdf_report.status).toBe('BLOCKED');
    expect(all.html_report.status).toBe('BLOCKED');
    // §43 — a BLOCKED report takes the PDF down and nothing else.
    expect(all.network_json.status).toBe('READY');
    expect(all.scenario_json.status).toBe('READY');
    expect(all.temperature_csv.status).toBe('READY');
  });

  it('still allows a package built from the artifacts that pass', () => {
    const input = readiness({ snapshot_stale: true });
    const all = evaluateAllArtifacts(input);
    expect(all.package_zip.status).toBe('READY');

    const validation = validateExport({
      ...input,
      selected: ['network_json', 'scenario_json'],
      base_filename: CONFIG.base_filename,
      readiness: all,
      analytical_only: true,
    });
    expect(validation.blocking).toEqual([]);
  });

  it('blocks only when the blocked artifact is actually selected', () => {
    const input = readiness({ snapshot_stale: true });
    const all = evaluateAllArtifacts(input);
    const validation = validateExport({
      ...input,
      selected: ['pdf_report', 'network_json'],
      base_filename: CONFIG.base_filename,
      readiness: all,
      analytical_only: false,
    });
    expect(validation.blocking.join(' ')).toMatch(/PDF Report is BLOCKED/);
  });
});

// --- Test C — Thermal FAIL (12 §58 C, §44) ----------------------------------

describe('Test C — thermal FAIL does not block export (12 §58 C, §44)', () => {
  it('keeps the PDF and the temperature CSV exportable', () => {
    const input = readiness({ snapshot: snapshot('FAIL') });
    const all = evaluateAllArtifacts(input);

    expect(all.pdf_report.status).toBe('READY');
    expect(all.temperature_csv.status).toBe('READY');

    const validation = validateExport({
      ...input,
      selected: ['pdf_report', 'temperature_csv'],
      base_filename: CONFIG.base_filename,
      readiness: all,
      analytical_only: false,
    });
    expect(validation.blocking).toEqual([]);
    // Reported, not blocking.
    expect(validation.warnings.join(' ')).toMatch(/Overall Thermal Status is FAIL/);
  });
});

// --- Test D — Stale 07 (12 §58 D, §45) --------------------------------------

describe('Test D — stale Screen 07 solution (12 §58 D, §45)', () => {
  it('blocks the result artifacts and downgrades the network export to configuration', () => {
    const all = evaluateAllArtifacts(readiness({ solution_stale: true }));

    expect(all.temperature_csv.status).toBe('BLOCKED');
    expect(all.bottleneck_csv.status).toBe('BLOCKED');
    expect(all.png_snapshots.status).toBe('BLOCKED');
    // §45 — the graph is configuration and may still export, clearly marked.
    expect(all.network_json.status).toBe('WARNING');
    expect(all.network_csv.status).toBe('WARNING');
  });

  it('marks the exported document STALE rather than shipping stale temperatures', () => {
    const document = exportNetworkJson({
      project_id: 'CBNG_FR1_RRU_EVT2',
      project_name: 'CBNG FR1 RRU EVT2',
      scenario_id: 'SCN_1',
      scenario_name: 'Baseline 55C',
      network: network(),
      solution: solution(),
      solution_status: 'STALE',
      exported_at: '2026-08-12T12:50:00.000Z',
      export_session_id: 'EXP_1',
    });

    expect(document.solution_status).toBe('STALE');
    expect(document.solution).toBeUndefined();
    expect(document.network.nodes.N_PA_J.name).toBe('PA Junction');
  });

  it('leaves Q and Delta T blank in the node/edge CSV when there is no current solve', () => {
    const tables = exportNetworkCsv({
      network: network(),
      scenario_name: 'Baseline 55C',
      solution: null,
      config: CONFIG,
    });

    const edgeLine = tables.edges.split('\r\n')[1].split(',');
    // …,Active Rth, Rth Source, Q, Delta T, Confidence, Enabled
    expect(edgeLine[7]).toBe('');
    expect(edgeLine[8]).toBe('');
    expect(tables.nodes).toMatch(/N_PA_J/);
  });
});

// --- Test E — one artifact failure (12 §58 E, §30) --------------------------

describe('Test E — one artifact failure (12 §58 E, §30)', () => {
  it('reports PARTIAL when some artifacts succeeded and one failed', () => {
    const status = globalStatus({
      validation: { blocking: [], blocking_zh: [], warnings: [], warnings_zh: [] },
      selected: ['pdf_report', 'temperature_csv'],
      exporting: false,
      results: [{ status: 'FAILED' }, { status: 'EXPORTED' }],
    });
    expect(status).toBe('PARTIAL');
  });

  it('reports FAILED only when nothing succeeded', () => {
    expect(
      globalStatus({
        validation: { blocking: [], blocking_zh: [], warnings: [], warnings_zh: [] },
        selected: ['pdf_report'],
        exporting: false,
        results: [{ status: 'FAILED' }],
      }),
    ).toBe('FAILED');
  });

  it('records the failure in the manifest and omits it from the contents list', () => {
    const session = createExportSession({
      project_id: 'CBNG_FR1_RRU_EVT2',
      scenario_id: 'SCN_1',
      solution: solution(),
      analysis: analysis(),
      snapshot: snapshot(),
      payload: payload(),
      requests: [],
      now: '2026-08-12T12:50:00.000Z',
    });

    const manifest = buildManifest({
      session,
      results: [
        {
          id: 'r1',
          type: 'pdf_report',
          filename: '',
          status: 'FAILED',
          mime_type: 'application/pdf',
          warnings: [],
          error: 'Renderer threw',
        },
        {
          id: 'r2',
          type: 'temperature_csv',
          filename: 'temps.csv',
          status: 'EXPORTED',
          mime_type: 'text/csv',
          warnings: [],
        },
      ],
      warnings: [],
      now: '2026-08-12T12:50:00.000Z',
    });

    expect(manifest.artifacts.map((entry) => entry.filename)).toEqual(['temps.csv']);
    expect(manifest.warnings.join(' ')).toMatch(/PDF Report failed to generate: Renderer threw/);
  });
});

// --- Test F — filename sanitization (12 §58 F, §18, §21) --------------------

describe('Test F — filename sanitization (12 §58 F, §18, §21)', () => {
  it('turns the specification\'s hostile example into a safe slug', () => {
    expect(sanitizeSegment('CBNG / EVT2 : 55C*0mps')).toBe('CBNG_EVT2_55C_0mps');
  });

  it('strips every character a filesystem reserves', () => {
    expect(sanitizeSegment('a\\b/c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('reduces non-ASCII to a safe ASCII slug', () => {
    expect(sanitizeSegment('基準 55C')).toBe('55C');
    expect(sanitizeSegment('Café Ambient')).toBe('Cafe_Ambient');
  });

  it('never leaves leading or trailing separators', () => {
    expect(sanitizeSegment('   spaced out   ')).toBe('spaced_out');
    expect(sanitizeSegment('__weird__')).toBe('weird');
  });

  it('caps the length without corrupting the extension', () => {
    const capped = capLength('x'.repeat(400), 'json');
    expect(capped.endsWith('.json')).toBe(true);
    expect(capped.length).toBeLessThanOrEqual(120);
  });

  it('builds the §18 convention', () => {
    const name = filenameFor('temperature_csv', {
      config: { ...CONFIG, base_filename: 'CBNG_FR1_RRU_EVT2_55C_0mps' },
      project_id: 'CBNG_FR1_RRU_EVT2',
      scenario_name: 'Baseline 55C / 0 m/s',
      now: NOW,
    });
    expect(name).toBe('CBNG_FR1_RRU_EVT2_55C_0mps_Temperature_Results_20260812_1250.csv');
  });

  it('falls back to project and scenario when no base filename is given', () => {
    const name = filenameFor('network_json', {
      config: { ...CONFIG, base_filename: '' },
      project_id: 'CBNG_FR1_RRU_EVT2',
      scenario_name: 'Baseline 55C',
      now: NOW,
    });
    expect(name).toBe('CBNG_FR1_RRU_EVT2_Baseline_55C_Thermal_Network_20260812_1250.json');
  });

  it('honours the timestamp switch', () => {
    const name = filenameFor('network_json', {
      config: { ...CONFIG, base_filename: 'X', timestamp: false },
      project_id: 'P',
      scenario_name: 'S',
      now: NOW,
    });
    expect(name).toBe('X_Thermal_Network.json');
  });

  it('auto-renames a collision instead of overwriting', () => {
    const taken = new Set(['a.csv', 'a_2.csv']);
    expect(uniqueFilename('a.csv', taken)).toBe('a_3.csv');
    expect(uniqueFilename('b.csv', taken)).toBe('b.csv');
  });

  it('formats the timestamp as YYYYMMDD_HHmm', () => {
    expect(timestampOf(new Date('2026-01-05T09:07:00'))).toBe('20260105_0907');
  });

  it('seeds the base filename from project and scenario', () => {
    expect(defaultBaseFilename('CBNG_FR1_RRU_EVT2', 'Baseline 55C / 0 m/s')).toBe(
      'CBNG_FR1_RRU_EVT2_Baseline_55C_0_m_s',
    );
  });
});

// --- serialization contracts ------------------------------------------------

describe('Temperature CSV (12 §10)', () => {
  it('emits §10 columns in §10 order', () => {
    const csv = exportTemperatureCsv({
      project_id: 'CBNG_FR1_RRU_EVT2',
      project_name: 'CBNG FR1 RRU EVT2',
      scenario_name: 'Baseline 55C',
      network: network(),
      solution: solution(),
      components: components(),
      config: { ...CONFIG, csv_include_units: false },
    });

    expect(csv.split('\r\n')[0]).toBe(
      'Project,Scenario,Node ID,Node Name,Component,Category,Node Type,Zone,Temperature,Limit Type,Limit,Margin,Result Source,Solved At',
    );
  });

  it('leaves the margin blank for a node with no limit, never 0', () => {
    const csv = exportTemperatureCsv({
      project_id: 'P',
      project_name: 'P',
      scenario_name: 'S',
      network: network(),
      solution: solution(),
      components: components(),
      config: CONFIG,
    });
    const base = csv.split('\r\n').find((line) => line.includes('Main Base'));
    expect(base).toBeDefined();
    // …,Temperature,Limit Type,Limit,Margin,…
    const cells = (base as string).split(',');
    expect(cells[9]).toBe('');
    expect(cells[10]).toBe('');
    expect(cells[11]).toBe('');
  });

  it('applies the decimal precision to the serialized value only', () => {
    const two = exportTemperatureCsv({
      project_id: 'P',
      project_name: 'P',
      scenario_name: 'S',
      network: network(),
      solution: solution(),
      components: components(),
      config: { ...CONFIG, decimal_precision: 2 },
    });
    const four = exportTemperatureCsv({
      project_id: 'P',
      project_name: 'P',
      scenario_name: 'S',
      network: network(),
      solution: solution(),
      components: components(),
      config: { ...CONFIG, decimal_precision: 4 },
    });
    expect(two).toMatch(/102\.40/);
    expect(four).toMatch(/102\.4000/);
  });

  it('adds units to the header only when asked', () => {
    const withUnits = exportTemperatureCsv({
      project_id: 'P',
      project_name: 'P',
      scenario_name: 'S',
      network: network(),
      solution: solution(),
      components: components(),
      config: { ...CONFIG, csv_include_units: true },
    });
    expect(withUnits.split('\r\n')[0]).toMatch(/Temperature \(°C\)/);
  });
});

describe('CSV encoding (12 §27)', () => {
  it('prefixes a BOM when asked, and not otherwise', () => {
    expect(encodeCsv('a,b\r\n', 'utf8_bom').charCodeAt(0)).toBe(0xfeff);
    expect(encodeCsv('a,b\r\n', 'utf8').charCodeAt(0)).toBe('a'.charCodeAt(0));
  });

  it('quotes a field containing the delimiter or a quote', () => {
    const csv = buildCsv(
      [{ name: 'A, B', note: 'say "hi"' }],
      [
        { header: 'Name', value: (row) => row.name },
        { header: 'Note', value: (row) => row.note },
      ],
      { decimal_precision: 3, csv_include_units: false },
    );
    expect(csv.split('\r\n')[1]).toBe('"A, B","say ""hi"""');
  });
});

describe('Network JSON (12 §11)', () => {
  it('preserves metadata fields this build does not model', () => {
    const document = exportNetworkJson({
      project_id: 'P',
      project_name: 'P',
      scenario_id: 'SCN_1',
      scenario_name: 'S',
      network: network(),
      solution: solution(),
      solution_status: 'SOLVED',
      exported_at: 'now',
      export_session_id: 'EXP_1',
    });

    expect(document.network.edges.E_1.metadata).toEqual({ supplier_note: 'keep me' });
    expect(document.network.metadata).toEqual({ origin: 'unit-test' });
    expect(document.network.edges.E_1.rth.provenance.Analytical?.source).toBe('Analytical');
    expect(document.solution?.node_temperatures_C.N_PA_J).toBe(102.4);
    expect(document.external_cfd_validation).toBe('Deferred');
  });

  it('does not alias the live network', () => {
    const live = network();
    const document = exportNetworkJson({
      project_id: 'P',
      project_name: 'P',
      scenario_id: 'SCN_1',
      scenario_name: 'S',
      network: live,
      solution: null,
      solution_status: 'NONE',
      exported_at: 'now',
      export_session_id: 'EXP_1',
    });
    document.network.nodes.N_PA_J.name = 'mutated';
    expect(live.nodes.N_PA_J.name).toBe('PA Junction');
  });
});

describe('Network CSV (12 §12)', () => {
  it('emits both tables with §12 columns', () => {
    const tables = exportNetworkCsv({
      network: network(),
      scenario_name: 'S',
      solution: solution(),
      config: { ...CONFIG, csv_include_units: false },
    });
    expect(tables.nodes.split('\r\n')[0]).toBe(
      'Node ID,Name,Type,Component,Zone,Power,Limit Type,Limit,Temperature,Scenario',
    );
    expect(tables.edges.split('\r\n')[0]).toBe(
      'Edge ID,From,To,Type,Method,Active Rth,Rth Source,Q,Delta T,Confidence,Enabled',
    );
    expect(tables.edges).toMatch(/52\.130/);
  });
});

describe('Bottleneck CSV (12 §13)', () => {
  it('emits §13 columns and repeats the analysis settings per row', () => {
    const csv = exportBottleneckCsv({
      analysis: analysis(),
      config: { ...CONFIG, csv_include_units: false },
    });
    expect(csv.split('\r\n')[0]).toBe(
      'Rank,Edge ID,Edge,Path,Type,Rth,Q,Delta T,Sensitivity Improvement,Margin Impact,Affected Components,Score,Classification,Confidence,Source,Reduction %,Target Metric',
    );
    const row = csv.split('\r\n')[1];
    expect(row).toMatch(/^1,E_2,/);
    expect(row).toMatch(/Critical/);
    expect(row).toMatch(/20,Worst Component Temperature/);
  });
});

describe('Scenario & Boundary JSON (12 §14)', () => {
  it('carries the scenario inputs, the boundary models and their sources', () => {
    const document = exportScenarioJson({
      project_id: 'P',
      project_name: 'P',
      scenario: scenario(),
      boundary: boundary(),
      exported_at: 'now',
      export_session_id: 'EXP_1',
    });

    expect(document.scenario.ambient_C).toBe(55);
    expect(document.scenario.wind_direction_deg).toBe(180);
    expect(document.scenario).not.toHaveProperty('radiation_reference_C');
    expect(document.boundary?.profiles).toHaveLength(1);
    expect(document.boundary?.sources[0]).toEqual({
      profile_id: 'PRF_1',
      name: 'Natural convection',
      source: 'Assumed',
      confidence: 'medium',
    });
  });

  it('exports the scenario alone when Screen 06 has no boundary set', () => {
    const document = exportScenarioJson({
      project_id: 'P',
      project_name: 'P',
      scenario: scenario(),
      boundary: null,
      exported_at: 'now',
      export_session_id: 'EXP_1',
    });
    expect(document.boundary).toBeNull();
    expect(document.scenario.wind_direction_deg).toBeNull();
  });
});

// --- readiness details ------------------------------------------------------

describe('Per-artifact readiness (12 §3, §4)', () => {
  it('reports NOT_AVAILABLE when the source does not exist', () => {
    const empty = readiness({
      network: null,
      solution: null,
      analysis: null,
      boundary: null,
      payload: null,
      snapshot: null,
    });
    const all = evaluateAllArtifacts(empty);

    expect(all.pdf_report.status).toBe('NOT_AVAILABLE');
    expect(all.temperature_csv.status).toBe('NOT_AVAILABLE');
    expect(all.network_json.status).toBe('NOT_AVAILABLE');
    expect(all.bottleneck_csv.status).toBe('NOT_AVAILABLE');
    expect(all.scenario_json.status).toBe('NOT_AVAILABLE');
    expect(all.package_zip.status).toBe('NOT_AVAILABLE');
    // The manifest describes the session, so it is always producible.
    expect(all.manifest.status).toBe('READY');
  });

  it('always explains a status that is not READY', () => {
    const all = evaluateAllArtifacts(readiness({ solution_stale: true }));
    for (const entry of Object.values(all)) {
      if (entry.status === 'READY') continue;
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.reason_zh.length).toBeGreaterThan(0);
    }
  });

  it('blocks the bottleneck CSV when the analysis predates the current solve', () => {
    expect(evaluateArtifact('bottleneck_csv', readiness({ analysis_stale: true })).status).toBe(
      'BLOCKED',
    );
  });

  it('warns rather than blocks when the boundary set is still a draft', () => {
    expect(
      evaluateArtifact('scenario_json', readiness({ boundary: boundary('draft') })).status,
    ).toBe('WARNING');
  });

  it('warns when the overlay is unavailable but the other views are not', () => {
    const entry = evaluateArtifact('png_snapshots', readiness({ analysis: null }));
    expect(entry.status).toBe('WARNING');
    expect(entry.reason).toMatch(/overlay is unavailable/);
  });
});

describe('Source readiness panel (12 §32)', () => {
  it('reports all seven sources', () => {
    const entries = evaluateSources(readiness());
    expect(entries.map((entry) => entry.key)).toEqual([
      'report',
      'thermal_solution',
      'bottleneck_analysis',
      'temperature_distribution',
      'network_data',
      'scenario_boundary',
      'snapshots',
    ]);
    expect(entries.every((entry) => entry.detail.length > 0)).toBe(true);
  });

  it('follows the solve when it goes stale', () => {
    const entries = evaluateSources(readiness({ solution_stale: true }));
    const byKey = Object.fromEntries(entries.map((entry) => [entry.key, entry.state]));
    expect(byKey.thermal_solution).toBe('BLOCKED');
    expect(byKey.temperature_distribution).toBe('BLOCKED');
    expect(byKey.network_data).toBe('READY');
  });
});

describe('Validation (12 §31)', () => {
  it('blocks an empty selection and an empty filename', () => {
    const input = readiness();
    const validation = validateExport({
      ...input,
      selected: [],
      base_filename: '   ',
      readiness: evaluateAllArtifacts(input),
      analytical_only: false,
    });
    expect(validation.blocking).toHaveLength(2);
    expect(validation.blocking.join(' ')).toMatch(/No artifact is selected/);
    expect(validation.blocking.join(' ')).toMatch(/base filename is empty/);
  });

  it('lists the §31 warnings it is given', () => {
    const input = readiness({ components_without_limits: 3, low_confidence_edges: 2 });
    const validation = validateExport({
      ...input,
      selected: ['network_json'],
      base_filename: 'x',
      readiness: evaluateAllArtifacts(input),
      analytical_only: true,
    });
    const text = validation.warnings.join(' ');
    expect(text).toMatch(/3 component\(s\) lack thermal limits/);
    expect(text).toMatch(/2 critical edge\(s\) use low-confidence Rth/);
    expect(text).toMatch(/Analytical-only/);
    expect(text).toMatch(/External CFD validation is Deferred/);
  });

  it('has a Traditional Chinese line for every English line', () => {
    const input = readiness({ components_without_limits: 1, snapshot_stale: true });
    const validation = validateExport({
      ...input,
      selected: ['pdf_report'],
      base_filename: 'x',
      readiness: evaluateAllArtifacts(input),
      analytical_only: true,
    });
    expect(validation.blocking).toHaveLength(validation.blocking_zh.length);
    expect(validation.warnings).toHaveLength(validation.warnings_zh.length);
  });
});

describe('Export session (12 §47, §48)', () => {
  it('freezes the source ids the manifest later reports', () => {
    const session = createExportSession({
      project_id: 'P',
      project_revision: 'rev:project:phase-1',
      scenario_id: 'SCN_1',
      solution: solution(),
      analysis: analysis(),
      snapshot: snapshot(),
      payload: payload(),
      requests: [{ type: 'temperature_csv' as ArtifactType, filename: 'a.csv' }],
      now: '2026-08-12T12:50:00.000Z',
    });

    expect(session.project_revision).toBe('rev:project:phase-1');
    expect(session.solver_solution_id).toBe('sig-solve-1');
    expect(session.distribution_id).toBe('sig-solve-1');
    expect(session.analysis_id).toBe('RRU::2026-08-12T12:10:00.000Z');
    expect(session.report_snapshot_id).toBe('SNAP_1');
    expect(session.report_config_id).toBe('RPT_1');
    expect(session.status).toBe('READY');
  });

  it('leaves unknown sources undefined rather than inventing an id', () => {
    const session = createExportSession({
      project_id: 'P',
      scenario_id: 'SCN_1',
      solution: null,
      analysis: null,
      snapshot: null,
      payload: null,
      requests: [],
      now: 'now',
    });
    expect(session.solver_solution_id).toBeUndefined();
    expect(session.analysis_id).toBeUndefined();
    expect(session.report_snapshot_id).toBeUndefined();
  });
});

describe('JSON formatting (12 §25)', () => {
  it('honours Pretty and Compact', () => {
    expect(encodeJson({ a: 1 }, 'pretty')).toBe('{\n  "a": 1\n}');
    expect(encodeJson({ a: 1 }, 'compact')).toBe('{"a":1}');
  });
});

describe('Global export status (12 §5)', () => {
  it('is READY when nothing is outstanding and COMPLETE after a clean run', () => {
    const clean = { blocking: [], blocking_zh: [], warnings: [], warnings_zh: [] };
    expect(globalStatus({ validation: clean, selected: ['manifest'], exporting: false, results: [] })).toBe(
      'READY',
    );
    expect(
      globalStatus({
        validation: clean,
        selected: ['manifest'],
        exporting: false,
        results: [{ status: 'EXPORTED' }],
      }),
    ).toBe('COMPLETE');
    expect(
      globalStatus({ validation: clean, selected: [], exporting: true, results: [] }),
    ).toBe('EXPORTING');
  });
});
