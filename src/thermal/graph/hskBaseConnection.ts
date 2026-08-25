/**
 * Resolves a component terminal into its selected physical HSK base. The same
 * calculation applies to the single shared HSK and either half of a dual-HSK
 * structure.
 *
 * The terminal node is the downstream face of the TIM. The edge after it is
 * therefore the entry into the HSK base, matching the graph's existing
 * convention: Thermal Via resistance precedes the Via node and TIM resistance
 * precedes the TIM HEAT_OUT node.
 *
 * WHAT THIS EDGE IS
 * -----------------
 * It used to be t/(k·A_contact) — the base thickness, down a column exactly as
 * wide as the component's contact patch. That is not what the base does. Heat
 * arrives on a patch of tens of mm² and leaves through a base of tens of
 * thousands of mm², fanning out on the way, and ignoring the fan-out overstates
 * this step by roughly 2× for a small patch and 1.2× for a large one. The size
 * dependence is the damaging part: it is not a constant offset that cancels out
 * of a comparison, it reorders which component looks like the bottleneck.
 *
 * So the edge is now the Lee/Song/Au/Moran disc-spreading correlation over the
 * REAL base envelope from Screen 01 (`hsk_base_L_mm × hsk_base_W_mm`). That
 * result already contains the one-dimensional drop through the thickness, so
 * nothing else may be placed in series with it across the same plate.
 *
 * Two consequences worth stating plainly:
 *   • the edge now needs the base L and W. Those ship empty, so a project that
 *     has not filled them gets an UNRESOLVED edge naming the missing fields
 *     rather than a number computed from an invented base size;
 *   • it stays `Analytical` at `medium` confidence, and carries the assumption
 *     in its resolution note instead. `Assumed` was the first choice, but the
 *     overview counts an `Assumed` source on the critical path as a
 *     low-confidence input and downgrades the whole project to WARNING — and
 *     this edge is on virtually every critical path, so that warning would be
 *     permanently on for every project from one systemic cause and would stop
 *     meaning anything. A closed-form correlation with a published accuracy is
 *     a calculation, the same category as the L/kA edges beside it; what makes
 *     it weaker than they are is the Bi → ∞ assumption, and that is stated on
 *     the edge (`SPREADING_UNDER_ESTIMATE_NOTE`), in the Edge Inspector's
 *     Model tab, and in the reference string.
 */

import { hskBaseAreaMm2, type MaterialDefaults } from '@/domain/materials';
import { activeRth, createRth, setRthFromSource } from '../rth';
import { computeRth } from '../resistance/calculators';
import type { ThermalEdge, ThermalNetwork } from '../types';

export const HSK_BASE_CONNECTION_ROLE = 'hsk_base_conduction';

const RTH_REFERENCE =
  'Screen 01 HSK Base envelope, thickness and k; component TIM exit area. ' +
  'Lee/Song/Au/Moran disc spreading.';

interface BaseConductionInputs {
  parameters: NonNullable<ThermalEdge['parameters']>;
  areaSourceEdgeId: string | null;
  value: number | null;
  resolution: ThermalEdge['resolution'];
  note?: string;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * The area heat leaves an edge through.
 *
 * For a plain conduction or contact edge that is `area_mm2`, the column it ran
 * down. For a spreading edge it is `plate_area_mm2` — heat entered over the
 * source patch and left over the whole plate, so the plate is what the NEXT
 * step sees. A boss whose own step is a spreading problem therefore still hands
 * the base its full footprint.
 */
function exitArea(edge: { parameters?: Record<string, unknown> | null }): number | null {
  const area = edge.parameters?.area_mm2;
  if (finitePositive(area)) return area;
  const plate = edge.parameters?.plate_area_mm2;
  return finitePositive(plate) ? plate : null;
}

/** The interface edge immediately before TIM HEAT_OUT owns its exit area. */
export function terminalArea(
  network: ThermalNetwork,
  sourceNodeId: string,
): { area_mm2: number | null; edge_id: string | null } {
  const incoming = Object.values(network.edges).find(
    (edge) => edge.enabled && edge.to === sourceNodeId && exitArea(edge) != null,
  );
  return {
    area_mm2: incoming ? exitArea(incoming) : null,
    edge_id: incoming?.id ?? null,
  };
}

/** Names the Screen 01 field behind each parameter, so the note is actionable. */
const MISSING_LABELS: Record<string, string> = {
  source_area_mm2: 'component TIM exit area',
  plate_area_mm2: 'HSK Base L × W (Screen 01)',
  thickness_mm: 'HSK Base thickness (Screen 01)',
  k_W_mK: 'HSK Base conductivity k (Screen 01)',
};

function parameterLinks(areaSourceEdgeId: string | null): Record<string, string> {
  return {
    thickness_mm: 'materials.hsk_base_thickness_mm',
    k_W_mK: 'materials.hsk_base_k_W_mK',
    plate_area_mm2: 'materials.hsk_base_area_mm2',
    source_area_mm2: areaSourceEdgeId
      ? `${areaSourceEdgeId}.parameters.area_mm2`
      : 'component.TIM_HEAT_OUT.area_mm2',
  };
}

function baseConductionInputs(
  network: ThermalNetwork,
  sourceNodeId: string,
  materials: MaterialDefaults,
): BaseConductionInputs {
  const area = terminalArea(network, sourceNodeId);
  const parameters: NonNullable<ThermalEdge['parameters']> = {};
  const thickness = materials.hsk_base_thickness_mm?.value;
  const k = materials.hsk_base_k_W_mK.value;
  const plate = hskBaseAreaMm2(materials);

  if (finitePositive(thickness)) parameters.thickness_mm = thickness;
  if (finitePositive(k)) parameters.k_W_mK = k;
  if (finitePositive(plate)) parameters.plate_area_mm2 = plate;
  if (finitePositive(area.area_mm2)) parameters.source_area_mm2 = area.area_mm2;
  // Peak temperature under the source, not the base average: the junction chain
  // upstream of this edge hangs off the hottest point of the contact patch, and
  // sizing a margin against the average would flatter it.
  parameters.psi_variant = 'max';

  const computed = computeRth('spreading_disc', parameters);
  return {
    parameters,
    areaSourceEdgeId: area.edge_id,
    value: computed.value,
    resolution: computed.resolution,
    note:
      computed.missing.length > 0
        ? `Missing HSK Base input: ${computed.missing
            .map((key) => MISSING_LABELS[key] ?? key)
            .join(', ')}.`
        : computed.note,
  };
}

/** Returns the analytical HSK-base entry edge for any declared HSK target. */
export function hskBaseConnectionPatch(
  network: ThermalNetwork,
  sourceNodeId: string,
  targetNodeId: string,
  materials: MaterialDefaults,
): Partial<ThermalEdge> | null {
  const source = network.nodes[sourceNodeId];
  const target = network.nodes[targetNodeId];
  const targetZone = network.zones[targetNodeId];
  if (
    !source ||
    !target ||
    target.type !== 'heat_sink_base' ||
    targetZone?.type !== 'heat_sink_base'
  ) {
    return null;
  }

  const inputs = baseConductionInputs(network, sourceNodeId, materials);
  return {
    type: 'spreading',
    method: 'spreading_disc',
    rth: createRth(
      inputs.value,
      'Analytical',
      inputs.value == null ? 'low' : 'medium',
      RTH_REFERENCE,
    ),
    parameters: inputs.parameters,
    parameter_links: parameterLinks(inputs.areaSourceEdgeId),
    resolution: inputs.resolution,
    resolution_note: inputs.note,
    confidence: inputs.value == null ? 'low' : 'medium',
    metadata: {
      connection_role: HSK_BASE_CONNECTION_ROLE,
      area_source_edge_id: inputs.areaSourceEdgeId,
    },
    origin: { kind: 'shared_structure', component_id: source.component_ref },
  };
}

/** Refreshes existing linked edges after Screen 01 changes k, thickness or size. */
export function refreshHskBaseConnectionEdges(
  network: ThermalNetwork,
  materials: MaterialDefaults,
): number {
  let changed = 0;

  for (const [id, edge] of Object.entries(network.edges)) {
    if (edge.metadata?.connection_role !== HSK_BASE_CONNECTION_ROLE) continue;
    const inputs = baseConductionInputs(network, edge.from, materials);
    // Refresh the analytical slot without taking control away from a valid
    // manual, measurement or future FloTHERM selection.
    const keepActiveOverride =
      ['Manual', 'Measurement', 'FloTHERM'].includes(edge.rth.active_source) &&
      activeRth(edge.rth) != null;
    const nextResolution = keepActiveOverride ? 'resolved' : inputs.resolution;
    const nextNote = keepActiveOverride ? undefined : inputs.note;
    const previousAreaSource = edge.metadata?.area_source_edge_id ?? null;

    const same =
      edge.method === 'spreading_disc' &&
      edge.parameters?.thickness_mm === inputs.parameters.thickness_mm &&
      edge.parameters?.k_W_mK === inputs.parameters.k_W_mK &&
      edge.parameters?.plate_area_mm2 === inputs.parameters.plate_area_mm2 &&
      edge.parameters?.source_area_mm2 === inputs.parameters.source_area_mm2 &&
      edge.rth.analytical === inputs.value &&
      edge.resolution === nextResolution &&
      edge.resolution_note === nextNote &&
      previousAreaSource === inputs.areaSourceEdgeId;
    if (same) continue;

    network.edges[id] = {
      ...edge,
      type: 'spreading',
      method: 'spreading_disc',
      parameters: {
        // A pre-spreading edge carries length_mm/area_mm2 that mean something
        // else entirely; keeping them would leave stale numbers on the panel.
        ...inputs.parameters,
      },
      parameter_links: parameterLinks(inputs.areaSourceEdgeId),
      rth: setRthFromSource(
        edge.rth,
        'Analytical',
        inputs.value,
        inputs.value == null ? 'low' : 'medium',
        { reference: RTH_REFERENCE, makeActive: !keepActiveOverride },
      ),
      resolution: nextResolution,
      resolution_note: nextNote,
      confidence: inputs.value == null ? 'low' : 'medium',
      metadata: {
        ...edge.metadata,
        connection_role: HSK_BASE_CONNECTION_ROLE,
        area_source_edge_id: inputs.areaSourceEdgeId,
      },
    };
    changed++;
  }

  return changed;
}
