/**
 * Scenario boundary conditions store — 06 §11, §14.
 *
 * Contracts with the other stores (06 §2.4, §3.2):
 *   networkStore   [read only]  — topology comes from Screen 05 and is never
 *                                 mutated here, not even to record an area;
 *   scenarioStore  [read only]  — Screen 01 owns ambient/wind/solar. They are
 *                                 projected into this scenario overlay so the
 *                                 solver sees the same values as Screen 01;
 *   solverStore    [invalidate] — a boundary change makes any previous solve
 *                                 stale. Screen 06 never solves.
 */

import { create } from 'zustand';

import { loadBoundarySets, saveBoundarySet } from './persistence';
import { useNetworkStore } from './networkStore';
import { useProjectStore } from './projectStore';
import { useScenarioStore } from './scenarioStore';
import { useSolverStore } from './solverStore';

import { deriveBoundaryPorts } from '@/thermal/boundary/boundaryPorts';
import { buildAllPreviews, validateBoundarySet } from '@/thermal/boundary/validation';
import { calculateSolarHeatLoad } from '@/thermal/boundary/calculations';
import { applyProjectPlateHeight } from '@/thermal/boundary/plateHeight';
import {
  FIN_PARAMETER_SOURCE,
  applyProjectFins,
  finFieldsToSeed,
  projectFinParameters,
  singleFinSurfacePort,
  takesProjectFins,
  type ProjectFinSync,
} from '@/thermal/boundary/finSpec';
import { sourced } from '@/domain/sourcedValue';
import type { MaterialDefaults } from '@/domain/materials';
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

  /** One-way Screen 01 -> Screen 06 synchronization for shared scenario defaults. */
  syncScenarioDefaults: (
    scenarioId: string,
    patch: { ambient_C?: number; wind_mps?: number; solar_W_m2?: number },
  ) => boolean;
  upsertProfile: (profile: BoundaryConditionProfile) => void;
  removeProfile: (profileId: string) => void;
  assignProfiles: (portId: string, profileIds: string[]) => void;
  setSurfaceProperty: (property: SurfaceProperty) => void;

  generateDefaults: () => { created: number; firstCreatedPortId: string | null };
  copyFromScenario: (sourceScenarioId: string) => boolean;
  resetScenario: () => void;

  revalidate: () => void;
  /**
   * Copies the project's fins (`finSpec.ts`) and its machine height
   * (`plateHeight.ts`) into the open scenario again after they changed. Does
   * nothing — no dirty mark, no stale solve — when the profiles already agree.
   */
  resyncProjectFins: () => void;
  /**
   * Clears fin fields the project no longer states (`finSpec.ts`) from the fin
   * surface's profiles in every scenario, stored and loaded alike — otherwise
   * the next scenario to load would seed the cleared value back.
   */
  clearProjectFin: (projectId: string, parameterKeys: string[]) => void;
  save: (projectId: string) => void;
  /**
   * Forgets the assignments on ports that went with deleted components
   * (`componentDeletion.ts`), in every scenario of the project, stored and
   * loaded alike, and the profiles only those assignments used. Returns how
   * many assignments were dropped.
   */
  dropPorts: (projectId: string, portIds: string[]) => number;
}

const keyOf = (networkId: string, scenarioId: string) => `${networkId}::${scenarioId}`;

/**
 * Surface Properties and Screen 01 are the authoritative owners of these
 * inputs. Profiles retain resolved copies for the solver/export schema, but
 * those copies must never drift from their owners.
 */
function synchronizeInheritedProfileInputs(
  boundarySet: ScenarioBoundaryConditionSet,
  ports: BoundaryPort[],
  fins: ProjectFinSync | null = null,
  machineHeight_mm: number | null = null,
): boolean {
  const portById = new Map(ports.map((port) => [port.id, port]));
  const surfaceByGroup = new Map(
    boundarySet.surface_properties.map((surface) => [surface.surface_group_id, surface]),
  );
  const groupByProfile = new Map<string, string | null>();
  const portByProfile = new Map<string, string | null>();

  for (const assignment of boundarySet.assignments) {
    const groupId =
      assignment.surface_group_id ?? portById.get(assignment.boundary_port_id)?.surface_group_id;
    if (!groupId) continue;
    for (const profileId of assignment.profile_ids) {
      if (!portByProfile.has(profileId)) {
        portByProfile.set(profileId, assignment.boundary_port_id);
      } else if (portByProfile.get(profileId) !== assignment.boundary_port_id) {
        // The normal UI creates one profile per port. Preserve an ambiguous
        // legacy shared profile rather than borrowing one port's geometry.
        portByProfile.set(profileId, null);
      }
      if (!groupByProfile.has(profileId)) {
        groupByProfile.set(profileId, groupId);
        continue;
      }
      const existing = groupByProfile.get(profileId);
      // A profile shared across different physical surfaces is ambiguous. The
      // UI creates per-surface copies, so leave legacy ambiguous data untouched
      // instead of choosing one surface arbitrarily.
      if (existing !== groupId) groupByProfile.set(profileId, null);
    }
  }

  let synchronized = false;
  boundarySet.profiles = boundarySet.profiles.map((profile) => {
    const groupId = groupByProfile.get(profile.id);
    const surface = groupId ? surfaceByGroup.get(groupId) : undefined;
    const portId = portByProfile.get(profile.id);
    const topologyArea = portId ? portById.get(portId)?.area_m2 : null;
    const parameters = { ...profile.parameters };
    let changed = false;

    // Package top + four sides is authored in Screen 04 and projected through
    // Screen 05 as boundary_area_mm2. Once that geometry exists it is the area
    // authority; a copied profile value must not drift after dimensions change.
    // HSK fin surfaces have no topology area, so their effective area remains a
    // required engineer input and is intentionally left untouched here.
    if (topologyArea != null) {
      if (
        profile.type === 'convection_to_ambient' ||
        profile.type === 'radiation_to_surroundings' ||
        profile.type === 'combined_convection_radiation'
      ) {
        if (!Object.is(parameters.area_m2, topologyArea)) {
          parameters.area_m2 = topologyArea;
          changed = true;
        }
      } else if (profile.type === 'solar_load') {
        if (!Object.is(parameters.receivingArea_m2, topologyArea)) {
          parameters.receivingArea_m2 = topologyArea;
          changed = true;
        }
      }
    }

    if (
      profile.type === 'radiation_to_surroundings' ||
      profile.type === 'combined_convection_radiation'
    ) {
      const emissivity = surface?.emissivity ?? null;
      if (!Object.is(parameters.emissivity, emissivity)) {
        parameters.emissivity = emissivity;
        changed = true;
      }
    }

    if (profile.type === 'solar_load') {
      const absorptivity = surface?.absorptivity ?? null;
      const irradiance = boundarySet.site.solar_irradiance_W_m2 ?? null;
      if (!Object.is(parameters.absorptivity, absorptivity)) {
        parameters.absorptivity = absorptivity;
        changed = true;
      }
      if (!Object.is(parameters.irradiance_W_m2, irradiance)) {
        parameters.irradiance_W_m2 = irradiance;
        changed = true;
      }
    }

    // The heat sink's fins are the project's, the same in every scenario
    // (`finSpec.ts`).
    if (fins && portId === fins.portId && takesProjectFins(profile, portById.get(portId), fins)) {
      if (applyProjectFins(parameters, fins)) changed = true;
    }

    // A vertical plate is as tall as the machine unless taken over (`plateHeight.ts`).
    if (applyProjectPlateHeight(parameters, machineHeight_mm)) changed = true;

    if (changed) synchronized = true;
    return changed ? { ...profile, parameters } : profile;
  });
  return synchronized;
}

/** 01's machine height: the heat sink base length L, vertical when the RRU hangs. */
function projectMachineHeight(): number | null {
  return useProjectStore.getState().draft?.materials.hsk_base_L_mm?.value ?? null;
}

/** The project's fins and the one fin surface they go to; null when there is no single fin surface. */
function projectFinSync(ports: BoundaryPort[]): ProjectFinSync | null {
  const draft = useProjectStore.getState().draft;
  if (!draft) return null;
  const port = singleFinSurfacePort(ports, useNetworkStore.getState().network);
  if (!port) return null;
  return {
    portId: port.id,
    parameters: projectFinParameters(draft.materials, draft.project_context.cooling_architecture),
    baseK_W_mK: draft.materials.hsk_base_k_W_mK?.value ?? null,
  };
}

/**
 * An older project typed its fins into 06's profile; the project holds them
 * now. The first time such a set loads, what the project does not state yet is
 * taken from it, so nothing typed is lost and every scenario then agrees.
 */
/** Set while `loadFor` seeds the project, so the project subscription does not resync a set being replaced. */
let seedingProjectFins = false;

function seedProjectFinsFrom(boundarySet: ScenarioBoundaryConditionSet, ports: BoundaryPort[]): void {
  const projectStore = useProjectStore.getState();
  const draft = projectStore.draft;
  if (!draft || projectStore.isReadOnly()) return;
  const port = singleFinSurfacePort(ports, useNetworkStore.getState().network);
  if (!port) return;
  const profileIds = new Set(
    boundarySet.assignments
      .filter((assignment) => assignment.boundary_port_id === port.id)
      .flatMap((assignment) => assignment.profile_ids),
  );
  for (const profile of boundarySet.profiles) {
    if (!profileIds.has(profile.id)) continue;
    const seed = finFieldsToSeed(
      profile,
      port,
      draft.materials,
      draft.materials.hsk_base_k_W_mK?.value ?? null,
    );
    const fields = Object.entries(seed) as [keyof MaterialDefaults, number][];
    if (fields.length === 0) continue;
    seedingProjectFins = true;
    try {
      projectStore.patchMaterials(
      Object.fromEntries(
        fields.map(([field, value]) => [
          field,
          sourced(value, 'Manual', { reference: '舊版「邊界條件」頁（鰭片改為專案共用前填的值）' }),
        ]),
      ) as Partial<MaterialDefaults>,
      );
    } finally {
      seedingProjectFins = false;
    }
    return;
  }
}

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
    const scenario = useScenarioStore
      .getState()
      .scenarios.find((entry) => entry.id === scenarioId);
    let scenarioProjectionChanged = false;
    if (!sets[key]) {
      sets[key] = createBoundarySet({
        projectId,
        networkId,
        scenarioId,
        topologyVersion: topologyVersionOf(network),
        ambient_C: scenario?.ambient_C ?? null,
        wind_m_s: scenario?.wind_mps ?? null,
        solar_W_m2: scenario?.solar_W_m2 ?? null,
      });
    } else if (scenario) {
      scenarioProjectionChanged =
        !Object.is(sets[key].ambient.external_ambient_C, scenario.ambient_C) ||
        !Object.is(sets[key].site.wind_speed_m_s, scenario.wind_mps) ||
        !Object.is(sets[key].site.solar_enabled, scenario.solar_W_m2 > 0) ||
        !Object.is(sets[key].site.solar_irradiance_W_m2, scenario.solar_W_m2);
      // Screen 01 is the sole editor of shared scenario inputs. Re-project its
      // current values whenever Screen 06 loads so an older persisted boundary
      // overlay can never make the UI or solver fall back to stale numbers.
      sets[key] = {
        ...sets[key],
        ambient: {
          ...sets[key].ambient,
          external_ambient_C: scenario.ambient_C,
        },
        site: {
          ...sets[key].site,
          wind_speed_m_s: scenario.wind_mps,
          solar_enabled: scenario.solar_W_m2 > 0,
          solar_irradiance_W_m2: scenario.solar_W_m2,
        },
      };
    }

    // Persisted legacy profiles may still carry copies of the old scenario or
    // surface inputs. Reconcile those copies before validation so reloading an
    // existing project cannot revive stale solar/radiation calculations.
    seedProjectFinsFrom(sets[key], ports);
    const inheritedInputsChanged = synchronizeInheritedProfileInputs(
      sets[key],
      ports,
      projectFinSync(ports),
      projectMachineHeight(),
    );

    set({
      sets,
      activeKey: key,
      ports,
      dirty: scenarioProjectionChanged || inheritedInputsChanged,
    });
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
    synchronizeInheritedProfileInputs(next, get().ports, projectFinSync(get().ports), projectMachineHeight());
    next.updated_at = new Date().toISOString();

    set({ sets: { ...sets, [activeKey]: next }, dirty: true });
    // `scenarioStore` owns the aggregate scenario revision even though the
    // boundary payload stays in its own store (approved implementation split).
    useScenarioStore.getState().touchScenarioRevision(next.scenario_id);
    // 00 Rule 6 — the boundary problem changed, so any previous solve is stale.
    useSolverStore.getState().invalidate('boundary_changed');
    get().revalidate();
  },

  syncScenarioDefaults: (scenarioId, patch) => {
    const current = get().current();
    if (!current || current.scenario_id !== scenarioId) return false;

    const changed =
      (Object.hasOwn(patch, 'ambient_C') &&
        !Object.is(current.ambient.external_ambient_C, patch.ambient_C)) ||
      (Object.hasOwn(patch, 'wind_mps') &&
        !Object.is(current.site.wind_speed_m_s, patch.wind_mps)) ||
      (Object.hasOwn(patch, 'solar_W_m2') &&
        !Object.is(current.site.solar_irradiance_W_m2, patch.solar_W_m2));

    if (changed) {
      get().mutate((next) => {
        if (Object.hasOwn(patch, 'ambient_C')) {
          next.ambient.external_ambient_C = patch.ambient_C ?? null;
        }
        if (Object.hasOwn(patch, 'wind_mps')) {
          next.site.wind_speed_m_s = patch.wind_mps ?? null;
        }
        if (Object.hasOwn(patch, 'solar_W_m2')) {
          next.site.solar_irradiance_W_m2 = patch.solar_W_m2 ?? null;
          next.site.solar_enabled = (patch.solar_W_m2 ?? 0) > 0;
        }
      });
    }
    return true;
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
   * Creates an editable boundary-profile scaffold for every unassigned
   * dissipating port. It intentionally does not guess convection h or a view
   * factor: those are engineering inputs, not project defaults.
   */
  generateDefaults: () => {
    let created = 0;
    let firstCreatedPortId: string | null = null;
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
          name: `${port.name} — convection + radiation`,
          type: 'combined_convection_radiation',
          representation: 'single_combined_edge',
          parameters: {
            h_W_m2K: null,
            area_m2: port.area_m2,
            emissivity: surface?.emissivity ?? null,
            viewFactor: null,
          },
          source: 'manual',
          confidence: 'medium',
          provenance: {
            source_label: 'Screen 04 boundary profile scaffold',
            reference: 'Create Boundary Profiles',
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
        firstCreatedPortId ??= port.id;
      }
    });

    return { created, firstCreatedPortId };
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

  dropPorts: (projectId, portIds) => {
    if (portIds.length === 0) return 0;
    const gone = new Set(portIds);
    const clean = (entry: ScenarioBoundaryConditionSet): ScenarioBoundaryConditionSet | null => {
      const assignments = entry.assignments.filter((a) => !gone.has(a.boundary_port_id));
      if (assignments.length === entry.assignments.length) return null;
      const used = new Set(assignments.flatMap((a) => a.profile_ids));
      const orphaned = new Set(
        entry.assignments.filter((a) => gone.has(a.boundary_port_id)).flatMap((a) => a.profile_ids),
      );
      return {
        ...entry,
        assignments,
        profiles: entry.profiles.filter((p) => used.has(p.id) || !orphaned.has(p.id)),
        updated_at: new Date().toISOString(),
      };
    };

    const droppedBy = new Map<string, number>();
    for (const stored of loadBoundarySets(projectId)) {
      const next = clean(stored);
      if (!next) continue;
      droppedBy.set(keyOf(stored.network_id, stored.scenario_id), stored.assignments.length - next.assignments.length);
      saveBoundarySet(projectId, next);
    }

    // A loaded set may hold edits not written yet; clean it too, keeping them.
    const sets = { ...get().sets };
    let changed = false;
    for (const [key, entry] of Object.entries(sets)) {
      if (entry.project_id !== projectId) continue;
      const next = clean(entry);
      if (!next) continue;
      droppedBy.set(key, Math.max(droppedBy.get(key) ?? 0, entry.assignments.length - next.assignments.length));
      sets[key] = next;
      changed = true;
    }
    set({ sets, ports: deriveBoundaryPorts(useNetworkStore.getState().network) });
    if (changed) get().revalidate();
    return [...droppedBy.values()].reduce((sum, n) => sum + n, 0);
  },

  resyncProjectFins: () => {
    if (seedingProjectFins) return;
    const { sets, activeKey, ports } = get();
    if (!activeKey || !sets[activeKey]) return;
    const probe = { ...sets[activeKey], profiles: [...sets[activeKey].profiles] };
    if (!synchronizeInheritedProfileInputs(probe, ports, projectFinSync(ports), projectMachineHeight())) return;
    get().mutate(() => {});
  },

  clearProjectFin: (projectId, parameterKeys) => {
    const keys = parameterKeys.filter((key) => key in FIN_PARAMETER_SOURCE);
    const port = singleFinSurfacePort(get().ports, useNetworkStore.getState().network);
    if (!port || keys.length === 0) return;
    const clean = (entry: ScenarioBoundaryConditionSet): ScenarioBoundaryConditionSet | null => {
      const ids = new Set(
        entry.assignments
          .filter((assignment) => assignment.boundary_port_id === port.id)
          .flatMap((assignment) => assignment.profile_ids),
      );
      let changed = false;
      const profiles = entry.profiles.map((profile) => {
        if (!ids.has(profile.id) || keys.every((key) => profile.parameters[key] == null)) return profile;
        changed = true;
        const parameters = { ...profile.parameters };
        for (const key of keys) parameters[key] = null;
        return { ...profile, parameters };
      });
      return changed ? { ...entry, profiles, updated_at: new Date().toISOString() } : null;
    };

    for (const stored of loadBoundarySets(projectId)) {
      const next = clean(stored);
      if (next) saveBoundarySet(projectId, next);
    }
    // A loaded set may hold edits not written yet; clean it too, keeping them.
    const { sets, activeKey } = get();
    const nextSets = { ...sets };
    let activeChanged = false;
    for (const [key, entry] of Object.entries(sets)) {
      if (entry.project_id !== projectId) continue;
      const next = clean(entry);
      if (!next) continue;
      nextSets[key] = next;
      if (key === activeKey) activeChanged = true;
    }
    set({ sets: nextSets, ...(activeChanged ? { dirty: true } : {}) });
    if (activeChanged) get().revalidate();
  },

  revalidate: () => {
    const { sets, activeKey, ports } = get();
    if (!activeKey || !sets[activeKey]) return;

    const network = useNetworkStore.getState().network;
    const current = sets[activeKey];

    const derived = buildAllPreviews(current, ports);
    const solarActive =
      current.site.solar_enabled && (current.site.solar_irradiance_W_m2 ?? 0) > 0;

    // Solar is an external heat input, kept out of component power (06 §9.5).
    const loads = !solarActive
      ? []
      : current.assignments.flatMap((assignment) => {
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

// The fins live on the project. When they change there — typed on the heat-sink
// surface, or brought in by 01's AI-Thermal link — the open scenario follows.
useProjectStore.subscribe((state, previous) => {
  const next = state.draft;
  const prev = previous.draft;
  if (!next || !prev || next.project_id !== prev.project_id) return;
  if (
    next.materials === prev.materials &&
    next.project_context.cooling_architecture === prev.project_context.cooling_architecture
  ) {
    return;
  }
  useBoundaryStore.getState().resyncProjectFins();
});
