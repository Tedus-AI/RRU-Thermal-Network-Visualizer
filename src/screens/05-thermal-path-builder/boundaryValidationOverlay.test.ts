import { describe, expect, it } from 'vitest';

import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import { buildDerivedPreview } from '@/thermal/boundary/calculations';
import { createBoundarySet, type BoundaryConditionProfile } from '@/thermal/boundary/types';
import { validateGraph } from '@/thermal/graph/graphValidation';
import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork } from '@/thermal/types';

import { applyBoundaryValidationOverlay } from './boundaryValidationOverlay';

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

describe('Screen 05 active-scenario boundary validation overlay', () => {
  it('removes completed Screen 06 boundary and placeholder warnings without changing the graph', () => {
    const graph = network();
    const raw = validateGraph(graph);
    const ports = deriveBoundaryPorts(graph);
    const surface = ports.find((port) => port.dissipating)!;
    const profile: BoundaryConditionProfile = {
      id: 'BCP_FIN',
      name: 'Fin convection',
      type: 'convection_to_ambient',
      representation: 'parallel_boundary_edges',
      parameters: { h_W_m2K: 18, area_m2: 0.42 },
      source: 'manual',
      confidence: 'high',
    };
    const set = createBoundarySet({
      projectId: 'P',
      networkId: graph.network_name,
      scenarioId: 'SCN',
      topologyVersion: 1,
      ambient_C: 55,
      wind_m_s: 3,
      solar_W_m2: 0,
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
    set.derived_preview = [buildDerivedPreview(surface, [profile], { ambient_C: 55 })];

    expect(raw.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['BOUNDARY_NOT_CONFIGURED', 'BOUNDARY_PLACEHOLDER']),
    );
    const displayed = applyBoundaryValidationOverlay(raw, graph, ports, set)!;
    expect(displayed.issues.map((issue) => issue.code)).not.toContain('BOUNDARY_NOT_CONFIGURED');
    expect(displayed.issues.map((issue) => issue.code)).not.toContain('BOUNDARY_PLACEHOLDER');
    expect(graph.edges[surface.boundary_edge_id!].resolution).toBe('unresolved');
  });

  it('keeps the warnings while Screen 06 has blocking errors', () => {
    const graph = network();
    const raw = validateGraph(graph);
    const ports = deriveBoundaryPorts(graph);
    const set = createBoundarySet({
      projectId: 'P',
      networkId: graph.network_name,
      scenarioId: 'SCN',
      topologyVersion: 1,
      ambient_C: 55,
      wind_m_s: 3,
      solar_W_m2: 0,
    });
    set.validation.errors = [
      { id: 'BLOCKED', severity: 'error', message: 'blocked', message_zh: '未完成' },
    ];

    expect(applyBoundaryValidationOverlay(raw, graph, ports, set)).toEqual(raw);
  });
});
