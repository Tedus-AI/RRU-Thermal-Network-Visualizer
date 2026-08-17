/**
 * Executable, non-confidential Golden Demo for the 01 -> 12 product flow.
 *
 * The fixture deliberately uses the same builders, validators, solver,
 * bottleneck analysis and report adapters as the UI. A seeded result is
 * therefore reproducible product output, not a hand-authored screenshot prop.
 * Screen 03 remains metadata-only and is not involved in this flow.
 */

import type { Component } from '@/domain/component';
import { valueOf } from '@/domain/sourcedValue';
import type { ComponentRevisionSet } from '@/domain/revision';
import { topologyVersionOf } from '@/data/boundaryStore';
import {
  DEFAULT_SOLVER_SETTINGS,
  type NodeCategory,
  type ThermalEdge,
  type ThermalNetwork,
  type ThermalNode,
} from '@/thermal/types';
import { createRth } from '@/thermal/rth';
import { buildComponentSubgraph } from '@/thermal/graph/networkBuilder';
import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import { validateGraph, type GraphValidationResult } from '@/thermal/graph/graphValidation';
import { zoneNodeId } from '@/thermal/graph/idFactory';
import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import {
  BOUNDARY_SET_SCHEMA_VERSION,
  type BoundaryConditionProfile,
  type ScenarioBoundaryConditionSet,
} from '@/thermal/boundary/types';
import { buildAllPreviews, validateBoundarySet } from '@/thermal/boundary/validation';
import { solveScenario } from '@/thermal/solver/solveScenario';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import {
  defaultSettings,
  type BottleneckAnalysis,
} from '@/thermal/analysis/analysisTypes';
import { runAnalysis } from '@/thermal/analysis/bottleneckScore';
import {
  buildDistributionResult,
  type TemperatureDistributionResult,
} from '@/thermal/analysis/distributionResult';
import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';
import type {
  ResultsOverview,
  ResultsOverviewSnapshot,
} from '@/thermal/overview/overviewTypes';
import { buildSnapshot } from '@/thermal/overview/snapshotBuilder';
import { createReportConfig } from '@/report/defaultTemplate';
import type {
  ReportExportPayload,
  ReportValidation,
  ThermalReportConfig,
} from '@/report/reportTypes';
import { evaluateSnapshot, type SnapshotEvaluation } from '@/report/snapshotAdapter';
import { validateReport } from '@/report/reportValidator';
import { paginate } from '@/report/pagination';
import { buildExportPayload } from '@/report/exportPayloadBuilder';
import { evaluateAllArtifacts, type ArtifactReadiness } from '@/export/exportValidator';
import type { ArtifactType } from '@/export/exportTypes';

import {
  DEMO_NETWORK_ID,
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_ID,
  DEMO_SOURCE_REVISION,
  DEMO_TIMESTAMP,
  demoComponents,
  demoProject,
  demoScenario,
} from './demoProject';

const DEMO_ZONE_IDS = {
  'RF Left': zoneNodeId('RF_LEFT'),
  'RF Right': zoneNodeId('RF_RIGHT'),
  Digital: zoneNodeId('DIGITAL'),
  Power: zoneNodeId('POWER'),
} as const;

const ZONE_COLUMNS: Record<string, number> = {
  [DEMO_ZONE_IDS['RF Left']]: 180,
  [DEMO_ZONE_IDS['RF Right']]: 520,
  [DEMO_ZONE_IDS.Digital]: 860,
  [DEMO_ZONE_IDS.Power]: 1180,
};

function demoRth(value: number, reference: string) {
  const result = createRth(value, 'Analytical', 'high', reference);
  if (result.provenance.Analytical) {
    result.provenance.Analytical.timestamp = DEMO_TIMESTAMP;
  }
  return result;
}

function componentNodeCategory(component: Component): NodeCategory {
  switch (component.category) {
    case 'Digital':
      return 'DIGITAL';
    case 'Power':
      return 'POWER';
    case 'Filter':
      return 'FILTER';
    case 'RF':
      return 'RF';
    default:
      return 'MECH';
  }
}

function localResistance(edge: ThermalEdge): number {
  switch (edge.type) {
    case 'package_rjc':
      return 0.3;
    case 'tim':
      return 0.04;
    case 'solder':
      return 0.025;
    case 'thermal_via':
      return 0.12;
    case 'contact':
      return 0.035;
    case 'heat_pipe':
      return 0.02;
    case 'conduction':
      return 0.07;
    default:
      return 0.08;
  }
}

function structureResistance(edge: ThermalEdge): number {
  if (edge.from.startsWith('NODE_ZONE_')) return 0.055;
  if (edge.from === 'NODE_HSK_BASE') return 0.035;
  if (edge.from === 'NODE_FIN_ROOT') return 0.025;
  return 0.06;
}

function positionNetworkNodes(nodes: ThermalNode[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const localIndexByZone = new Map<string, number>();

  for (const node of nodes) {
    const zoneId = node.zone_id ?? '';
    if (zoneId && ZONE_COLUMNS[zoneId] != null && node.origin?.kind === 'template') {
      const localIndex = localIndexByZone.get(zoneId) ?? 0;
      const position = {
        x: ZONE_COLUMNS[zoneId] + (localIndex % 5) * 92,
        y: 100 + Math.floor(localIndex / 5) * 72,
      };
      positions[node.id] = position;
      node.position = position;
      localIndexByZone.set(zoneId, localIndex + 1);
      continue;
    }

    const sharedPosition: Record<string, { x: number; y: number }> = {
      [DEMO_ZONE_IDS['RF Left']]: { x: 260, y: 620 },
      [DEMO_ZONE_IDS['RF Right']]: { x: 560, y: 620 },
      [DEMO_ZONE_IDS.Digital]: { x: 860, y: 620 },
      [DEMO_ZONE_IDS.Power]: { x: 1160, y: 620 },
      NODE_HSK_BASE: { x: 700, y: 760 },
      NODE_FIN_ROOT: { x: 700, y: 870 },
      NODE_FIN_SURFACE: { x: 700, y: 980 },
      NODE_AMBIENT_PLACEHOLDER: { x: 700, y: 1090 },
    };
    const position = sharedPosition[node.id] ?? { x: 700, y: 720 };
    positions[node.id] = position;
    node.position = position;
  }

  return positions;
}

/** Screen 05 topology generated from the Screen 04 component preferences. */
export function demoNetwork(components = demoComponents()): ThermalNetwork {
  const structure = buildSharedStructure('FUNCTIONAL_ZONES');
  const filterZoneId = zoneNodeId('FILTER');
  const nodes = structure.nodes.filter((node) => node.id !== filterZoneId);
  const edges = structure.edges.filter(
    (edge) => edge.from !== filterZoneId && edge.to !== filterZoneId,
  );
  const zones = structure.zones.filter((zone) => zone.id !== filterZoneId);
  const templates: ThermalNetwork['templates'] = {};

  for (const edge of edges) {
    if (edge.method === 'convection_hA') {
      edge.rth = createRth(
        null,
        'Analytical',
        'high',
        'Resolved from the scenario profile owned by Screen 06',
      );
      edge.confidence = 'high';
      continue;
    }
    edge.rth = demoRth(
      structureResistance(edge),
      'Synthetic shared-structure analytical characterization',
    );
    edge.resolution = 'resolved';
    edge.resolution_note = undefined;
    edge.confidence = 'high';
  }

  for (const component of components) {
    const zoneId = DEMO_ZONE_IDS[component.architecture_prep.preferred_base_zone as keyof typeof DEMO_ZONE_IDS];
    if (!zoneId) throw new Error(`Golden Demo component ${component.id} has no supported zone.`);

    const subgraph = buildComponentSubgraph(component, {
      templateId: component.architecture_prep.template_preference,
      qtyModel:
        component.architecture_prep.qty_model_preference === 'DECIDE_LATER'
          ? 'AGGREGATE'
          : component.architecture_prep.qty_model_preference,
      suggestedZoneNodeId: zoneId,
    });
    if (!subgraph) throw new Error(`Golden Demo template failed for ${component.id}.`);

    templates[component.id] = { ...subgraph.binding, applied_at: DEMO_TIMESTAMP };
    for (const node of subgraph.nodes) {
      node.category = componentNodeCategory(component);
      node.zone = component.architecture_prep.preferred_base_zone;
      node.zone_id = zoneId;

      const connectedPorts = (node.ports ?? []).map((port) => ({
        ...port,
        connected_to: zoneId,
      }));
      node.ports = connectedPorts;
      nodes.push(node);

      for (const port of connectedPorts) {
        edges.push({
          id: `EDGE_PORT_${node.id.replace(/^NODE_/, '')}_${port.kind}`,
          from: node.id,
          to: zoneId,
          type: 'contact',
          method: 'direct_rth',
          rth: demoRth(0.03, 'Synthetic component-to-zone interface characterization'),
          parameters: { R_C_per_W: 0.03 },
          heat_flow_W: null,
          delta_T_C: null,
          resolution: 'resolved',
          enabled: true,
          confidence: 'high',
          origin: {
            kind: 'template',
            template_id: subgraph.binding.template_id,
            template_version: subgraph.binding.template_version,
            component_id: component.id,
          },
        });
      }
    }

    for (const edge of subgraph.edges) {
      const componentRjc = valueOf(component.thermal_spec.r_jc_C_per_W);
      const resistance =
        edge.type === 'package_rjc' && componentRjc != null
          ? componentRjc
          : localResistance(edge);
      edges.push({
        ...edge,
        parameter_links: edge.type === 'package_rjc' ? edge.parameter_links : undefined,
        rth: demoRth(resistance, 'Synthetic component thermal-path characterization'),
        resolution: 'resolved',
        resolution_note: undefined,
        confidence: 'high',
      });
    }
  }

  const positions = positionNetworkNodes(nodes);
  const network: ThermalNetwork = {
    schema_version: '1.0',
    project_id: DEMO_PROJECT_ID,
    revision: DEMO_SOURCE_REVISION.network_revision,
    network_name: DEMO_NETWORK_ID,
    mode: 'analytical',
    status: 'VALID',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(edges.map((edge) => [edge.id, edge])),
    templates,
    zones: Object.fromEntries(zones.map((zone) => [zone.id, zone])),
    layout: { mode: 'Manual', positions },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
    metadata: {
      fixture: 'FR1_RRU_GOLDEN_DEMO',
      non_confidential: true,
      flotherm_import: 'Deferred',
      updated_at: DEMO_TIMESTAMP,
    },
  };

  const validation = validateGraph(network);
  if (validation.errors > 0) {
    throw new Error(`Golden Demo topology is invalid: ${validation.errors} blocking issue(s).`);
  }
  return network;
}

/** Screen 06 scenario overlay for the shared HSK surface. */
export function demoBoundarySet(network: ThermalNetwork): ScenarioBoundaryConditionSet {
  const ports = deriveBoundaryPorts(network);
  const hskPort = ports.find((port) => port.dissipating);
  if (!hskPort) throw new Error('Golden Demo has no dissipating HSK boundary port.');

  const profile: BoundaryConditionProfile = {
    id: 'BCP_HSK_NATURAL_CONVECTION_RADIATION',
    name: 'Shared HSK Natural Convection + Radiation',
    type: 'combined_convection_radiation',
    representation: 'single_combined_edge',
    parameters: {
      h_W_m2K: 12,
      area_m2: 2,
      emissivity: 0.85,
      viewFactor: 1,
      surfaceReferenceTemperatureGuess_C: 80,
    },
    source: 'analytical',
    confidence: 'high',
    provenance: {
      source_label: 'Synthetic Golden Demo boundary characterization',
      reference: 'DEMO-BC-001',
      author: 'Thermal Engineering Demo',
      created_at: DEMO_TIMESTAMP,
    },
    external_mappings: { import_status: 'deferred' },
  };

  const topologyVersion = topologyVersionOf(network);
  let set: ScenarioBoundaryConditionSet = {
    id: `BCS_${DEMO_PROJECT_ID}_${DEMO_SCENARIO_ID}`,
    schema_version: BOUNDARY_SET_SCHEMA_VERSION,
    project_id: DEMO_PROJECT_ID,
    network_id: DEMO_NETWORK_ID,
    scenario_id: DEMO_SCENARIO_ID,
    network_topology_version: topologyVersion,
    status: 'draft',
    ambient: {
      external_ambient_C: 55,
      internal_air_C: null,
      radiation_surrounding_C: 55,
      source: 'analytical',
      confidence: 'high',
      provenance: {
        source_label: 'Synthetic baseline scenario',
        reference: 'DEMO-SCN-001',
        created_at: DEMO_TIMESTAMP,
      },
    },
    site: {
      altitude_m: 0,
      wind_speed_m_s: 0,
      wind_direction_deg: null,
      airflow_mode: 'natural',
      convection_method: 'manual_h',
      solar_enabled: false,
      solar_irradiance_W_m2: 0,
      solar_incidence_deg: null,
      notes: 'Synthetic indoor no-solar baseline.',
    },
    profiles: [profile],
    assignments: [
      {
        id: 'BCA_HSK_SHARED',
        boundary_port_id: hskPort.id,
        boundary_edge_id: hskPort.boundary_edge_id,
        profile_ids: [profile.id],
        surface_group_id: hskPort.surface_group_id,
        assignment_mode: 'manual',
        enabled: true,
      },
    ],
    external_loads: [],
    derived_preview: [],
    validation: { status: 'blocked', errors: [], warnings: [], infos: [] },
    surface_properties: [
      {
        surface_group_id: hskPort.surface_group_id,
        name: 'Black anodized shared HSK',
        emissivity: 0.85,
        absorptivity: 0.85,
        color: '#334155',
        source: 'datasheet',
      },
    ],
    created_at: DEMO_TIMESTAMP,
    updated_at: DEMO_TIMESTAMP,
    updated_by: 'Golden Demo Seeder',
    source_screen: '06_Boundary_Conditions',
  };

  set = { ...set, derived_preview: buildAllPreviews(set, ports) };
  const validation = validateBoundarySet({
    set,
    ports,
    hasTopology: true,
    hasScenario: true,
    topologyVersion,
  });
  set = {
    ...set,
    validation,
    status: validation.errors.length === 0 ? 'ready_for_solve' : 'needs_review',
  };
  if (validation.errors.length > 0) {
    throw new Error(`Golden Demo boundary is invalid: ${validation.errors.length} error(s).`);
  }
  return set;
}

export interface DemoGoldenFlow {
  components: Component[];
  componentRevisions: ComponentRevisionSet;
  network: ThermalNetwork;
  networkValidation: GraphValidationResult;
  boundary: ScenarioBoundaryConditionSet;
  solution: ThermalSolution;
  analysis: BottleneckAnalysis;
  distribution: TemperatureDistributionResult;
  overview: ResultsOverview;
  snapshot: ResultsOverviewSnapshot;
  snapshotEvaluation: SnapshotEvaluation;
  reportConfig: ThermalReportConfig;
  reportValidation: ReportValidation;
  reportPayload: ReportExportPayload;
  artifacts: Record<ArtifactType, ArtifactReadiness>;
  temperatureRowCount: number;
}

/** Builds and validates every persisted artifact needed by Screens 01-12. */
export async function buildDemoGoldenFlow(): Promise<DemoGoldenFlow> {
  const project = demoProject();
  const scenario = demoScenario();
  const components = demoComponents();
  const componentRevisions: ComponentRevisionSet = {
    component_revision: DEMO_SOURCE_REVISION.component_revision,
    solver_input_revision: DEMO_SOURCE_REVISION.solver_input_revision,
    limit_revision: DEMO_SOURCE_REVISION.limit_revision,
  };
  const network = demoNetwork(components);
  const networkValidation = validateGraph(network);
  const boundary = demoBoundarySet(network);
  const ports = deriveBoundaryPorts(network);
  const solve = solveScenario({
    network,
    components,
    boundarySet: boundary,
    ports,
    scenarioId: scenario.id,
    sourceRevision: DEMO_SOURCE_REVISION,
    powerScale: scenario.power_scale,
  });
  if (solve.solution.status === 'FAILED') {
    const reasons = solve.checks.errors.map((issue) => issue.message).join('; ');
    throw new Error(`Golden Demo analytical solve failed: ${reasons || 'unknown solver error'}`);
  }

  const analysis = await runAnalysis(
    {
      project_id: project.project_id,
      network_id: network.network_name,
      scenario_id: scenario.id,
      network,
      components,
      sourceRevision: DEMO_SOURCE_REVISION,
      baselineInput: solve.input,
      baselineSolution: solve.solution,
      settings: defaultSettings(),
      solverSettings: network.solver_settings,
    },
    { yieldEvery: 100 },
  );
  if (analysis.state === 'FAILED' || analysis.results.length === 0) {
    throw new Error('Golden Demo bottleneck analysis did not produce usable results.');
  }

  const distribution = buildDistributionResult({
    projectId: project.project_id,
    network,
    solution: solve.solution,
    components,
    sourceRevision: DEMO_SOURCE_REVISION,
    now: DEMO_TIMESTAMP,
    id: `DST_${DEMO_SCENARIO_ID}_GOLDEN_DEMO`,
  });

  const overviewResult = buildResultsOverview({
    project_id: project.project_id,
    scenario,
    network,
    solution: solve.solution,
    components,
    analysis,
    distribution_result: distribution,
    distribution_stale: false,
    current_source_revision: DEMO_SOURCE_REVISION,
    solution_stale: false,
    now: DEMO_TIMESTAMP,
  });
  const overview = overviewResult.overview;
  const snapshot = buildSnapshot(overview, {
    id: `SNAP_${DEMO_SCENARIO_ID}_GOLDEN_DEMO`,
    created_by: 'Golden Demo Seeder',
    now: DEMO_TIMESTAMP,
  });
  const snapshotEvaluation = evaluateSnapshot(snapshot, overview, scenario.name);
  const reportConfig = createReportConfig({
    project_id: project.project_id,
    project_name: project.project_name,
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    snapshot_id: snapshot.id,
    prepared_by: 'Thermal Engineering Demo',
    now: DEMO_TIMESTAMP,
  });
  const reportValidation = validateReport({
    config: reportConfig,
    evaluation: snapshotEvaluation,
    project_name: project.project_name,
    project_id: project.project_id,
    scenario_name: scenario.name,
  });
  if (reportValidation.readiness === 'BLOCKED') {
    throw new Error(`Golden Demo report is blocked: ${reportValidation.blocking.join('; ')}`);
  }

  const pages = paginate(reportConfig.sections, {
    critical: snapshot.critical_components.length,
    bottleneck: snapshot.bottlenecks.length,
    hot_nodes: overviewResult.rows.filter(
      (row) => row.status === 'near_limit' || row.status === 'over_limit',
    ).length,
  });
  const reportPayload = buildExportPayload({
    config: reportConfig,
    snapshot_id: snapshot.id,
    readiness: reportValidation.readiness,
    estimated_page_count: pages.length,
    now: DEMO_TIMESTAMP,
  });
  const artifacts = evaluateAllArtifacts({
    network,
    solution: solve.solution,
    solution_stale: false,
    analysis,
    analysis_stale: false,
    distribution,
    distribution_stale: false,
    boundary,
    snapshot,
    snapshot_stale: false,
    payload: reportPayload,
    components_without_limits: overview.completeness.components_without_limits,
    low_confidence_edges: overview.completeness.low_confidence_critical_edges,
  });

  if (Object.values(artifacts).some((artifact) => artifact.status === 'BLOCKED')) {
    throw new Error('Golden Demo contains a blocked Screen 12 artifact.');
  }

  return {
    components,
    componentRevisions,
    network,
    networkValidation,
    boundary,
    solution: solve.solution,
    analysis,
    distribution,
    overview,
    snapshot,
    snapshotEvaluation,
    reportConfig,
    reportValidation,
    reportPayload,
    artifacts,
    temperatureRowCount: overviewResult.rows.length,
  };
}
