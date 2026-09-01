/**
 * Shared HSK structures owned by Screen 05.
 *
 * Screen 05 creates topology through the ambient placeholder. It never assumes
 * ambient temperature, convection, radiation, wind, or solar inputs; Screen 06
 * resolves those boundary conditions independently for every fin surface.
 */

import { createRth } from '../rth';
import { structureEdgeId, structureNodeId, zoneNodeId } from './idFactory';
import type { BaseZone, NodeType, ThermalEdge, ThermalNetwork, ThermalNode } from '../types';

/**
 * HSK Base / Fin Root and Fin Surface are two display planes of one lumped
 * heat-sink boundary, not a separately specified series resistance. A tiny
 * positive link keeps the solver matrix connected while remaining below the
 * bottleneck analyser's ideal-link threshold.
 *
 * This is the DEFAULT, and it is what a surface with no fin geometry keeps. It
 * is also not a claim that a fin is isothermal — it is not; the classical
 * profile is `θ(x)/θ_root = cosh(m(L−x))/cosh(m·L)`, and the fin's mean excess
 * temperature is `tanh(m·Lc)/(m·Lc)`, which is the fin efficiency itself. The
 * efficiency therefore carries the whole gradient, and while it lived only
 * inside Screen 06's coefficient this link had nothing left to hold.
 *
 * Once fin geometry is stated, `buildSolveInput` splits the same total across
 * the two edges and gives this one the fin's own conduction, as a scenario
 * override on the solve clone. The stored topology keeps the isothermal value:
 * the split depends on the scenario's boundary profile, and Screen 05 stays
 * scenario-independent (06 §10.1).
 */
export const ISOTHERMAL_FIN_LINK_RTH_C_PER_W = 1e-6;
const ISOTHERMAL_FIN_LINK_REFERENCE =
  'Isothermal fin-root link; carries the fin’s own conduction once Screen 06 states fin geometry.';

export const STRUCTURE_PRESETS = ['SINGLE_MAIN_BASE', 'DUAL_HSK_BASE'] as const;
export type StructurePreset = (typeof STRUCTURE_PRESETS)[number];

export const PRESET_LABELS: Record<StructurePreset, { label: string; zh: string }> = {
  SINGLE_MAIN_BASE: { label: 'Single Shared HSK Base', zh: '單一共用散熱器底座' },
  DUAL_HSK_BASE: { label: 'Dual Independent HSK Bases', zh: '雙獨立散熱器底座' },
};

/** A component attachment target exposed by the selected shared structure. */
export interface PresetZone {
  key: string;
  name: string;
  zh: string;
}

const PRESET_ZONES: Record<StructurePreset, readonly PresetZone[]> = {
  SINGLE_MAIN_BASE: [{ key: 'HSK_BASE', name: 'HSK Base', zh: '散熱器底座' }],
  DUAL_HSK_BASE: [
    { key: 'RF_HSK_BASE', name: 'RF HSK Base', zh: 'RF 散熱器底座' },
    { key: 'DIGITAL_HSK_BASE', name: 'Digital HSK Base', zh: '數位散熱器底座' },
  ],
};

export function presetZones(preset: StructurePreset): readonly PresetZone[] {
  return PRESET_ZONES[preset];
}

/** Returns the exact zone key represented by a shared-structure node id. */
export function zoneKeyOf(nodeId: string, preset: StructurePreset): string | null {
  return presetZones(preset).find((zone) => structureNodeId(zone.key) === nodeId)?.key ?? null;
}

export interface StructureResult {
  nodes: ThermalNode[];
  edges: ThermalEdge[];
  zones: BaseZone[];
}

function structuralNode(
  key: string,
  name: string,
  type: NodeType,
  options: { zoneId?: string; boundary?: boolean } = {},
): ThermalNode {
  return {
    id: structureNodeId(key),
    name,
    type,
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    boundary_role: options.boundary ? 'placeholder' : undefined,
    zone_id: options.zoneId ?? null,
    ports: [],
    origin: { kind: 'shared_structure' },
  };
}

function structuralEdge(
  from: ThermalNode,
  to: ThermalNode,
  options: {
    type: ThermalEdge['type'];
    method: ThermalEdge['method'];
    kind?: string;
    unresolvedNote?: string;
    resolvedRth?: number;
  },
): ThermalEdge {
  const boundaryDerived = options.method === 'convection_hA' || options.method === 'radiation_hA';
  const resolved = options.resolvedRth != null;
  return {
    id: structureEdgeId(from.id, to.id, options.kind),
    from: from.id,
    to: to.id,
    type: options.type,
    method: options.method,
    rth: createRth(
      options.resolvedRth ?? null,
      'Analytical',
      resolved ? 'high' : 'low',
      resolved ? ISOTHERMAL_FIN_LINK_REFERENCE : undefined,
    ),
    parameters: resolved ? { ideal_link: true } : {},
    heat_flow_W: null,
    delta_T_C: null,
    resolution: resolved ? 'resolved' : 'unresolved',
    resolution_note: resolved
      ? ISOTHERMAL_FIN_LINK_REFERENCE
      : options.unresolvedNote ??
        (boundaryDerived
          ? 'Boundary derived — resolved in Screen 06 once ambient, h and radiation are defined.'
          : 'Resistance not yet defined.'),
    enabled: true,
    origin: { kind: 'shared_structure' },
  };
}

/** Builds one independent HSK → fin surface → ambient-placeholder path. */
function heatSinkTail(prefix: '' | 'RF_' | 'DIGITAL_', displayPrefix = ''): StructureResult {
  const hsk = structuralNode(`${prefix}HSK_BASE`, `${displayPrefix}HSK Base / Fin Root`, 'heat_sink_base');
  const finSurface = structuralNode(`${prefix}FIN_SURFACE`, `${displayPrefix}Fin Surface`, 'fin_surface');
  const ambient = structuralNode(
    `${prefix}AMBIENT_PLACEHOLDER`,
    `${displayPrefix}Ambient`,
    'ambient',
    { boundary: true },
  );

  return {
    nodes: [hsk, finSurface, ambient],
    edges: [
      structuralEdge(hsk, finSurface, {
        type: 'conduction',
        method: 'direct_rth',
        resolvedRth: ISOTHERMAL_FIN_LINK_RTH_C_PER_W,
      }),
      structuralEdge(finSurface, ambient, {
        type: 'custom',
        method: 'convection_hA',
        kind: 'BOUNDARY',
      }),
    ],
    zones: [{ id: hsk.id, name: `${displayPrefix}HSK Base`.trim(), type: 'heat_sink_base' }],
  };
}

/**
 * Repairs the pre-effective-area shared-structure edge saved by older builds.
 * A human-edited edge is never touched.
 */
export function repairLegacySharedFinLinks(network: ThermalNetwork): number {
  let repaired = 0;
  for (const edge of Object.values(network.edges)) {
    if (
      edge.origin?.kind !== 'shared_structure' ||
      edge.origin.modified ||
      edge.method !== 'conduction_LkA' ||
      edge.resolution !== 'unresolved'
    ) {
      continue;
    }
    const from = network.nodes[edge.from];
    const to = network.nodes[edge.to];
    if (!from || !to) continue;
    const isFinRootLink =
      (from.type === 'heat_sink_base' && to.type === 'fin_surface') ||
      (from.type === 'fin_surface' && to.type === 'heat_sink_base');
    if (!isFinRootLink) continue;

    edge.method = 'direct_rth';
    edge.rth = createRth(
      ISOTHERMAL_FIN_LINK_RTH_C_PER_W,
      'Analytical',
      'high',
      ISOTHERMAL_FIN_LINK_REFERENCE,
    );
    edge.parameters = { ideal_link: true };
    edge.resolution = 'resolved';
    edge.resolution_note = ISOTHERMAL_FIN_LINK_REFERENCE;
    edge.confidence = 'high';
    repaired += 1;
  }
  return repaired;
}

export function buildSharedStructure(preset: StructurePreset): StructureResult {
  switch (preset) {
    case 'SINGLE_MAIN_BASE':
      return heatSinkTail('', '');
    case 'DUAL_HSK_BASE': {
      const rf = heatSinkTail('RF_', 'RF ');
      const digital = heatSinkTail('DIGITAL_', 'Digital ');
      return {
        nodes: [...rf.nodes, ...digital.nodes],
        edges: [...rf.edges, ...digital.edges],
        zones: [...rf.zones, ...digital.zones],
      };
    }
    default:
      throw new Error(`Unsupported HSK structure preset: ${String(preset)}`);
  }
}

/** A zone added by hand from the structure panel. */
export function createZoneNode(key: string, name: string, type: NodeType = 'base_zone'): ThermalNode {
  return {
    id: zoneNodeId(key),
    name,
    type,
    power_W: 0,
    temperature_C: null,
    temperature_source: null,
    boundary_type: null,
    zone_id: null,
    ports: [],
    origin: { kind: 'manual' },
  };
}

/** A spreading or coupling edge between two manually created zones. */
export function createSpreadingEdge(
  fromId: string,
  toId: string,
  options: { R_C_per_W?: number | null; note?: string } = {},
): ThermalEdge {
  const resolved = options.R_C_per_W != null;
  return {
    id: structureEdgeId(fromId, toId, 'SPREAD'),
    from: fromId,
    to: toId,
    type: 'spreading',
    method: resolved ? 'direct_rth' : 'imported',
    rth: createRth(options.R_C_per_W ?? null, 'Manual', resolved ? 'medium' : 'low'),
    parameters: options.R_C_per_W != null ? { R_C_per_W: options.R_C_per_W } : {},
    heat_flow_W: null,
    delta_T_C: null,
    resolution: resolved ? 'resolved' : 'unresolved',
    resolution_note:
      options.note ??
      (resolved
        ? undefined
        : 'Spreading resistance unknown. Do not substitute L/kA without justification.'),
    enabled: true,
    origin: { kind: 'manual' },
  };
}
