/**
 * How much of the base a part spreads into, on the graph side — see
 * `spreadingDomain.ts`. The solve side (heat shares) is covered beside
 * `solver/spreadingDomain.ts`.
 *
 * Covered here: the parameters a domain writes, the stamp a part's choice rides
 * on, that the solver's projection reads the component itself, that a Screen 04
 * change reaches Screen 05 without throwing away a pinned Ψ, and that the
 * choice survives a save and load.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNetworkStore } from '@/data/networkStore';
import { migrateComponent } from '@/data/componentMigration';
import {
  createComponent,
  emptyTim,
  spreadingDomainOf,
  type Component,
  type SpreadingDomainSpec,
} from '@/domain/component';
import { effectOfChange } from '@/domain/componentInvalidation';
import { BUILTIN_TIM_IDS, defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { computeRth } from '../resistance/calculators';
import type { ThermalEdge, ThermalNetwork } from '../types';
import { projectComponentMaster } from './componentProjection';
import { HSK_BASE_CONNECTION_ROLE } from './hskBaseConnection';
import { buildComponentSubgraph } from './networkBuilder';
import { buildSharedStructure } from './sharedStructure';
import {
  SPREADING_DOMAIN_KEY,
  applySpreadingDomain,
  clampDomainArea,
  spreadingDomainAt,
} from './spreadingDomain';
import { PSI_VARIANT_PINNED_KEY } from './spreadingVariant';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  useNetworkStore.getState().clear();
  useNetworkStore.getState().loadFor('TEST');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PLATE = 339 * 272;
const MODULE_AREA = 61 * 58;

const materials = () => ({
  ...defaultMaterials(),
  hsk_base_k_W_mK: sourced(150, 'Manual'),
  hsk_base_thickness_mm: sourced(7, 'Manual'),
  hsk_base_L_mm: sourced(339, 'Manual'),
  hsk_base_W_mm: sourced(272, 'Manual'),
});

function powerModule(domain?: SpreadingDomainSpec): Component {
  const component = createComponent({
    id: 'CMP_PM',
    name: 'Power Module',
    category: 'Power',
    qty: 1,
    power_W: 29,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: new Date().toISOString(),
    },
  });
  component.thermal_spec = {
    ...component.thermal_spec,
    limit_type: 'Ts',
    r_jc_C_per_W: null,
    geometry: { ...component.thermal_spec.geometry, package_L_mm: 61, package_W_mm: 58 },
    heat_path: {
      type: 'DirectMetal',
      parameters: { source_model: 'SurfaceBodyBased', contact_geometry: 'FullBase' },
    },
    tim: { ...emptyTim(BUILTIN_TIM_IDS.grease), blt_mm: sourced(0.5, 'Datasheet') },
    ...(domain ? { spreading_domain: domain } : {}),
  };
  return component;
}

function connected(component: Component) {
  const mats = materials();
  const structure = buildSharedStructure('SINGLE_MAIN_BASE');
  const subgraph = buildComponentSubgraph(component, {
    materials: mats,
    templateId: 'DIRECT_METAL',
    qtyModel: 'AGGREGATE',
  })!;
  const store = useNetworkStore.getState();
  store.addSubgraph({ nodes: structure.nodes, edges: structure.edges, zones: structure.zones });
  store.addSubgraph(subgraph);
  const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
  store.connectPort(portNode.id, 'HEAT_OUT', structure.zones[0].id, mats);
  return { mats, portNodeId: portNode.id, network: () => useNetworkStore.getState().network! };
}

const baseEdge = (network: ThermalNetwork): ThermalEdge =>
  Object.values(network.edges).find(
    (edge) => edge.metadata?.connection_role === HSK_BASE_CONNECTION_ROLE,
  )!;

const discR = (plate: number, extra: Record<string, number | string> = {}) =>
  computeRth('spreading_disc', {
    source_area_mm2: MODULE_AREA,
    plate_area_mm2: plate,
    thickness_mm: 7,
    k_W_mK: 150,
    psi_variant: 'avg',
    ...extra,
  }).value!;

describe('the parameters a domain writes', () => {
  const params = () => ({ source_area_mm2: 900, plate_area_mm2: 66000, psi_variant: 'max' });

  it('leaves a whole-base edge exactly as it was', () => {
    expect(applySpreadingDomain(params(), { mode: 'WholeBase', area_mm2: null })).toEqual(params());
  });

  it('spreads a stated area per device, inside the patch and the base', () => {
    expect(applySpreadingDomain(params(), { mode: 'Manual', area_mm2: 5000 }, 2)).toEqual({
      ...params(),
      plate_area_mm2: 10000,
      base_area_mm2: 66000,
      spreading_domain: 'Manual',
    });
    const withBase = { ...params(), base_area_mm2: 66000 };
    expect(clampDomainArea(100, withBase)).toBe(900);
    expect(clampDomainArea(1e9, withBase)).toBe(66000);
  });

  // An unfinished choice reads conservatively, and nothing invents an area.
  it('spreads into the whole base when the stated area is missing', () => {
    expect(applySpreadingDomain(params(), { mode: 'Manual', area_mm2: null })).toEqual(params());
  });

  it('marks a heat share and leaves its area to the solve', () => {
    expect(applySpreadingDomain(params(), { mode: 'HeatShare', area_mm2: null })).toEqual({
      ...params(),
      base_area_mm2: 66000,
      spreading_domain: 'HeatShare',
    });
  });

  it('drops stale domain parameters when the part goes back to the whole base', () => {
    const stale = {
      ...params(),
      plate_area_mm2: 8000,
      base_area_mm2: 66000,
      spreading_domain: 'HeatShare',
      heat_share: 0.1,
    };
    // The caller hands it the base again (the projection re-reads the link).
    stale.plate_area_mm2 = 66000;
    expect(applySpreadingDomain(stale, { mode: 'WholeBase', area_mm2: null })).toEqual(params());
  });
});

describe('a part’s domain on the graph', () => {
  it('rides on the port node and shapes the base edge Screen 05 builds', () => {
    const { network, portNodeId } = connected(powerModule({ mode: 'Manual', area_mm2: 8000 }));
    expect(network().nodes[portNodeId].metadata?.[SPREADING_DOMAIN_KEY]).toEqual({
      mode: 'Manual',
      area_mm2: 8000,
    });
    expect(spreadingDomainAt(network(), portNodeId).mode).toBe('Manual');

    const edge = baseEdge(network());
    expect(edge.parameters).toMatchObject({
      plate_area_mm2: 8000,
      base_area_mm2: PLATE,
      spreading_domain: 'Manual',
    });
    expect(edge.rth.analytical).toBeCloseTo(discR(8000), 12);
  });

  it('builds a whole-base part exactly as before the choice existed', () => {
    const { network } = connected(powerModule());
    const edge = baseEdge(network());
    expect(edge.parameters?.plate_area_mm2).toBe(PLATE);
    expect(edge.parameters).not.toHaveProperty('base_area_mm2');
    expect(edge.parameters).not.toHaveProperty('spreading_domain');
  });

  // Screen 04 can change the choice while Screen 05 is closed. The solve must
  // use the component as it stands, not the stamp it was built with.
  it('is read off the component by the solver, ahead of a stale stamp', () => {
    const { network, mats } = connected(powerModule());
    const component = powerModule({ mode: 'Manual', area_mm2: 8000 });
    const edge = baseEdge(network());

    const projected = projectComponentMaster(network(), [component], mats).edges[edge.id];
    expect(projected.parameters).toMatchObject({
      plate_area_mm2: 8000,
      base_area_mm2: PLATE,
      spreading_domain: 'Manual',
    });
    expect(projected.rth.analytical).toBeCloseTo(discR(8000, { devices: 1 }), 12);
  });

  // Two devices on one aggregated edge: the stated area is per device, so the
  // edge spreads into twice it — and Screen 05 and the solver must agree on that.
  it('multiplies a stated area by the devices an aggregated edge carries, in both paths', () => {
    const component = powerModule({ mode: 'Manual', area_mm2: 8000 });
    component.qty = 2;
    const { network, mats } = connected(component);
    const edge = baseEdge(network());
    expect(edge.parameters?.plate_area_mm2).toBe(16000);

    const projected = projectComponentMaster(network(), [component], mats).edges[edge.id];
    expect(projected.parameters?.plate_area_mm2).toBe(16000);
  });

  it('reaches Screen 05 on the next visit and keeps a Ψ pinned on the edge', () => {
    const { network, mats, portNodeId } = connected(powerModule());
    const id = baseEdge(network()).id;
    useNetworkStore.getState().mutate((draft) => {
      const edge = draft.edges[id];
      edge.parameters = { ...edge.parameters, psi_variant: 'max' };
      edge.metadata = { ...edge.metadata, [PSI_VARIANT_PINNED_KEY]: true };
    });

    const changed = powerModule({ mode: 'Manual', area_mm2: 8000 });
    expect(useNetworkStore.getState().refreshMounts([changed], mats)).toBe(1);

    const node = network().nodes[portNodeId];
    expect(node.metadata?.[SPREADING_DOMAIN_KEY]).toEqual({ mode: 'Manual', area_mm2: 8000 });
    const edge = network().edges[id];
    // Refreshed in place — same edge, pin intact — rather than reconnected.
    expect(edge.parameters).toMatchObject({ plate_area_mm2: 8000, psi_variant: 'max' });
    expect(edge.metadata?.[PSI_VARIANT_PINNED_KEY]).toBe(true);
    expect(edge.rth.analytical).toBeCloseTo(discR(8000, { psi_variant: 'max' }), 12);

    // Nothing left to do on the next visit.
    expect(useNetworkStore.getState().refreshMounts([changed], mats)).toBe(0);
  });
});

describe('the choice as stored data', () => {
  const raw = (spreading_domain?: unknown) => ({
    id: 'CMP_X',
    name: 'X',
    category: 'Power',
    thermal_spec: spreading_domain === undefined ? {} : { spreading_domain },
  });

  it('reads a record from before the choice existed as the whole base', () => {
    expect(spreadingDomainOf(migrateComponent(raw(), 0)!.thermal_spec)).toEqual({
      mode: 'WholeBase',
      area_mm2: null,
    });
  });

  it('keeps a stated choice through a load and repairs a broken one', () => {
    expect(
      migrateComponent(raw({ mode: 'Manual', area_mm2: 8000 }), 0)!.thermal_spec.spreading_domain,
    ).toEqual({ mode: 'Manual', area_mm2: 8000 });
    expect(
      migrateComponent(raw({ mode: 'HeatShare' }), 0)!.thermal_spec.spreading_domain,
    ).toEqual({ mode: 'HeatShare', area_mm2: null });
    // An unknown mode is not a reason to drop the record; a zero area is unknown.
    expect(
      migrateComponent(raw({ mode: 'Elsewhere', area_mm2: 0 }), 0)!.thermal_spec.spreading_domain,
    ).toEqual({ mode: 'WholeBase', area_mm2: null });
  });

  it('marks the solve stale without asking for a network review', () => {
    expect(effectOfChange('spreading_domain', true)).toEqual({
      networkReview: false,
      solverDirty: true,
      dirtyReasons: ['component_geometry_changed'],
    });
  });
});
