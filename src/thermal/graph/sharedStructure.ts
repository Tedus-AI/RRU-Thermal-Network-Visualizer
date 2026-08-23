/**
 * Shared base / heat sink structure — 05 §13, §14, §15.
 *
 * The boundary rule this module protects (05 §15, §61): Screen 05 may create the
 * structural endpoint `FIN_SURFACE → AMBIENT_PLACEHOLDER`, but that edge is
 * always UNRESOLVED. Ambient temperature, h_conv, h_rad, wind and solar are
 * Screen 06's job and must not be assumed here.
 */

import { createRth } from '../rth';
import { structureEdgeId, structureNodeId, zoneNodeId } from './idFactory';
import type { BaseZone, NodeType, ThermalEdge, ThermalNode } from '../types';

export const STRUCTURE_PRESETS = [
  'SINGLE_MAIN_BASE',
  'THREE_ZONE',
  'FUNCTIONAL_ZONES',
  'SMALL_BASE_MAIN_BASE',
  'HEAT_PIPE_MAIN_BASE',
  'CUSTOM',
] as const;
export type StructurePreset = (typeof STRUCTURE_PRESETS)[number];

export const PRESET_LABELS: Record<StructurePreset, { label: string; zh: string }> = {
  SINGLE_MAIN_BASE: { label: 'Single Shared HSK Base', zh: '單一共用散熱器底座' },
  THREE_ZONE: { label: '3-Zone Base', zh: '三區基座' },
  FUNCTIONAL_ZONES: { label: 'Functional Zones', zh: '功能分區' },
  SMALL_BASE_MAIN_BASE: { label: 'Small Base + Main Base', zh: '小基座 + 主基座' },
  HEAT_PIPE_MAIN_BASE: { label: 'Heat Pipe + Main Base', zh: '熱管 + 主基座' },
  CUSTOM: { label: 'Custom', zh: '自訂' },
};

export const FUNCTIONAL_ZONE_PRESETS = [
  { key: 'RF_LEFT', name: 'RF Left', zh: 'RF 左' },
  { key: 'RF_RIGHT', name: 'RF Right', zh: 'RF 右' },
  { key: 'DIGITAL', name: 'Digital', zh: '數位' },
  { key: 'POWER', name: 'Power', zh: '電源' },
  { key: 'FILTER', name: 'Filter', zh: '濾波器' },
] as const;

/**
 * The zones each preset offers, as keys rather than display names.
 *
 * Screen 04 asks which shared structure a component attaches to, and until this
 * existed it offered a hardcoded list of the FUNCTIONAL_ZONES names — so a
 * project built on a single machined casting had no `Main Base` to pick, and
 * four of the six presets could not be expressed at all. The match was also by
 * name, upper-cased and punctuation-stripped, which silently failed the moment
 * a zone was renamed.
 *
 * `sharedStructure.test.ts` asserts these keys are exactly the zones
 * `buildSharedStructure` produces, so the picker and the graph cannot drift.
 */
export interface PresetZone {
  /** Matches the tail of the zone node's id — see `zoneNodeId` / `structureNodeId`. */
  key: string;
  name: string;
  zh: string;
}

const PRESET_ZONES: Record<StructurePreset, readonly PresetZone[]> = {
  // Keep MAIN_BASE as the stored compatibility key. The physical node is now
  // NODE_HSK_BASE; `zoneKeyOf` and `suggestedZoneFor` bridge that old key.
  SINGLE_MAIN_BASE: [{ key: 'MAIN_BASE', name: 'HSK Base', zh: '散熱器底座' }],
  THREE_ZONE: [
    { key: 'BASE_TOP', name: 'Base Top', zh: '基座上段' },
    { key: 'BASE_MID', name: 'Base Mid', zh: '基座中段' },
    { key: 'BASE_BOTTOM', name: 'Base Bottom', zh: '基座下段' },
  ],
  FUNCTIONAL_ZONES: FUNCTIONAL_ZONE_PRESETS.map((zone) => ({
    key: zone.key,
    name: zone.name,
    zh: zone.zh,
  })),
  SMALL_BASE_MAIN_BASE: [
    { key: 'SMALL_BASE', name: 'Small Base', zh: '小基座' },
    { key: 'MAIN_BASE', name: 'Main Base', zh: '主基座' },
  ],
  HEAT_PIPE_MAIN_BASE: [
    { key: 'SMALL_BASE', name: 'Small Base', zh: '小基座' },
    { key: 'MAIN_BASE', name: 'Main Base', zh: '主基座' },
  ],
  // Built by hand in Screen 05, so there is nothing to offer up front.
  CUSTOM: [],
};

export function presetZones(preset: StructurePreset): readonly PresetZone[] {
  return PRESET_ZONES[preset] ?? [];
}

/** The zone key a structure node id ends with, or null when it names no zone. */
export function zoneKeyOf(nodeId: string, preset: StructurePreset): string | null {
  if (preset === 'SINGLE_MAIN_BASE' && nodeId.endsWith('HSK_BASE')) return 'MAIN_BASE';
  return presetZones(preset).find((zone) => nodeId.endsWith(zone.key))?.key ?? null;
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
    // A placeholder is structural only until Screen 06 configures it.
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
  },
): ThermalEdge {
  const boundaryDerived = options.method === 'convection_hA' || options.method === 'radiation_hA';
  return {
    id: structureEdgeId(from.id, to.id, options.kind),
    from: from.id,
    to: to.id,
    type: options.type,
    method: options.method,
    // Unknown resistance stays null; it is never seeded with 0 (AC-05-35).
    rth: createRth(null, 'Analytical', 'low'),
    parameters: {},
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'unresolved',
    resolution_note:
      options.unresolvedNote ??
      (boundaryDerived
        ? 'Boundary derived — resolved in Screen 06 once ambient, h and radiation are defined.'
        : 'Resistance not yet defined.'),
    enabled: true,
    origin: { kind: 'shared_structure' },
  };
}

/** Builds the heat-sink tail, ending at the boundary placeholder. */
function heatSinkTail(combineBaseAndFinRoot = false): StructureResult {
  const hsk = structuralNode(
    'HSK_BASE',
    combineBaseAndFinRoot ? 'HSK Base / Fin Root' : 'HSK Base',
    'heat_sink_base',
  );
  const finRoot = structuralNode('FIN_ROOT', 'Fin Root', 'fin_root');
  const finSurface = structuralNode('FIN_SURFACE', 'Fin Surface', 'fin_surface');
  const ambient = structuralNode('AMBIENT_PLACEHOLDER', 'Ambient', 'ambient', {
    boundary: true,
  });

  const finStart = combineBaseAndFinRoot ? hsk : finRoot;
  return {
    nodes: combineBaseAndFinRoot ? [hsk, finSurface, ambient] : [hsk, finRoot, finSurface, ambient],
    edges: [
      ...(!combineBaseAndFinRoot
        ? [structuralEdge(hsk, finRoot, { type: 'conduction' as const, method: 'conduction_LkA' as const })]
        : []),
      structuralEdge(finStart, finSurface, {
        type: 'conduction',
        method: 'conduction_LkA',
        unresolvedNote: 'Fin equivalent conduction resistance not yet defined.',
      }),
      // 05 §15 — structural endpoint only. No ambient temperature, no h.
      structuralEdge(finSurface, ambient, {
        type: 'custom',
        method: 'convection_hA',
        kind: 'BOUNDARY',
      }),
    ],
    zones: [],
  };
}

export function buildSharedStructure(preset: StructurePreset): StructureResult {
  const tail = heatSinkTail(preset === 'SINGLE_MAIN_BASE');
  const hsk = tail.nodes[0];

  switch (preset) {
    case 'SINGLE_MAIN_BASE': {
      return {
        nodes: tail.nodes,
        edges: tail.edges,
        zones: [{ id: hsk.id, name: 'HSK Base', type: 'heat_sink_base' }],
      };
    }

    case 'THREE_ZONE': {
      const top = structuralNode('BASE_TOP', 'Base Top', 'base_zone');
      const mid = structuralNode('BASE_MID', 'Base Mid', 'base_zone');
      const bottom = structuralNode('BASE_BOTTOM', 'Base Bottom', 'base_zone');
      return {
        nodes: [top, mid, bottom, ...tail.nodes],
        edges: [
          // Zones couple to each other through spreading, not a tree (05 §14).
          structuralEdge(top, mid, { type: 'spreading', method: 'imported', kind: 'SPREAD' }),
          structuralEdge(mid, bottom, { type: 'spreading', method: 'imported', kind: 'SPREAD' }),
          structuralEdge(mid, hsk, { type: 'conduction', method: 'conduction_LkA' }),
          ...tail.edges,
        ],
        zones: [
          { id: top.id, name: 'Base Top', type: 'base_zone' },
          { id: mid.id, name: 'Base Mid', type: 'base_zone' },
          { id: bottom.id, name: 'Base Bottom', type: 'base_zone' },
        ],
      };
    }

    case 'FUNCTIONAL_ZONES': {
      const zoneNodes = FUNCTIONAL_ZONE_PRESETS.map((zone) => ({
        ...structuralNode(`ZONE_${zone.key}`, `${zone.name} Base`, 'base_zone'),
        id: zoneNodeId(zone.key),
      }));

      return {
        nodes: [...zoneNodes, ...tail.nodes],
        edges: [
          ...zoneNodes.map((zone) =>
            structuralEdge(zone, hsk, { type: 'conduction', method: 'conduction_LkA' }),
          ),
          ...tail.edges,
        ],
        zones: zoneNodes.map((zone, index) => ({
          id: zone.id,
          name: FUNCTIONAL_ZONE_PRESETS[index].name,
          type: 'base_zone' as NodeType,
          linked_hsk: hsk.id,
        })),
      };
    }

    case 'SMALL_BASE_MAIN_BASE': {
      const small = structuralNode('SMALL_BASE', 'Small Base', 'small_base');
      const main = structuralNode('MAIN_BASE', 'Main Base', 'main_base');
      return {
        nodes: [small, main, ...tail.nodes],
        edges: [
          structuralEdge(small, main, { type: 'conduction', method: 'conduction_LkA' }),
          structuralEdge(main, hsk, { type: 'conduction', method: 'conduction_LkA' }),
          ...tail.edges,
        ],
        zones: [
          { id: small.id, name: 'Small Base', type: 'small_base' },
          { id: main.id, name: 'Main Base', type: 'main_base' },
        ],
      };
    }

    case 'HEAT_PIPE_MAIN_BASE': {
      const small = structuralNode('SMALL_BASE', 'Small Base', 'small_base');
      const evap = structuralNode('HP_EVAP', 'HP Evaporator', 'heat_pipe_evaporator');
      const cond = structuralNode('HP_COND', 'HP Condenser', 'heat_pipe_condenser');
      const main = structuralNode('MAIN_BASE', 'Main Base', 'main_base');
      return {
        nodes: [small, evap, cond, main, ...tail.nodes],
        edges: [
          // Two parallel routes from the small base to the main base (05 §17).
          structuralEdge(small, main, {
            type: 'conduction',
            method: 'conduction_LkA',
            kind: 'DIRECT',
          }),
          structuralEdge(small, evap, { type: 'contact', method: 'direct_rth' }),
          structuralEdge(evap, cond, { type: 'heat_pipe', method: 'direct_rth', kind: 'HP' }),
          structuralEdge(cond, main, { type: 'contact', method: 'direct_rth' }),
          structuralEdge(main, hsk, { type: 'conduction', method: 'conduction_LkA' }),
          ...tail.edges,
        ],
        zones: [
          { id: small.id, name: 'Small Base', type: 'small_base' },
          { id: main.id, name: 'Main Base', type: 'main_base' },
        ],
      };
    }

    case 'CUSTOM':
    default:
      return { nodes: [], edges: [], zones: [] };
  }
}

/** A zone added by hand from the structure panel (05 §42). */
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

/** A spreading or coupling edge between two zones (05 §43). */
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
