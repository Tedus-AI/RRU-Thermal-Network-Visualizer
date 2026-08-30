import { describe, expect, it } from 'vitest';

import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import {
  createBoundarySet,
  type BoundaryConditionProfile,
} from '@/thermal/boundary/types';
import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork } from '@/thermal/types';

import { projectScenarioBoundaryEdges } from './scenarioBoundaryProjection';

function network(): ThermalNetwork {
  const structure = buildSharedStructure('SINGLE_MAIN_BASE');
  return {
    schema_version: '1.0',
    project_id: 'P',
    revision: 'R',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'DRAFT',
    nodes: Object.fromEntries(structure.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(structure.edges.map((edge) => [edge.id, edge])),
    templates: {},
    zones: Object.fromEntries(structure.zones.map((zone) => [zone.id, zone])),
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

describe('Screen 06 boundary projection onto Screen 05', () => {
  it('shows the current scenario preview without resolving or rewriting the topology edge', () => {
    const graph = network();
    const ports = deriveBoundaryPorts(graph);
    const surface = ports.find((port) => port.dissipating)!;
    const edge = graph.edges[surface.boundary_edge_id!];
    const profile: BoundaryConditionProfile = {
      id: 'BCP_FIN',
      name: 'Fin convection and radiation',
      type: 'combined_convection_radiation',
      representation: 'single_combined_edge',
      parameters: {
        h_W_m2K: 18,
        emissivity: 0.86,
        viewFactor: 0.9,
        area_m2: 0.42,
        surfaceReferenceTemperatureGuess_C: 85,
      },
      source: 'manual',
      confidence: 'high',
    };
    const set = createBoundarySet({
      projectId: 'P',
      networkId: graph.network_name,
      scenarioId: 'SCN_55C',
      topologyVersion: 1,
      ambient_C: 55,
    });
    set.profiles = [profile];
    set.assignments = [
      {
        id: 'BCA_FIN',
        boundary_port_id: surface.id,
        boundary_edge_id: surface.boundary_edge_id,
        profile_ids: [profile.id],
        surface_group_id: surface.surface_group_id,
        assignment_mode: 'manual',
        enabled: true,
      },
    ];

    const view = projectScenarioBoundaryEdges(graph, ports, set).get(edge.id)!;

    expect(view).toMatchObject({
      edge_id: edge.id,
      scenario_id: 'SCN_55C',
      kind: 'combined',
      h_W_m2K: 18,
      emissivity: 0.86,
      area_m2: 0.42,
      ambient_C: 55,
      resolved: true,
    });
    expect(view.rth_C_per_W).toBeGreaterThan(0);
    expect(view.rth_C_per_W).toBeLessThan(1 / (18 * 0.42));
    expect(edge.resolution).toBe('unresolved');
    expect(edge.rth.analytical).toBeNull();
  });

  it('returns no scenario values before a Screen 06 set exists', () => {
    const graph = network();
    expect(projectScenarioBoundaryEdges(graph, deriveBoundaryPorts(graph), null).size).toBe(0);
  });
});

