/**
 * The boundary half of Screen 05 (熱網路與邊界): what used to be Screen 06.
 *
 * The scenario's boundary set — the surfaces, their conditions, the fixed
 * temperatures, the checks — and the actions that edit it. The behaviour is
 * Screen 06's, moved here when the two pages became one; the network half is
 * `useThermalPathBuilder`. Every hook runs in one fixed order, above the
 * page's loading returns.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { FOCUS_PARAM, consumeFocus, revealField } from '@/app/focusLink';
import { projectPath } from '@/app/navigation';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { topologyVersionOf, useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { surfaceGroupsOf } from '@/thermal/boundary/boundaryPorts';
import {
  checkSurfaceAssumption,
  type SurfaceAssumptionCheck,
  type SurfaceAssumptionVerdict,
} from '@/thermal/boundary/assumptionCheck';
import { singleFinSurfacePort } from '@/thermal/boundary/finSpec';
import {
  BOUNDARY_TYPE_LABELS,
  type BoundaryConditionProfile,
  type BoundaryConditionType,
  type BoundaryPort,
} from '@/thermal/boundary/types';

import type { FixedTemperatureRow } from '@/screens/06-boundary-conditions/FixedTemperaturePanel';
import {
  REPRESENTATION_FOR,
  profilesForPort,
  summarize,
} from '@/screens/06-boundary-conditions/boundaryViewModel';

/** Long enough for the surface panel to render the box and the flash to finish. */
const FOCUS_REVEAL_WINDOW_MS = 6000;

/**
 * The verdict a surface's badge may act on.
 *
 * A confirmed surface temperature says nothing about a solar estimate or a
 * deferred CFD placeholder on the same port, so a port only leaves the warning
 * state when the check covers everything it is assuming.
 */
export function verdictOf(check?: SurfaceAssumptionCheck): SurfaceAssumptionVerdict | undefined {
  if (!check) return undefined;
  return check.covers_every_assumption ? check.verdict : 'off';
}

export function useBoundaryWorkspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const readOnly = useProjectStore((s) => s.isReadOnly());
  const network = useNetworkStore((s) => s.network);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const solverState = useSolverStore((s) => s.state);

  // Read for ONE purpose: checking a surface-temperature assumption against the
  // solve that followed it. Nothing solved is written into the boundary set.
  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const solutionSignature = useSolutionStore((s) => s.signature);

  const sets = useBoundaryStore((s) => s.sets);
  const activeKey = useBoundaryStore((s) => s.activeKey);
  const ports = useBoundaryStore((s) => s.ports);
  const dirty = useBoundaryStore((s) => s.dirty);

  const [chosenPortId, setChosenPortId] = useState<string | null>(null);
  const [preferredProfileId, setPreferredProfileId] = useState<string | null>(null);

  const set = activeKey ? (sets[activeKey] ?? null) : null;
  const surfaces = useMemo(() => ports.filter((port) => port.dissipating), [ports]);
  const finPort = useMemo(() => singleFinSurfacePort(ports, network), [ports, network]);
  /** The surface the panel shows: the one picked, else the heat sink, else the first. */
  const selectedPort: BoundaryPort | null =
    surfaces.find((port) => port.id === chosenPortId) ?? finPort ?? surfaces[0] ?? null;

  /** Arrived from Screen 08 with a graph node whose boundary surface to open. */
  const [focusParams] = useSearchParams();
  const [pendingField, setPendingField] = useState<string | null>(null);
  useEffect(() => {
    if (ports.length === 0 || !focusParams.get(FOCUS_PARAM.node)) return;
    const nodeId = consumeFocus(focusParams, FOCUS_PARAM.node, navigate);
    const field = consumeFocus(focusParams, FOCUS_PARAM.field, navigate);
    const port = ports.find((entry) => entry.connected_node_id === nodeId);
    if (!port) return;
    setChosenPortId(port.id);
    setPendingField(field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports, focusParams]);

  /**
   * Held in state rather than driven off the query string: `consumeFocus`
   * navigates to strip the parameter, which re-runs the effect above, and its
   * cleanup would cancel the reveal while it waits for the panel to render.
   */
  useEffect(() => {
    if (!pendingField) return;
    const cancel = revealField(pendingField);
    const done = setTimeout(() => setPendingField(null), FOCUS_REVEAL_WINDOW_MS);
    return () => {
      cancel();
      clearTimeout(done);
    };
  }, [pendingField]);

  // The assumption check reads Screen 07's solution for the open scenario.
  useEffect(() => {
    if (!projectId) return;
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    setPreferredProfileId(null);
  }, [projectId, activeScenarioId]);

  /**
   * The saved topology stamp is behind the live graph. Saving is the only thing
   * that re-stamps it, so the save button must stay live while it is.
   */
  const topologyStale =
    set != null && network != null && set.network_topology_version !== topologyVersionOf(network);

  /**
   * Each surface's temperature assumption, checked against Screen 07. A stale
   * solution is not consulted: it came from inputs that have since changed. Two
   * tests, because the signature is not recomputed when a boundary is edited;
   * the solver lifecycle (DIRTY on every boundary edit) is the first.
   */
  const assumptionChecks = useMemo(() => {
    const checks = new Map<string, SurfaceAssumptionCheck>();
    if (!set) return checks;
    const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
    const stale =
      solverState === 'DIRTY' ||
      (solution != null &&
        solutionSignature != null &&
        solution.metadata.input_signature !== solutionSignature);
    const temperatures = solution && !stale ? solution.node_temperatures_C : null;
    for (const port of ports) {
      if (!port.dissipating) continue;
      const check = checkSurfaceAssumption(port, profilesForPort(set, port.id), {
        ambient_C: set.ambient.external_ambient_C,
        solvedSurface_C: temperatures?.[port.connected_node_id] ?? null,
      });
      if (check) checks.set(port.id, check);
    }
    return checks;
  }, [set, ports, solutions, solutionKey, solutionSignature, solverState]);

  const summary = useMemo(() => summarize(set, ports), [set, ports]);
  const surfaceGroups = useMemo(() => surfaceGroupsOf(ports), [ports]);
  const validation = set?.validation ?? {
    status: 'blocked' as const,
    errors: [],
    warnings: [],
    infos: [],
  };
  const solarEnabled = Boolean(
    set?.site.solar_enabled && (set.site.solar_irradiance_W_m2 ?? 0) > 0,
  );

  const fixedRows: FixedTemperatureRow[] = useMemo(() => {
    if (!set) return [];
    return set.assignments.flatMap((assignment) => {
      const port = ports.find((entry) => entry.id === assignment.boundary_port_id);
      if (!port) return [];
      return assignment.profile_ids.flatMap((id) => {
        const profile = set.profiles.find((entry) => entry.id === id);
        return profile?.type === 'fixed_temperature_boundary' ? [{ port, profile }] : [];
      });
    });
  }, [set, ports]);

  const fixedCandidates = useMemo(() => {
    const fixed = new Set(fixedRows.map((row) => row.port.id));
    return ports.filter(
      (port) =>
        port.allowed_boundary_types.includes('fixed_temperature_boundary') && !fixed.has(port.id),
    );
  }, [ports, fixedRows]);

  /** Surfaces with the same orientation as the selected one — what 「套用到相似」 copies onto. */
  const similarCount = selectedPort
    ? surfaces.filter(
        (port) => port.id !== selectedPort.id && port.orientation === selectedPort.orientation,
      ).length
    : 0;

  // --- actions -----------------------------------------------------------

  const selectPort = (portId: string, profileId: string | null = null) => {
    setChosenPortId(portId);
    setPreferredProfileId(profileId);
  };

  /** Adds a profile of `type` to a surface and assigns it. */
  const addProfileToPort = (portId: string, type: BoundaryConditionType) => {
    const port = ports.find((entry) => entry.id === portId);
    if (!port || !set) return;
    if (type === 'solar_load' && !solarEnabled) {
      toast.warning('01 的日照是 0 W/m²，不能加太陽熱負載。');
      return;
    }
    const surface = set.surface_properties.find(
      (entry) => entry.surface_group_id === port.surface_group_id,
    );

    const id = `BCP_${portId}_${type.toUpperCase()}`;
    const parameters: BoundaryConditionProfile['parameters'] = {};
    if (type === 'convection_to_ambient' || type === 'combined_convection_radiation') {
      parameters.area_m2 = port.area_m2;
    }
    if (type === 'radiation_to_surroundings' || type === 'combined_convection_radiation') {
      parameters.emissivity = surface?.emissivity ?? null;
      parameters.area_m2 = port.area_m2;
    }
    if (type === 'solar_load') {
      parameters.irradiance_W_m2 = set.site.solar_irradiance_W_m2;
      parameters.absorptivity = surface?.absorptivity ?? null;
      parameters.receivingArea_m2 = port.area_m2;
    }
    if (type === 'ambient_reservoir') {
      parameters.temperature_C = set.ambient.external_ambient_C;
    }

    const profile: BoundaryConditionProfile = {
      id,
      name: `${port.name} — ${BOUNDARY_TYPE_LABELS[type].label}`,
      type,
      representation: REPRESENTATION_FOR[type],
      parameters,
      source: 'manual',
      confidence: 'medium',
      provenance: { source_label: 'Screen 04 boundary input' },
      external_mappings: { import_status: 'deferred' },
    };

    const store = useBoundaryStore.getState();
    store.upsertProfile(profile);
    const existing = profilesForPort(store.current(), portId).map((entry) => entry.id);
    store.assignProfiles(portId, [...new Set([...existing, id])]);
    toast.success(`已加入${BOUNDARY_TYPE_LABELS[type].zh}`);
  };

  const removeProfile = (profileId: string) => {
    useBoundaryStore.getState().removeProfile(profileId);
  };

  /** Copies the selected surface's conditions onto every surface facing the same way. */
  const applyToSimilar = () => {
    if (!selectedPort || !set) return;
    const source = profilesForPort(set, selectedPort.id);
    if (source.length === 0) return;
    const store = useBoundaryStore.getState();
    let applied = 0;
    for (const port of surfaces) {
      if (port.id === selectedPort.id || port.orientation !== selectedPort.orientation) continue;
      const copies = source.map((profile) => ({
        ...profile,
        id: `${profile.id}_FOR_${port.id}`,
        name: `${port.name} — ${BOUNDARY_TYPE_LABELS[profile.type].label}`,
        parameters: { ...profile.parameters, area_m2: port.area_m2 },
      }));
      copies.forEach((copy) => store.upsertProfile(copy));
      store.assignProfiles(
        port.id,
        copies.map((copy) => copy.id),
      );
      applied++;
    }
    toast[applied > 0 ? 'success' : 'warning'](
      applied > 0 ? `已套用到 ${applied} 個同方位的表面` : '沒有同方位的表面',
    );
  };

  /**
   * Creates the conditions every surface is missing and opens the first one
   * that still needs an input. Returns the surface it opened, for the page to
   * point the graph at.
   */
  const createBoundaryProfiles = (): BoundaryPort | null => {
    const store = useBoundaryStore.getState();
    const { created, firstCreatedPortId } = store.generateDefaults();
    const latest = store.current();
    const firstError = latest?.validation.errors[0];
    const errorPortId =
      firstError?.boundary_port_id ??
      (firstError?.profile_id
        ? latest?.assignments.find((assignment) =>
            assignment.profile_ids.includes(firstError.profile_id!),
          )?.boundary_port_id
        : undefined);
    const targetPortId = firstCreatedPortId ?? errorPortId ?? null;
    const targetProfileId =
      firstError?.profile_id ??
      (targetPortId
        ? latest?.assignments.find((assignment) => assignment.boundary_port_id === targetPortId)
            ?.profile_ids[0]
        : undefined) ??
      null;

    if (created > 0) toast.success(`已建立 ${created} 個邊界條件，請完成標示的必填欄位`);
    else if (targetPortId) toast.warning('邊界條件已存在，請完成標示的必填欄位');
    else toast.success('所有散熱表面的邊界條件都已完成');

    if (!targetPortId) return null;
    selectPort(targetPortId, targetProfileId);
    return ports.find((port) => port.id === targetPortId) ?? null;
  };

  /** Saves the open scenario's boundary set. */
  const save = () => {
    if (!projectId || readOnly || !set) return;
    useBoundaryStore.getState().save(projectId);
    useScenarioStore.getState().persist(projectId);
  };

  const editScenarios = () => {
    if (projectId) navigate(`${projectPath(projectId, 'info')}#scenario-settings`);
  };

  return {
    set,
    ports,
    surfaces,
    finPort,
    selectedPort,
    preferredProfileId,
    dirty,
    topologyStale,
    assumptionChecks,
    summary,
    surfaceGroups,
    validation,
    solarEnabled,
    fixedRows,
    fixedCandidates,
    similarCount,
    selectPort,
    addProfileToPort,
    removeProfile,
    applyToSimilar,
    createBoundaryProfiles,
    save,
    editScenarios,
  };
}

export type BoundaryWorkspace = ReturnType<typeof useBoundaryWorkspace>;
