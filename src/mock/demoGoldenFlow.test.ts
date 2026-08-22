import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { statusOf } from '@/domain/componentReadiness';
import {
  loadAnalyses,
  loadBoundarySets,
  loadComponentRevisions,
  loadComponents,
  loadExportPayloads,
  loadDistributions,
  loadNetwork,
  loadProject,
  loadReportConfigs,
  loadScenarios,
  loadSnapshots,
  loadSolutions,
} from '@/data/persistence';
import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import { validateBoundarySet } from '@/thermal/boundary/validation';
import { topologyVersionOf } from '@/data/boundaryStore';
import { validateGraph } from '@/thermal/graph/graphValidation';
import { evaluateSnapshot } from '@/report/snapshotAdapter';
import { buildResultsOverview } from '@/thermal/overview/overviewAggregator';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { useAnalysisStore } from '@/data/analysisStore';
import { useDistributionStore } from '@/data/distributionStore';
import { useOverviewStore } from '@/data/overviewStore';
import { useSolverStore } from '@/data/solverStore';
import { currentSourceRevision } from '@/data/sourceRevision';
import { sourced } from '@/domain/sourcedValue';
import { activeRth } from '@/thermal/rth';
import { evaluateAllArtifacts } from '@/export/exportValidator';

import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_ID,
  DEMO_SOURCE_REVISION,
} from './demoProject';
import { buildDemoGoldenFlow } from './demoGoldenFlow';
import { seedDemoProject } from './seed';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FR1 RRU Golden Demo', () => {
  it('builds the exact 99 reference population and a fully current 01-12 flow', async () => {
    const flow = await buildDemoGoldenFlow();

    expect(flow.components.map((component) => [component.name, component.qty])).toEqual([
      ['Final PA', 4],
      ['Driver', 4],
      ['RF Filter', 1],
      ['FPGA', 1],
      ['Power Module', 1],
    ]);

    const powerModule = flow.components.find((component) => component.id === 'CMP_POWER_MODULE')!;
    expect(powerModule.thermal_spec).toMatchObject({
      limit_type: 'Ts',
      limit_reference_note: 'Center',
      r_jc_C_per_W: null,
      geometry: {
        package_L_mm: 58,
        package_W_mm: 26,
        source_L_mm: null,
        source_W_mm: null,
      },
      heat_path: { type: 'ModuleSurface' },
      tim: { blt_mm: { value: 1 } },
    });
    expect(powerModule.architecture_prep.template_preference).toBe('MODULE_SURFACE_TIM');

    const moduleNodes = Object.values(flow.network.nodes).filter(
      (node) => node.component_ref === powerModule.id,
    );
    expect(moduleNodes.map((node) => node.type)).toEqual(['case', 'tim_interface']);
    expect(moduleNodes.some((node) => node.type === 'junction')).toBe(false);
    const moduleSurface = moduleNodes.find((node) => node.power_W > 0)!;
    expect(moduleSurface).toMatchObject({ power_W: 20, limit_C: 115, limit_type: 'Ts' });
    expect(flow.solution.node_temperatures_C[moduleSurface.id]).toBeLessThan(
      moduleSurface.limit_C!,
    );

    const moduleEdges = Object.values(flow.network.edges).filter(
      (edge) => edge.origin?.component_id === powerModule.id,
    );
    expect(moduleEdges.some((edge) => edge.type === 'package_rjc')).toBe(false);
    const installedTim = moduleEdges.find((edge) => edge.type === 'tim')!;
    expect(installedTim.parameters).toMatchObject({ thickness_mm: 1, area_mm2: 1508 });
    expect(activeRth(installedTim.rth)).toBeCloseTo(1e-3 / (3 * 1508e-6), 6);

    expect(flow.components.every((component) => statusOf(component) === 'READY')).toBe(true);
    expect(Object.values(flow.network.zones).map((zone) => zone.name).sort()).toEqual([
      'Digital',
      'Power',
      'RF Left',
      'RF Right',
    ]);
    expect(Object.values(flow.network.nodes).filter((node) => node.power_W > 0)).toHaveLength(11);
    expect(flow.networkValidation.errors).toBe(0);
    expect(flow.boundary.status).toBe('ready_for_solve');
    expect(flow.boundary.validation.errors).toHaveLength(0);
    expect(flow.solution.status).toBe('SOLVED');
    expect(flow.solution.metadata.source_revision).toEqual(DEMO_SOURCE_REVISION);
    expect(flow.analysis.state).toBe('COMPLETE');
    expect(flow.analysis.results.length).toBeGreaterThan(0);
    expect(flow.overview.overall_status).toBe('PASS');
    expect(flow.overview.bottleneck_availability).toBe('current');
    expect(flow.overview.distribution).not.toBeNull();
    expect(flow.snapshotEvaluation.state).toBe('CURRENT');
    expect(flow.reportValidation.readiness).toBe('EXPORT_READY');
    expect(flow.reportPayload.readiness).toBe('EXPORT_READY');
    expect(flow.temperatureRowCount).toBeGreaterThanOrEqual(11);
    expect(Object.values(flow.artifacts).every((artifact) => artifact.status === 'READY')).toBe(
      true,
    );
  });

  it('persists every authoritative artifact and reloads it without stale state', async () => {
    await expect(seedDemoProject()).resolves.toBe(DEMO_PROJECT_ID);

    const project = loadProject(DEMO_PROJECT_ID)!;
    const scenario = loadScenarios(DEMO_PROJECT_ID)[0];
    const components = loadComponents(DEMO_PROJECT_ID);
    const network = loadNetwork(DEMO_PROJECT_ID)!;
    const boundary = loadBoundarySets(DEMO_PROJECT_ID)[0];
    const solution = loadSolutions(DEMO_PROJECT_ID)[0];
    const analysis = loadAnalyses(DEMO_PROJECT_ID)[0];
    const distribution = loadDistributions(DEMO_PROJECT_ID)[0];
    const snapshot = loadSnapshots(DEMO_PROJECT_ID)[0];
    const reportConfig = loadReportConfigs(DEMO_PROJECT_ID)[0];
    const payload = loadExportPayloads(DEMO_PROJECT_ID)[0];

    expect(project.revision).toBe(DEMO_SOURCE_REVISION.project_revision);
    expect(scenario.id).toBe(DEMO_SCENARIO_ID);
    expect(loadComponentRevisions(DEMO_PROJECT_ID, components)).toEqual({
      component_revision: DEMO_SOURCE_REVISION.component_revision,
      solver_input_revision: DEMO_SOURCE_REVISION.solver_input_revision,
      limit_revision: DEMO_SOURCE_REVISION.limit_revision,
    });
    expect(validateGraph(network).errors).toBe(0);
    expect(
      validateBoundarySet({
        set: boundary,
        ports: deriveBoundaryPorts(network),
        hasTopology: true,
        hasScenario: true,
        topologyVersion: topologyVersionOf(network),
      }).errors,
    ).toHaveLength(0);
    expect(solution.status).toBe('SOLVED');
    expect(analysis.baseline_signature).toBe(solution.metadata.input_signature);

    const live = buildResultsOverview({
      project_id: project.project_id,
      scenario,
      network,
      solution,
      components,
      analysis,
      distribution_result: distribution,
      distribution_stale: false,
      current_source_revision: DEMO_SOURCE_REVISION,
      solution_stale: false,
      now: '2026-08-13T00:00:00.000Z',
    }).overview;
    expect(evaluateSnapshot(snapshot, live, scenario.name).state).toBe('CURRENT');
    expect(reportConfig.snapshot_id).toBe(snapshot.id);
    expect(payload.snapshot_id).toBe(snapshot.id);
    expect(payload.readiness).toBe('EXPORT_READY');
  });

  it('detects a physics revision mismatch even before the solution signature is refreshed', async () => {
    await seedDemoProject();
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);
    useComponentStore.getState().loadFor(DEMO_PROJECT_ID);
    useNetworkStore.getState().loadFor(DEMO_PROJECT_ID);
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    useSolutionStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    expect(useSolutionStore.getState().isStale()).toBe(false);

    const pa = useComponentStore.getState().byId('CMP_FINAL_PA')!;
    useComponentStore
      .getState()
      .patchComponent(pa.id, { power_W: sourced(99, 'Manual') }, ['power_W']);

    expect(useSolutionStore.getState().isStale()).toBe(true);
    expect(useSolverStore.getState().dirtyReasons).toContain('component_power_changed');
  });

  it('propagates a Limit-only edit through 08-12 without dirtying Screen 07', async () => {
    await seedDemoProject();
    useScenarioStore.getState().loadFor(DEMO_PROJECT_ID);
    useComponentStore.getState().loadFor(DEMO_PROJECT_ID);
    useNetworkStore.getState().loadFor(DEMO_PROJECT_ID);
    useBoundaryStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    useSolutionStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    useAnalysisStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    useDistributionStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);
    useOverviewStore.getState().loadFor(DEMO_PROJECT_ID, DEMO_SCENARIO_ID);

    expect(useAnalysisStore.getState().state()).toBe('COMPLETE');
    expect(useDistributionStore.getState().state()).toBe('CURRENT');
    const pa = useComponentStore.getState().byId('CMP_FINAL_PA')!;
    useComponentStore.getState().patchComponent(
      pa.id,
      {
        thermal_spec: {
          ...pa.thermal_spec,
          limit_C: sourced(80, 'Manual'),
        },
      },
      ['limit_C'],
    );

    expect(useSolverStore.getState().state).toBe('SOLVED');
    expect(useSolutionStore.getState().isStale()).toBe(false);
    expect(useNetworkStore.getState().requiresReview).toBe(false);
    expect(useAnalysisStore.getState().state()).toBe('DIRTY');
    expect(useDistributionStore.getState().state()).toBe('DIRTY');

    const project = loadProject(DEMO_PROJECT_ID)!;
    const scenario = useScenarioStore.getState().activeScenario()!;
    const network = useNetworkStore.getState().network!;
    const solution = useSolutionStore.getState().current()!;
    const analysis = useAnalysisStore.getState().current();
    const distribution = useDistributionStore.getState().current();
    const snapshot = useOverviewStore.getState().current()!;
    const sourceRevision = currentSourceRevision(DEMO_PROJECT_ID, network, scenario);
    const live = buildResultsOverview({
      project_id: project.project_id,
      scenario,
      network,
      solution,
      components: useComponentStore.getState().components,
      analysis,
      distribution_result: distribution,
      distribution_stale: true,
      current_source_revision: sourceRevision,
      solution_stale: false,
    }).overview;
    expect(evaluateSnapshot(snapshot, live, scenario.name).state).toBe('STALE');

    const artifacts = evaluateAllArtifacts({
      network,
      solution,
      solution_stale: false,
      analysis,
      analysis_stale: true,
      distribution,
      distribution_stale: true,
      boundary: useBoundaryStore.getState().current(),
      snapshot,
      snapshot_stale: true,
      payload: loadExportPayloads(DEMO_PROJECT_ID)[0],
      components_without_limits: snapshot.completeness.components_without_limits,
      low_confidence_edges: snapshot.completeness.low_confidence_critical_edges,
    });
    expect(artifacts.temperature_csv.status).toBe('BLOCKED');
    expect(artifacts.bottleneck_csv.status).toBe('BLOCKED');
    expect(artifacts.pdf_report.status).toBe('BLOCKED');
    expect(artifacts.network_json.status).toBe('READY');
  });
});
