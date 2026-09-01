import { describe, expect, it } from 'vitest';

import { deriveBoundaryPorts, finRootLinkOf } from '@/thermal/boundary/boundaryPorts';
import { defaultMaterials } from '@/domain/materials';
import { buildSolveInput } from '@/thermal/solver/buildSolveInput';
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
      emissivity: 0.86,
      area_m2: 0.42,
      ambient_C: 55,
      source: 'stated',
      resolved: true,
    });
    // One edge carrying both mechanisms rests on h_conv + h_rad, and the
    // reported h is the one the resistance follows from. Reporting the stated
    // 18 alone would be a coefficient that does not reproduce its own row.
    expect(view.h_conv_W_m2K).toBe(18);
    expect(view.h_rad_W_m2K).toBeGreaterThan(0);
    expect(view.h_W_m2K).toBeCloseTo(18 + view.h_rad_W_m2K!, 10);
    expect(view.rth_C_per_W).toBeCloseTo(1 / (view.h_W_m2K! * view.area_m2!), 10);
    expect(edge.resolution).toBe('unresolved');
    expect(edge.rth.analytical).toBeNull();
  });

  it('returns no scenario values before a Screen 06 set exists', () => {
    const graph = network();
    expect(projectScenarioBoundaryEdges(graph, deriveBoundaryPorts(graph), null).size).toBe(0);
  });

  describe('a fin-derived boundary', () => {
    /**
     * A profile that states fin geometry AND still carries the `h_W_m2K` and
     * `area_m2` from the manual setup it replaced — the exact shape of a real
     * project's saved file, and the one that made Screen 05 show 8.00 W/m²·K
     * over 0.890 m² next to a resistance neither produces.
     */
    function finSetup() {
      const graph = network();
      const ports = deriveBoundaryPorts(graph);
      const surface = ports.find((port) => port.dissipating)!;
      const profile: BoundaryConditionProfile = {
        id: 'BCP_FIN',
        name: 'Finned surface',
        type: 'combined_convection_radiation',
        representation: 'single_combined_edge',
        parameters: {
          // Stale manual leftovers. Nothing below reads them.
          h_W_m2K: 8,
          area_m2: 0.89,
          emissivity: 0.85,
          viewFactor: 0.3,
          finGeometryEnabled: true,
          finBaseLength_mm: 336,
          finBaseWidth_mm: 275,
          finHeight_mm: 55.86,
          finGap_mm: 11.66,
          finThickness_mm: 1.2,
        },
        source: 'manual',
        confidence: 'high',
      };
      const set = createBoundarySet({
        projectId: 'P',
        networkId: graph.network_name,
        scenarioId: 'SCN_45C',
        topologyVersion: 1,
        ambient_C: 45,
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
      return { graph, ports, set, surface };
    }

    it('reports the coefficients and area the geometry produced, not the stale stored ones', () => {
      const { graph, ports, set, surface } = finSetup();
      const view = projectScenarioBoundaryEdges(graph, ports, set).get(surface.boundary_edge_id!)!;

      expect(view.source).toBe('fin_geometry');
      expect(view.h_conv_W_m2K).toBeCloseTo(6.23, 2);
      expect(view.h_rad_W_m2K).toBeCloseTo(2.4, 10);
      expect(view.area_m2).toBeCloseTo(0.918, 3);
      // None of the three stale numbers survives into the display.
      expect(view.h_W_m2K).not.toBeCloseTo(8, 3);
      expect(view.area_m2).not.toBeCloseTo(0.89, 3);
      // The fin's radiation fit already contains the emissivity, so claiming
      // the stored 0.85 as an input would name something the result never saw.
      expect(view.emissivity).toBeNull();
      // The identity a reader checks by hand.
      expect(view.rth_C_per_W).toBeCloseTo(1 / (view.h_W_m2K! * view.area_m2!), 10);
    });

    it('projects the fin conduction onto the root link the solver overrides', () => {
      const { graph, ports, set, surface } = finSetup();
      const projected = projectScenarioBoundaryEdges(graph, ports, set);
      const link = finRootLinkOf(graph, surface.connected_node_id)!;
      const view = projected.get(link.id)!;

      expect(view.kind).toBe('fin_conduction');
      expect(view.fin?.eta_fin).toBeCloseTo(0.93, 2);
      expect(view.fin!.tipExcessRatio).toBeLessThan(1);
      expect(view.rth_C_per_W).toBeGreaterThan(0);

      // Same number, same edge, as the solve clone gets. If these two ever
      // disagreed the graph would annotate one resistance and the solver would
      // apply another, with nothing on screen to reveal it.
      const solve = buildSolveInput({
        network: graph,
        boundarySet: set,
        ports,
        scenarioId: set.scenario_id,
        materials: defaultMaterials(),
      });
      const overridden =
        solve.network.edges[link.id].scenario_overrides?.[set.scenario_id]?.R_C_per_W;
      expect(overridden).toBeCloseTo(view.rth_C_per_W!, 10);

      // The boundary edge keeps the bare-h surface resistance, and the two
      // together are exactly the fin result.
      const boundary = projected.get(surface.boundary_edge_id!)!;
      expect(view.rth_C_per_W! + boundary.rth_C_per_W!).toBeCloseTo(
        1 / (boundary.h_W_m2K! * boundary.area_m2! * view.fin!.effectiveness),
        10,
      );

      // The stored topology stays isothermal and scenario-independent.
      expect(graph.edges[link.id].parameters?.ideal_link).toBe(true);
      expect(graph.edges[link.id].scenario_overrides).toBeUndefined();
    });
  });
});

