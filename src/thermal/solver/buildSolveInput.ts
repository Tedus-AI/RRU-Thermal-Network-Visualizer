/**
 * Solve-input assembly — 07 §12, §13.
 *
 * Screen 05 owns the topology. Screen 06 owns the scenario boundary conditions.
 * Screen 07 has to solve ONE network that carries both, and it must do so
 * without writing to either: this module produces a solve-ready CLONE and
 * leaves the stored graph byte-for-byte untouched (07 §53 — networkStore is
 * read-only here, and a solver result is never written back to master data).
 *
 * What the clone receives:
 *   - the ambient / fixed-temperature nodes pinned from the scenario's boundary
 *     set (07 §13 `RHS_i += T_fixed / Rij`);
 *   - boundary-derived edges given the CURRENT scenario's convection / radiation
 *     resistance — never another scenario's (07 §12);
 *   - solar recorded as an external heat INPUT at its target node (06 §9.5),
 *     kept separate from component power so the KPI row can show both;
 *   - component power multiplied by the scenario power scale.
 *
 * Nothing here invents a resistance. A boundary whose inputs are incomplete
 * arrives with `null` and is reported by the pre-solve checks, exactly as
 * Screen 06 left it.
 */

import type { MaterialDefaults } from '@/domain/materials';
import { buildAllPreviews } from '../boundary/validation';
import { finRootLinkOf } from '../boundary/boundaryPorts';
import { edgeResistance } from '../rth';
import { projectComponentMaster } from '../graph/componentProjection';
import type { Component } from '@/domain/component';
import type {
  BoundaryDerivedPreview,
  BoundaryPort,
  ScenarioBoundaryConditionSet,
} from '../boundary/types';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import { issue, type SolverIssue } from './solverTypes';
import {
  hydrateSourceRevision,
  type SourceRevision,
} from '@/domain/revision';

/** How a boundary edge got its resistance, for the inspector and the checks. */
export interface BoundaryEdgeAssignment {
  edge_id: string;
  boundary_port_id: string;
  R_C_per_W: number | null;
  kind: 'convection' | 'radiation' | 'combined';
}

export interface SolarInjection {
  node_id: string;
  boundary_port_id: string;
  q_W: number;
}

export interface SolveInput {
  /** Solve-ready clone. The stored network is never mutated. */
  network: ThermalNetwork;
  project_id: string;
  network_id: string;
  scenario_id: string;
  /** Frozen authoritative-store provenance; not part of the physics hash. */
  source_revision: SourceRevision;
  power_scale: number;
  ambient_C: number | null;

  /** node id → pinned temperature, °C. */
  fixed_nodes: Record<string, number>;
  boundary_edges: BoundaryEdgeAssignment[];
  /** Edges switched off because the port is adiabatic (06 §9.7). */
  adiabatic_edge_ids: string[];
  solar_loads: SolarInjection[];

  /** Σ component power × power scale, W. */
  component_power_W: number;
  /** Σ solar heat input, W. Not scaled with component power. */
  solar_power_W: number;

  /** Notes worth surfacing that are not themselves pass/fail checks. */
  notes: SolverIssue[];
}

export interface BuildSolveInputOptions {
  network: ThermalNetwork;
  components?: Component[];
  /**
   * Project material constants. REQUIRED, not optional-with-a-default: the
   * component projection resolves inherited TIM properties, the coin spread
   * area and the via array constants through them, so quietly falling back to
   * the shipped values would solve a project against numbers it had changed.
   */
  materials: MaterialDefaults;
  boundarySet: ScenarioBoundaryConditionSet | null;
  ports: BoundaryPort[];
  scenarioId: string;
  sourceRevision?: SourceRevision;
  powerScale?: number;
}

function cloneNode(node: ThermalNode): ThermalNode {
  return { ...node, ports: node.ports ? node.ports.map((port) => ({ ...port })) : undefined };
}

function cloneEdge(edge: ThermalEdge): ThermalEdge {
  return {
    ...edge,
    rth: { ...edge.rth, provenance: { ...edge.rth.provenance } },
    parameters: edge.parameters ? { ...edge.parameters } : undefined,
    scenario_overrides: edge.scenario_overrides
      ? Object.fromEntries(
          Object.entries(edge.scenario_overrides).map(([key, value]) => [key, { ...value }]),
        )
      : undefined,
  };
}

function cloneNetwork(network: ThermalNetwork): ThermalNetwork {
  return {
    ...network,
    nodes: Object.fromEntries(
      Object.entries(network.nodes).map(([id, node]) => [id, cloneNode(node)]),
    ),
    edges: Object.fromEntries(
      Object.entries(network.edges).map(([id, edge]) => [id, cloneEdge(edge)]),
    ),
    layout: { mode: network.layout.mode, positions: { ...network.layout.positions } },
  };
}

function isBoundaryDerived(edge: ThermalEdge): boolean {
  return edge.method === 'convection_hA' || edge.method === 'radiation_hA';
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A node that only supplies a temperature: an ambient placeholder, or anything
 * already pinned as a fixed-temperature boundary.
 */
function isReservoirNode(node: ThermalNode | undefined): boolean {
  if (!node) return false;
  return (
    node.type === 'ambient' ||
    node.boundary_role === 'placeholder' ||
    node.boundary_type === 'fixed_temperature'
  );
}

/**
 * Every boundary-derived edge `nodeId` OWNS. Screen 05 usually leaves one; a
 * surface modelled with convection and radiation in parallel leaves two, and
 * each then takes its own half of the boundary (06 `parallel_boundary_edges`).
 *
 * Ownership, not adjacency, is the question. A convection edge runs between a
 * surface and a reservoir, so it touches TWO nodes, and both of them can carry
 * a port with an assignment — giving the fin surface a convection profile and
 * the ambient node a reservoir profile is the obvious way to describe "the fins
 * lose heat to 55 °C still air", and it is what a real project does.
 *
 * Adjacency then hands the same edge to both ports. The surface's port resolves
 * it from h and area; the ambient port has neither, so it files a second record
 * for the same edge with a null resistance, and `boundary_rth_unresolved` blocks
 * a solve whose resistance was in fact fully determined. The h and the area live
 * on the surface, so the surface owns the edge and the reservoir end never
 * claims it.
 *
 * The reservoir test is deliberately one-sided: if BOTH ends are reservoirs
 * (two fixed-temperature nodes tied by a convection edge) neither is filtered
 * out, and the caller's first-claim rule decides — silently dropping the edge
 * would hide a modelling error instead of reporting it.
 */
function boundaryEdgesOf(network: ThermalNetwork, nodeId: string): ThermalEdge[] {
  return Object.values(network.edges).filter((edge) => {
    if (!isBoundaryDerived(edge)) return false;
    if (edge.from !== nodeId && edge.to !== nodeId) return false;
    const otherId = edge.from === nodeId ? edge.to : edge.from;
    return !(isReservoirNode(network.nodes[nodeId]) && !isReservoirNode(network.nodes[otherId]));
  });
}

export function buildSolveInput(options: BuildSolveInputOptions): SolveInput {
  const { network, boundarySet, ports, scenarioId } = options;
  const powerScale = options.powerScale ?? 1;

  const clone = options.components
    ? projectComponentMaster(network, options.components, options.materials, {
        physics: true,
        limits: true,
      })
    : cloneNetwork(network);

  // 05 §51 — a disabled node keeps its data but leaves the ACTIVE network, and
  // its edges leave with it so the solver never sees a dangling source.
  for (const node of Object.values(clone.nodes)) {
    if (!node.disabled) continue;
    delete clone.nodes[node.id];
    for (const edge of Object.values(clone.edges)) {
      if (edge.from === node.id || edge.to === node.id) delete clone.edges[edge.id];
    }
  }

  const notes: SolverIssue[] = [];
  const fixedNodes: Record<string, number> = {};
  const boundaryEdges: BoundaryEdgeAssignment[] = [];
  const adiabaticEdgeIds: string[] = [];
  const solarLoads: SolarInjection[] = [];

  const ambient_C = boundarySet?.ambient.external_ambient_C ?? null;

  // Previews are recomputed rather than read from storage: a set saved before a
  // parameter edit would otherwise hand Screen 07 a resistance nobody can see.
  const previews: BoundaryDerivedPreview[] = boundarySet
    ? buildAllPreviews(boundarySet, ports)
    : [];
  const previewByPort = new Map(previews.map((preview) => [preview.boundary_port_id, preview]));
  const profileById = new Map((boundarySet?.profiles ?? []).map((p) => [p.id, p]));

  // --- 1. component power × power scale ------------------------------------
  let componentPower = 0;
  for (const node of Object.values(clone.nodes)) {
    // `power || 0` would be wrong here: it turns a NaN into a silent 0 and the
    // pre-solve check for a non-finite power would never fire. A bad number is
    // carried through so it can be reported.
    const scaled = (typeof node.power_W === 'number' ? node.power_W : Number.NaN) * powerScale;
    node.power_W = scaled;
    if (Number.isFinite(scaled)) componentPower += scaled;
  }

  // --- 2. the ambient reference -------------------------------------------
  // Screen 05 leaves the ambient node as a structural placeholder with no
  // temperature (05 §15). The scenario supplies it here, and nowhere else.
  if (ambient_C != null) {
    for (const node of Object.values(clone.nodes)) {
      if (node.type === 'ambient' || node.boundary_role === 'placeholder') {
        node.boundary_type = 'fixed_temperature';
        node.fixed_temperature_C = ambient_C;
        node.boundary_role = 'configured';
        fixedNodes[node.id] = ambient_C;
      }
    }
  }

  // --- 3. per-port boundary conditions ------------------------------------
  // One record per edge. Ownership already keeps a reservoir port off a
  // surface's edge; this is the backstop for the case ownership cannot decide,
  // where two ports genuinely describe the same edge and the second one is a
  // modelling error worth naming rather than a duplicate worth solving twice.
  const claimedEdges = new Map<string, string>();

  for (const assignment of boundarySet?.assignments ?? []) {
    if (!assignment.enabled) continue;
    const port = ports.find((entry) => entry.id === assignment.boundary_port_id);
    if (!port) continue;
    const node = clone.nodes[port.connected_node_id];
    if (!node) continue;

    const preview = previewByPort.get(port.id);
    const profiles = assignment.profile_ids
      .map((id) => profileById.get(id))
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));

    for (const profile of profiles) {
      switch (profile.type) {
        case 'fixed_temperature_boundary': {
          const value = profile.parameters.fixedTemperature_C;
          if (finite(value as number)) {
            node.boundary_type = 'fixed_temperature';
            node.fixed_temperature_C = value as number;
            fixedNodes[node.id] = value as number;
          }
          break;
        }

        case 'ambient_reservoir': {
          // Legacy compatibility only. The authoritative ambient value was
          // already applied from Scenario Environment in step 2. A saved
          // profile must never create a second owner or override it.
          break;
        }

        case 'adiabatic_symmetry': {
          // Intentional no-flow: the boundary edge leaves the active network.
          // No huge resistance is faked in its place (06 §9.7).
          for (const edge of boundaryEdgesOf(clone, node.id)) {
            edge.enabled = false;
            adiabaticEdgeIds.push(edge.id);
          }
          break;
        }

        case 'solar_load': {
          const q = preview?.q_solar_W;
          if (finite(q)) {
            solarLoads.push({ node_id: node.id, boundary_port_id: port.id, q_W: q });
          }
          break;
        }

        default:
          break;
      }
    }

    // --- the fin's own conduction ------------------------------------------
    // Screen 05 leaves the root-to-fin-surface step isothermal, because until
    // there was fin geometry there was nothing to put on it: the efficiency
    // lived inside the boundary coefficient. With the geometry stated, the same
    // total splits exactly into the fin's conduction and bare convection, and
    // the intermediate node then sits at the MEAN FIN SURFACE temperature
    // rather than repeating the root's under a name that promises a surface.
    //
    // Applied as a scenario override on the solve clone, never written back:
    // the split is a function of this scenario's boundary profile, and Screen
    // 05's topology stays scenario-independent (06 §10.1, Rule 9).
    const finConduction = preview?.fin_array?.conductionResistance_C_per_W;
    if (finConduction != null && finConduction > 0) {
      const link = finRootLinkOf(clone, node.id);
      if (link) {
        link.scenario_overrides = {
          ...link.scenario_overrides,
          [scenarioId]: {
            ...link.scenario_overrides?.[scenarioId],
            R_C_per_W: finConduction,
          },
        };
      }
    }

    // --- boundary resistance ---------------------------------------------
    if (!preview) continue;

    // An adiabatic port has already switched its edges off; they stay off.
    const owned = boundaryEdgesOf(clone, node.id).filter((edge) => edge.enabled);
    const edges: ThermalEdge[] = [];
    for (const edge of owned) {
      const claimedBy = claimedEdges.get(edge.id);
      if (claimedBy != null) {
        notes.push(
          issue(
            'warning',
            'boundary_edge_claimed_twice',
            'boundary',
            `Boundary edge "${edge.id}" is described by ports "${claimedBy}" and "${port.id}". The first assignment is used.`,
            `邊界連線 "${edge.id}" 同時被邊界埠 "${claimedBy}" 與 "${port.id}" 描述，採用先指派的那一組。`,
            { edge_id: edge.id, boundary_port_id: port.id, fix_in: '06' },
          ),
        );
        continue;
      }
      claimedEdges.set(edge.id, port.id);
      edges.push(edge);
    }
    if (edges.length === 0) continue;

    const convectionEdges = edges.filter((edge) => edge.method === 'convection_hA');
    const radiationEdges = edges.filter((edge) => edge.method === 'radiation_hA');

    // Two edges in parallel take one branch each; a single edge carries both
    // mechanisms and therefore takes the combined resistance (06 §13.3).
    const parallel = convectionEdges.length > 0 && radiationEdges.length > 0;

    for (const edge of edges) {
      const kind: BoundaryEdgeAssignment['kind'] = parallel
        ? edge.method === 'radiation_hA'
          ? 'radiation'
          : 'convection'
        : 'combined';

      const value = parallel
        ? kind === 'radiation'
          ? preview.r_rad_C_per_W
          : preview.r_conv_C_per_W
        : (preview.r_combined_C_per_W ?? preview.r_conv_C_per_W ?? preview.r_rad_C_per_W);

      boundaryEdges.push({
        edge_id: edge.id,
        boundary_port_id: port.id,
        R_C_per_W: finite(value) ? value : null,
        kind,
      });

      if (finite(value) && value > 0) {
        // Applied as a scenario override so the edge's own analytical / manual /
        // measurement slots stay exactly as Screen 05 left them (Rule 9).
        edge.scenario_overrides = {
          ...edge.scenario_overrides,
          [scenarioId]: { ...edge.scenario_overrides?.[scenarioId], R_C_per_W: value },
        };
      }
    }
  }

  // --- 4. solar as injected power -----------------------------------------
  let solarPower = 0;
  for (const load of solarLoads) {
    const node = clone.nodes[load.node_id];
    if (!node) continue;
    node.power_W += load.q_W;
    solarPower += load.q_W;
  }

  if (solarLoads.length > 0) {
    notes.push(
      issue(
        'info',
        'solar_injected',
        'boundary',
        `${solarLoads.length} solar load(s) injected as external heat input, ${solarPower.toFixed(1)} W total. Solar is not scaled by the scenario power scale.`,
        `已注入 ${solarLoads.length} 項太陽負載，共 ${solarPower.toFixed(1)} W。太陽負載不隨功率縮放係數變動。`,
      ),
    );
  }

  return {
    network: clone,
    project_id: network.project_id,
    network_id: boundarySet?.network_id ?? network.network_name,
    scenario_id: scenarioId,
    source_revision: hydrateSourceRevision(
      options.sourceRevision,
      `${network.project_id}:${network.network_name}:${scenarioId}:${network.revision}`,
    ),
    power_scale: powerScale,
    ambient_C,
    fixed_nodes: fixedNodes,
    boundary_edges: boundaryEdges,
    adiabatic_edge_ids: adiabaticEdgeIds,
    solar_loads: solarLoads,
    component_power_W: componentPower,
    solar_power_W: solarPower,
    notes,
  };
}

/**
 * Fingerprint of everything that can change the answer — 07 §3, §38.
 *
 * Node names, positions and colours are deliberately excluded: renaming a node
 * does not make a solution stale. Powers, resistances, enablement, fixed
 * temperatures and the scenario do, so they are all in here. A stored solution
 * whose signature no longer matches the current inputs is stale and must not be
 * presented as current.
 */
export function solveInputSignature(input: SolveInput): string {
  const parts: string[] = [
    `scenario=${input.scenario_id}`,
    `scale=${input.power_scale}`,
    `ambient=${input.ambient_C ?? 'null'}`,
  ];

  for (const node of Object.values(input.network.nodes).sort((a, b) => a.id.localeCompare(b.id))) {
    if (node.disabled) {
      parts.push(`N:${node.id}:disabled`);
      continue;
    }
    parts.push(
      `N:${node.id}:${node.power_W}:${node.boundary_type ?? '-'}:${node.fixed_temperature_C ?? '-'}`,
    );
  }

  for (const edge of Object.values(input.network.edges).sort((a, b) => a.id.localeCompare(b.id))) {
    const R = edgeResistance(edge, input.scenario_id);
    parts.push(`E:${edge.id}:${edge.from}>${edge.to}:${R ?? 'null'}:${edge.enabled ? 1 : 0}`);
  }

  return hash(parts.join('|'));
}

/** FNV-1a, 32-bit. Small, stable, and adequate for change detection. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return `${(value >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}
