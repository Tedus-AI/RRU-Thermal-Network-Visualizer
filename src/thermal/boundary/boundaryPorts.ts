/**
 * Boundary ports derived from the Screen 05 topology — 06 §5 step 2.
 *
 * This is a READ-ONLY projection. Screen 06 never adds, deletes or edits a
 * node or an edge (06 §2.4, §3.2); it reads the topology and offers each
 * boundary opening as something a scenario can attach conditions to.
 */

import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import type { BoundaryConditionType, BoundaryPort } from './types';

/** Edge methods Screen 05 marks as "resolved by boundary conditions". */
function isBoundaryDerived(method: string): boolean {
  return method === 'convection_hA' || method === 'radiation_hA';
}

/**
 * The conduction step feeding a boundary node — the fin-root link.
 *
 * Exactly one edge should arrive at a fin surface from upstream, and it is not
 * boundary-derived (that is the edge leaving toward ambient). Returning null
 * when the shape is anything else leaves the topology alone rather than
 * guessing which edge was meant.
 *
 * Shared so the Screen 05 projection and the Screen 07 solve clone can never
 * disagree about WHICH edge carries the fin's conduction: if they picked
 * differently, the graph would annotate one edge and the solver would resist on
 * another, and the discrepancy would be invisible.
 */
export function finRootLinkOf(network: ThermalNetwork, nodeId: string): ThermalEdge | null {
  const incoming = Object.values(network.edges).filter(
    (edge) => edge.to === nodeId && edge.enabled && !isBoundaryDerived(edge.method),
  );
  return incoming.length === 1 ? incoming[0] : null;
}

function surfaceGroupFor(node: ThermalNode): string {
  return `SG_${node.id.replace(/^NODE_/, '')}`;
}

function orientationFor(node: ThermalNode): string {
  const stated = node.metadata?.boundary_orientation;
  if (typeof stated === 'string' && stated.trim()) return stated;
  switch (node.type) {
    case 'fin_surface':
      return 'vertical_fins';
    // The shared structure's heat-sink node IS the fin root — that is what it
    // is called on screen — so it carries the fin-root orientation. It used to
    // fall through to 'unspecified' because only the removed `fin_root` type
    // was listed here.
    case 'heat_sink_base':
      return 'fin_root';
    case 'housing':
      return 'housing_wall';
    case 'small_base':
    case 'base_zone':
      return 'base_plate';
    default:
      return 'unspecified';
  }
}

function areaFor(node: ThermalNode): number | null {
  const areaMm2 = node.metadata?.boundary_area_mm2;
  if (typeof areaMm2 !== 'number' || !Number.isFinite(areaMm2) || areaMm2 <= 0) return null;
  return areaMm2 / 1e6;
}

function boundaryNameFor(node: ThermalNode): string {
  const stated = node.metadata?.boundary_surface_name;
  return typeof stated === 'string' && stated.trim() ? stated.trim() : `${node.name} Boundary`;
}

/**
 * Which boundary types make sense for a surface. A base plate can be clamped to
 * a chamber or insulated; an outer surface sees air, sky and sun.
 */
function allowedTypesFor(node: ThermalNode): BoundaryConditionType[] {
  const external: BoundaryConditionType[] = [
    'convection_to_ambient',
    'radiation_to_surroundings',
    'combined_convection_radiation',
    'solar_load',
    'external_cfd_placeholder',
  ];
  const contact: BoundaryConditionType[] = [
    'fixed_temperature_boundary',
    'adiabatic_symmetry',
    'external_cfd_placeholder',
  ];

  switch (node.type) {
    case 'fin_surface':
    case 'housing':
      return external;
    case 'heat_sink_base':
    case 'small_base':
    case 'base_zone':
      return [...contact, 'convection_to_ambient', 'radiation_to_surroundings'];
    case 'ambient':
      return ['ambient_reservoir', 'external_cfd_placeholder'];
    default:
      return [...external, ...contact];
  }
}

/**
 * Every opening in the topology where heat can leave the model.
 *
 * Two things create one: an edge Screen 05 left boundary-derived (its non-
 * ambient end is the surface), and a node Screen 05 marked as a boundary
 * placeholder that no such edge already covers.
 */
export function deriveBoundaryPorts(network: ThermalNetwork | null): BoundaryPort[] {
  if (!network) return [];

  const ports: BoundaryPort[] = [];
  const seenNodes = new Set<string>();

  for (const edge of Object.values(network.edges)) {
    if (!isBoundaryDerived(edge.method)) continue;

    const from = network.nodes[edge.from];
    const to = network.nodes[edge.to];
    if (!from || !to) continue;

    // The surface is the end that is NOT the ambient placeholder.
    const surface = to.boundary_role === 'placeholder' || to.type === 'ambient' ? from : to;
    if (seenNodes.has(surface.id)) continue;
    seenNodes.add(surface.id);

    ports.push({
      id: `BP_${surface.id.replace(/^NODE_/, '')}`,
      name: boundaryNameFor(surface),
      connected_node_id: surface.id,
      boundary_edge_id: edge.id,
      surface_group_id: surfaceGroupFor(surface),
      area_m2: areaFor(surface),
      orientation: orientationFor(surface),
      allowed_boundary_types: allowedTypesFor(surface),
      dissipating: true,
      external_mappings: { import_status: 'deferred' },
    });
  }

  for (const node of Object.values(network.nodes)) {
    if (node.boundary_role !== 'placeholder') continue;
    if (seenNodes.has(node.id)) continue;
    // The ambient placeholder itself is a reference, not a dissipating surface.
    seenNodes.add(node.id);
    ports.push({
      id: `BP_${node.id.replace(/^NODE_/, '')}`,
      name: `${node.name} Reference`,
      connected_node_id: node.id,
      surface_group_id: surfaceGroupFor(node),
      area_m2: null,
      orientation: orientationFor(node),
      allowed_boundary_types: allowedTypesFor(node),
      dissipating: false,
      external_mappings: { import_status: 'deferred' },
    });
  }

  return ports.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * True for the fin stack itself, as opposed to a flat exposed wall.
 *
 * The distinction decides how the surface may be described at all. A fin array
 * has no honest `h` on its own: the coefficient depends on the channel width
 * and the fin height, the wetted area is set by the fin count, and the fin
 * efficiency discounts part of that area — four numbers that only exist once
 * the geometry does. Asking for them directly is asking for them to be invented
 * or copied, and copying is what put an area ratio in a view-factor field.
 *
 * A flat housing wall has none of that structure, so a stated `h`, area,
 * emissivity and view factor are exactly the right description for it and stay
 * available there.
 */
export function isFinnedSurfacePort(port: BoundaryPort): boolean {
  return port.dissipating && port.orientation === 'vertical_fins';
}

/** Surface groups the Surface Properties table works with (06 §8.1, PNG §2). */
export function surfaceGroupsOf(
  ports: BoundaryPort[],
): Array<{ id: string; name: string; finned: boolean }> {
  const groups = new Map<string, { name: string; finned: boolean }>();
  for (const port of ports) {
    // Ambient placeholders are temperature references, not physical surfaces.
    // Emissivity and solar absorptivity therefore do not apply to them.
    if (!port.dissipating) continue;
    if (!groups.has(port.surface_group_id)) {
      groups.set(port.surface_group_id, {
        name: port.name.replace(/ (Boundary|Reference)$/, ''),
        finned: isFinnedSurfacePort(port),
      });
    }
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
}
