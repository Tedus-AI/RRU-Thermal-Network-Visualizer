/**
 * Resolves a component terminal into its selected physical HSK base. The same
 * calculation applies to the single shared HSK and either half of a dual-HSK
 * structure.
 *
 * The terminal node is the downstream face of the TIM. The edge after it is
 * therefore the HSK base thickness, matching the graph's existing convention:
 * Thermal Via resistance precedes the Via node and TIM resistance precedes the
 * TIM HEAT_OUT node.
 */

import type { MaterialDefaults } from '@/domain/materials';
import { activeRth, createRth, setRthFromSource } from '../rth';
import { computeRth } from '../resistance/calculators';
import type { ThermalEdge, ThermalNetwork } from '../types';

export const HSK_BASE_CONNECTION_ROLE = 'hsk_base_conduction';

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

/** The interface edge immediately before TIM HEAT_OUT owns its exit area. */
function terminalArea(
  network: ThermalNetwork,
  sourceNodeId: string,
): { area_mm2: number | null; edge_id: string | null } {
  const incoming = Object.values(network.edges).find(
    (edge) => edge.enabled && edge.to === sourceNodeId && finitePositive(edge.parameters?.area_mm2),
  );
  return {
    area_mm2: finitePositive(incoming?.parameters?.area_mm2)
      ? (incoming!.parameters!.area_mm2 as number)
      : null,
    edge_id: incoming?.id ?? null,
  };
}

function baseConductionInputs(
  network: ThermalNetwork,
  sourceNodeId: string,
  materials: MaterialDefaults,
): BaseConductionInputs {
  const area = terminalArea(network, sourceNodeId);
  const parameters: NonNullable<ThermalEdge['parameters']> = {};
  const length = materials.hsk_base_thickness_mm?.value;
  const k = materials.hsk_base_k_W_mK.value;

  if (finitePositive(length)) parameters.length_mm = length;
  if (finitePositive(k)) parameters.k_W_mK = k;
  if (finitePositive(area.area_mm2)) parameters.area_mm2 = area.area_mm2;

  const computed = computeRth('conduction_LkA', parameters);
  return {
    parameters,
    areaSourceEdgeId: area.edge_id,
    value: computed.value,
    resolution: computed.resolution,
    note:
      computed.note ??
      (computed.missing.length > 0
        ? `Missing HSK Base input: ${computed.missing.join(', ')}.`
        : undefined),
  };
}

/** Returns the analytical HSK-thickness edge for any declared HSK target. */
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
    type: 'conduction',
    method: 'conduction_LkA',
    rth: createRth(
      inputs.value,
      'Analytical',
      inputs.value == null ? 'low' : 'medium',
      'Screen 01 HSK Base thickness and k; component TIM exit area',
    ),
    parameters: inputs.parameters,
    parameter_links: {
      length_mm: 'materials.hsk_base_thickness_mm',
      k_W_mK: 'materials.hsk_base_k_W_mK',
      area_mm2: inputs.areaSourceEdgeId
        ? `${inputs.areaSourceEdgeId}.parameters.area_mm2`
        : 'component.TIM_HEAT_OUT.area_mm2',
    },
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

/** Refreshes existing linked edges after Screen 01 changes k or thickness. */
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
      edge.parameters?.length_mm === inputs.parameters.length_mm &&
      edge.parameters?.k_W_mK === inputs.parameters.k_W_mK &&
      edge.parameters?.area_mm2 === inputs.parameters.area_mm2 &&
      edge.rth.analytical === inputs.value &&
      edge.resolution === nextResolution &&
      edge.resolution_note === nextNote &&
      previousAreaSource === inputs.areaSourceEdgeId;
    if (same) continue;

    network.edges[id] = {
      ...edge,
      type: 'conduction',
      method: 'conduction_LkA',
      parameters: inputs.parameters,
      parameter_links: {
        length_mm: 'materials.hsk_base_thickness_mm',
        k_W_mK: 'materials.hsk_base_k_W_mK',
        area_mm2: inputs.areaSourceEdgeId
          ? `${inputs.areaSourceEdgeId}.parameters.area_mm2`
          : 'component.TIM_HEAT_OUT.area_mm2',
      },
      rth: setRthFromSource(
        edge.rth,
        'Analytical',
        inputs.value,
        inputs.value == null ? 'low' : 'medium',
        {
          reference: 'Screen 01 HSK Base thickness and k; component TIM exit area',
          makeActive: !keepActiveOverride,
        },
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
