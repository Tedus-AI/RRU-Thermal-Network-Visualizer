/**
 * Scenario boundary conditions store — 06 §11, §14.
 *
 * Contracts with the other stores (06 §2.4, §3.2):
 *   networkStore   [read only]  — topology comes from Screen 05 and is never
 *                                 mutated here, not even to record an area;
 *   scenarioStore  [read/write] — ambient/wind/solar are mirrored onto the
 *                                 scenario record so the header and Screen 01
 *                                 keep showing one number, not two;
 *   solverStore    [invalidate] — a boundary change makes any previous solve
 *                                 stale. Screen 06 never solves.
 */

import { create } from 'zustand';

import { loadBoundarySets, saveBoundarySet } from './persistence';
import { useNetworkStore } from './networkStore';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';

import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import { buildAllPreviews, validateBoundarySet } from '@/thermal/boundary/validation';
import { calculateSolarHeatLoad } from '@/thermal/boundary/calculations';
import {
  createBoundarySet,
  emptyValidationState,
  type BoundaryAssignment,
  type BoundaryConditionProfile,
  type BoundaryPort,
  type ScenarioBoundaryConditionSet,
  type SurfaceProperty,
} from '@/thermal/boundary/types';

/**
 * Topology version. Screen 05 does not stamp one, so it is derived from the
 * shape of the graph: if a node or edge is added or removed, the number moves
 * and Screen 06 knows to ask for a revalidation (06 §14.2).
 */
export function topologyVersionOf(network: { nodes: object; edges: object } | null): number {
  if (!network) return 0;
  return Object.keys(network.nodes).length * 1000 + Object.keys(network.edges).length;
}

interface BoundaryStoreState {
  sets: Record<string, ScenarioBoundaryConditionSet>;
  activeKey: string | null;
  ports: BoundaryPort[];
  dirty: boolean;

  loadFor: (projectId: string, scenarioId: string | null) => void;
  clear: () => void;

  current: () => ScenarioBoundaryConditionSet | null;
  mutate: (recipe: (set: ScenarioBoundaryConditionSet) => void) => void;

  setAmbient: (patch: Partial<ScenarioBoundaryConditionSet['ambient']>) => void;
  setSite: (patch: Partial<ScenarioBoundaryConditionSet['site']>) => void;
  upsertProfile: (profile: BoundaryConditionProfile) => void;
  removeProfile: (profileId: string) => void;
  assignProfiles: (portId: string, profileIds: string[]) => void;
  setSurfaceProperty: (property: SurfaceProperty) => void;

  generateDefaults: () => { created: number };
  copyFromScenario: (sourceScenarioId: string) => boolean;
  resetScenario: () => void;

  revalidate: () => void;
  save: (projectId: string) => void;
}

const keyOf = (networkId: string, scenarioId: string) => `${networkId}::${scenarioId}`;

export const useBoundaryStore = create<BoundaryStoreState>((set, get) => ({
  sets: {},
  activeKey: null,
  ports: [],
  dirty: false,

  loadFor: (projectId, scenarioId) => {
    const network = useNetworkStore.getState().network;
    const networkId = network?.network_name ?? 'MAIN';
    const ports = deriveBoundaryPorts(network);

    const stored = loadBoundarySets(projectId);
    const sets: Record<string, ScenarioBoundaryConditionSet> = {};
    for (const entry of stored) sets[keyOf(entry.network_id, entry.scenario_id)] = entry;

    if (!scenarioId) {
      set({ sets, activeKey: null, ports, dirty: false });
      return;
    }

    const key = keyOf(networkId, scenarioId);
    if (!sets[key]) {
      const scenario = useScenarioStore
        .getState()
        .scenarios.find((entry) => entry.id === scenarioId);
      sets[key] = createBoundarySet({
        projectId,
        networkId,
        scenarioId,
        topologyVersion: topologyVersionOf(network),
        ambient_C: scenario?.ambient_C ?? null,
        wind_m_s: scenario?.wind_mps ?? null,
        solar_W_m2: scenario?.solar_W_m2 ?? null,
      });
    }

    set({ sets, activeKey: key, ports, dirty: false });
    get().revalidate();
  },

  clear: () => set({ sets: {}, activeKey: null, ports: [], dirty: false }),

  current: () => {
    const { sets, activeKey } = get();
    return activeKey ? (sets[activeKey] ?? null) : null;
  },

  mutate: (recipe) => {
    const { sets, activeKey } = get();
    if (!activeKey || !sets[activeKey]) return;

    const next: ScenarioBoundaryConditionSet = {
      ...sets[activeKey],
      ambient: { ...sets[activeKey].ambient },
      site: { ...sets[activeKey].site },
      profiles: [...sets[activeKey].profiles],
      assignments: [...sets[activeKey].assignments],
      external_loads: [...sets[activeKey].external_loads],
      derived_preview: [...sets[activeKey].derived_preview],
      surface_properties: [...sets[activeKey].surface_properties],
    };
    recipe(next);
    next.updated_at = new Date().toISOString();

    set({ sets: { ...sets, [activeKey]: next }, dirty: true });
    // `scenarioStore` owns the aggregate scenario revision even though the
    // boundary payload stays in its own store (approved implementation split).
    useScenarioStore.getState().touchScenarioRevision(next.scenario_id);
    // 00 Rule 6 — the boundary problem changed, so any previous solve is stale.
    useSolverStore.getState().invalidate('boundary_changed');
    get().revalidate();
  },

  setAmbient: (patch) => {
    get().mutate((current) => {
      current.ambient = { ...current.ambient, ...patch };
    });

    // Keep the scenario record in step so the shell and Screen 01 do not show a
    // different ambient from the one Screen 07 will solve with.
    const current = get().current();
    if (current && patch.external_ambient_C != null) {
      useScenarioStore
        .getState()
        .updateScenario(
          current.scenario_id,
          { ambient_C: patch.external_ambient_C },
          { skipRevision: true, skipInvalidate: true },
        );
    }
  },

  setSite: (patch) => {
    get().mutate((current) => {
      current.site = { ...current.site, ...patch };
    });

    const current = get().current();
    if (!current) return;
    const scenarioPatch: Record<string, number> = {};
    if (patch.wind_speed_m_s != null) scenarioPatch.wind_mps = patch.wind_speed_m_s;
    if (patch.solar_irradiance_W_m2 != null) {
      scenarioPatch.solar_W_m2 = patch.solar_irradiance_W_m2;
    }
    if (Object.keys(scenarioPatch).length > 0) {
      useScenarioStore
        .getState()
        .updateScenario(
          current.scenario_id,
          scenarioPatch,
          { skipRevision: true, skipInvalidate: true },
        );
    }
  },

  upsertProfile: (profile) =>
    get().mutate((current) => {
      const index = current.profiles.findIndex((entry) => entry.id === profile.id);
      if (index >= 0) current.profiles[index] = profile;
      else current.profiles.push(profile);
    }),

  removeProfile: (profileId) =>
    get().mutate((current) => {
      current.profiles = current.profiles.filter((entry) => entry.id !== profileId);
      current.assignments = current.assignments.map((assignment) => ({
        ...assignment,
        profile_ids: assignment.profile_ids.filter((id) => id !== profileId),
      }));
      current.external_loads = current.external_loads.filter(
        (load) => load.source_profile_id !== profileId,
      );
    }),

  assignProfiles: (portId, profileIds) =>
    get().mutate((current) => {
      const port = get().ports.find((entry) => entry.id === portId);
      const index = current.assignments.findIndex(
        (assignment) => assignment.boundary_port_id === portId,
      );
      const assignment: BoundaryAssignment = {
        id: index >= 0 ? current.assignments[index].id : `BCA_${portId}`,
        boundary_port_id: portId,
        boundary_edge_id: port?.boundary_edge_id,
        profile_ids: profileIds,
        surface_group_id: port?.surface_group_id,
        assignment_mode: 'manual',
        enabled: profileIds.length > 0,
      };
      if (index >= 0) current.assignments[index] = assignment;
      else current.assignments.push(assignment);
    }),

  setSurfaceProperty: (property) =>
    get().mutate((current) => {
      const index = current.surface_properties.findIndex(
        (entry) => entry.surface_group_id === property.surface_group_id,
      );
      if (index >= 0) current.surface_properties[index] = property;
      else current.surface_properties.push(property);
    }),

  /**
   * Fills every unassigned dissipating port with a convection + radiation
   * profile built from the scenario's own numbers. Everything it creates is
   * marked `generated_default` so the engineer can see what to review.
   */
  generateDefaults: () => {
    let created = 0;
    const ports = get().ports;

    get().mutate((current) => {
      for (const port of ports) {
        if (!port.dissipating) continue;
        const existing = current.assignments.find(
          (assignment) => assignment.boundary_port_id === port.id && assignment.enabled,
        );
        if (existing && existing.profile_ids.length > 0) continue;

        const surface = current.surface_properties.find(
          (entry) => entry.surface_group_id === port.surface_group_id,
        );
        const profileId = `BCP_${port.id}_DEFAULT`;
        const profile: BoundaryConditionProfile = {
          id: profileId,
          name: `${port.name} — default convection + radiation`,
          type: 'combined_convection_radiation',
          representation: 'parallel_boundary_edges',
          parameters: {
            // Natural convection in still air, and a mid-range emissivity.
            // Both are assumptions, and both are labelled as such.
            h_W_m2K: (current.site.wind_speed_m_s ?? 0) > 1 ? 25 : 8,
            area_m2: port.area_m2,
            emissivity: surface?.emissivity ?? 0.85,
            viewFactor: 0.9,
            radiationTemperature_C: current.ambient.radiation_surrounding_C ?? current.ambient.external_ambient_C,
          },
          source: 'assumed',
          confidence: 'low',
          provenance: {
            source_label: 'Generated from project defaults',
            reference: '06 §16 Generate Default Profiles',
          },
          external_mappings: { import_status: 'deferred' },
        };

        const index = current.profiles.findIndex((entry) => entry.id === profileId);
        if (index >= 0) current.profiles[index] = profile;
        else current.profiles.push(profile);

        const assignment: BoundaryAssignment = {
          id: `BCA_${port.id}`,
          boundary_port_id: port.id,
          boundary_edge_id: port.boundary_edge_id,
          profile_ids: [profileId],
          surface_group_id: port.surface_group_id,
          assignment_mode: 'generated_default',
          enabled: true,
        };
        const assignmentIndex = current.assignments.findIndex(
          (entry) => entry.boundary_port_id === port.id,
        );
        if (assignmentIndex >= 0) current.assignments[assignmentIndex] = assignment;
        else current.assignments.push(assignment);

        created++;
      }
    });

    return { created };
  },

  /**
   * 06 §14.3 — a copy is INDEPENDENT data. Nothing is shared by reference, so
   * editing the copy can never reach back into the scenario it came from.
   */
  copyFromScenario: (sourceScenarioId) => {
    const { sets, activeKey } = get();
    if (!activeKey) return false;
    const target = sets[activeKey];
    const source = Object.values(sets).find(
      (entry) => entry.scenario_id === sourceScenarioId && entry.network_id === target.network_id,
    );
    if (!source) return false;

    const copied: ScenarioBoundaryConditionSet = {
      ...structuredClone(source),
      id: target.id,
      scenario_id: target.scenario_id,
      project_id: target.project_id,
      network_id: target.network_id,
      created_at: target.created_at,
      updated_at: new Date().toISOString(),
      status: 'needs_review',
      validation: emptyValidationState(),
    };

    set({ sets: { ...sets, [activeKey]: copied }, dirty: true });
    useScenarioStore.getState().touchScenarioRevision(copied.scenario_id);
    useSolverStore.getState().invalidate('boundary_changed');
    get().revalidate();
    return true;
  },

  resetScenario: () => {
    const { sets, activeKey } = get();
    if (!activeKey) return;
    const current = sets[activeKey];
    const fresh = createBoundarySet({
      projectId: current.project_id,
      networkId: current.network_id,
      scenarioId: current.scenario_id,
      topologyVersion: topologyVersionOf(useNetworkStore.getState().network),
    });
    set({ sets: { ...sets, [activeKey]: fresh }, dirty: true });
    useScenarioStore.getState().touchScenarioRevision(fresh.scenario_id);
    useSolverStore.getState().invalidate('boundary_changed');
    get().revalidate();
  },

  revalidate: () => {
    const { sets, activeKey, ports } = get();
    if (!activeKey || !sets[activeKey]) return;

    const network = useNetworkStore.getState().network;
    const current = sets[activeKey];

    const derived = buildAllPreviews(current, ports);

    // Solar is an external heat input, kept out of component power (06 §9.5).
    const loads = current.assignments.flatMap((assignment) => {
      const port = ports.find((entry) => entry.id === assignment.boundary_port_id);
      if (!port || !assignment.enabled) return [];
      return assignment.profile_ids.flatMap((profileId) => {
        const profile = current.profiles.find((entry) => entry.id === profileId);
        if (!profile || profile.type !== 'solar_load') return [];
        const q = calculateSolarHeatLoad({
          irradiance_W_m2: profile.parameters.irradiance_W_m2 as number,
          receivingArea_m2: (profile.parameters.receivingArea_m2 as number) ?? port.area_m2,
          absorptivity: profile.parameters.absorptivity as number,
          projectedAreaFactor: profile.parameters.projectedAreaFactor as number,
          shadingFactor: profile.parameters.shadingFactor as number,
        });
        return [
          {
            id: `LOAD_${port.id}`,
            type: 'solar' as const,
            target_boundary_port_id: port.id,
            target_node_id: port.connected_node_id,
            q_W: q,
            source_profile_id: profile.id,
            inject_in_screen_07: true,
          },
        ];
      });
    });

    const validation = validateBoundarySet({
      set: { ...current, derived_preview: derived },
      ports,
      hasTopology: Boolean(network && Object.keys(network.nodes).length > 0),
      hasScenario: Boolean(current.scenario_id),
      topologyVersion: topologyVersionOf(network),
    });

    const status: ScenarioBoundaryConditionSet['status'] =
      validation.status === 'ready_for_07'
        ? 'ready_for_solve'
        : validation.status === 'warnings'
          ? 'needs_review'
          : 'draft';

    set({
      sets: {
        ...sets,
        [activeKey]: {
          ...current,
          derived_preview: derived,
          external_loads: loads,
          validation,
          status,
        },
      },
    });
  },

  save: (projectId) => {
    const current = get().current();
    if (!current) return;
    saveBoundarySet(projectId, {
      ...current,
      network_topology_version: topologyVersionOf(useNetworkStore.getState().network),
      updated_at: new Date().toISOString(),
    });
    useScenarioStore.getState().persist(projectId);
    set({ dirty: false });
    get().loadFor(projectId, current.scenario_id);
  },
}));
