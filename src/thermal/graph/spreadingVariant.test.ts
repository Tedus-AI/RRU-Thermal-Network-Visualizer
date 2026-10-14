/**
 * Which Ψ a spreading edge reports — see `spreadingVariant.ts`.
 *
 * A metal body that is itself the heat source (Metal Base + Interface, no
 * junction) defaults to the patch average; everything with a junction keeps the
 * peak. The default reaches a project three ways and all three are covered:
 * building the edge, the Screen 05 refresh that runs when a project opens, and
 * the projection the solver runs before every solve. An engineer's own choice is
 * pinned and survives all three.
 *
 * The geometry is the STARKCORE power module that prompted this: a 61 × 58 mm
 * half-brick baseplate on a 339 × 272 × 7 mm, k = 150 base.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNetworkStore } from '@/data/networkStore';
import { createComponent, emptyMount, emptyTim, type Component } from '@/domain/component';
import { BUILTIN_TIM_IDS, defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { computeRth } from '../resistance/calculators';
import type { ThermalEdge, ThermalNetwork } from '../types';
import { projectComponentMaster } from './componentProjection';
import { HSK_BASE_CONNECTION_ROLE, refreshHskBaseConnectionEdges } from './hskBaseConnection';
import { buildComponentSubgraph } from './networkBuilder';
import { buildSharedStructure } from './sharedStructure';
import {
  PSI_VARIANT_PINNED_KEY,
  defaultSpreadingVariant,
  isMetalBodySource,
  spreadingVariantFor,
} from './spreadingVariant';

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

const materials = () => ({
  ...defaultMaterials(),
  hsk_base_k_W_mK: sourced(150, 'Manual'),
  hsk_base_thickness_mm: sourced(7, 'Manual'),
  hsk_base_L_mm: sourced(339, 'Manual'),
  hsk_base_W_mm: sourced(272, 'Manual'),
});

const PLATE = 339 * 272;
const MODULE_AREA = 61 * 58;

function moduleComponent(sourceModel: 'SurfaceBodyBased' | 'JunctionBased'): Component {
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
    limit_type: sourceModel === 'SurfaceBodyBased' ? 'Ts' : 'Tj',
    r_jc_C_per_W: sourceModel === 'SurfaceBodyBased' ? null : sourced(0.5, 'Datasheet'),
    geometry: {
      ...component.thermal_spec.geometry,
      package_L_mm: 61,
      package_W_mm: 58,
      source_L_mm: null,
      source_W_mm: null,
    },
    heat_path: {
      type: 'DirectMetal',
      parameters: { source_model: sourceModel, contact_geometry: 'FullBase' },
    },
    tim: { ...emptyTim(BUILTIN_TIM_IDS.grease), blt_mm: sourced(0.5, 'Datasheet') },
  };
  return component;
}

/** Builds the part and connects its HEAT_OUT through the real store path. */
function connected(component: Component, templateId = 'DIRECT_METAL') {
  const mats = materials();
  const structure = buildSharedStructure('SINGLE_MAIN_BASE');
  const subgraph = buildComponentSubgraph(component, {
    materials: mats,
    templateId,
    qtyModel: 'AGGREGATE',
  })!;
  const store = useNetworkStore.getState();
  store.addSubgraph({ nodes: structure.nodes, edges: structure.edges, zones: structure.zones });
  store.addSubgraph(subgraph);
  const portNode = subgraph.nodes.find((node) => node.ports?.length)!;
  const hskId = structure.zones[0].id;
  store.connectPort(portNode.id, 'HEAT_OUT', hskId, mats);
  return { mats, portNodeId: portNode.id, network: () => useNetworkStore.getState().network! };
}

const baseEdge = (network: ThermalNetwork): ThermalEdge =>
  Object.values(network.edges).find(
    (edge) => edge.metadata?.connection_role === HSK_BASE_CONNECTION_ROLE,
  )!;

const discR = (variant: 'avg' | 'max', sourceArea = MODULE_AREA) =>
  computeRth('spreading_disc', {
    source_area_mm2: sourceArea,
    plate_area_mm2: PLATE,
    thickness_mm: 7,
    k_W_mK: 150,
    psi_variant: variant,
  }).value!;

describe('the default Ψ variant', () => {
  it('reports the patch average under a metal body with no junction', () => {
    const { network, portNodeId } = connected(moduleComponent('SurfaceBodyBased'));
    expect(isMetalBodySource(network(), portNodeId)).toBe(true);

    const edge = baseEdge(network());
    expect(edge.parameters).toMatchObject({
      source_area_mm2: MODULE_AREA,
      plate_area_mm2: PLATE,
      psi_variant: 'avg',
    });
    expect(edge.rth.analytical).toBeCloseTo(discR('avg'), 12);
    // The average is the smaller reading of the same uniform-flux solution.
    expect(discR('avg')).toBeLessThan(discR('max'));
  });

  it('keeps the peak when a junction sits above the metal base', () => {
    const { network, portNodeId } = connected(moduleComponent('JunctionBased'));
    expect(Object.values(network().nodes).some((node) => node.type === 'junction')).toBe(true);
    expect(isMetalBodySource(network(), portNodeId)).toBe(false);
    expect(baseEdge(network()).parameters?.psi_variant).toBe('max');
  });

  // Body-sourced is a model choice on every heat path, but only Metal Base +
  // Interface puts that body's own face on the interface. Through a coin, the
  // patch the base sees is the coin's, not the body's.
  it('keeps the peak for a body-sourced part on any other template', () => {
    const coin = moduleComponent('SurfaceBodyBased');
    coin.thermal_spec.heat_path = {
      type: 'Coin',
      parameters: { source_model: 'SurfaceBodyBased' },
    };
    const { network, portNodeId } = connected(coin, 'BOTTOM_COOL_COIN');
    expect(isMetalBodySource(network(), portNodeId)).toBe(false);
    expect(baseEdge(network()).parameters?.psi_variant).toBe('max');
  });

  it('keeps the peak for a node nobody generated', () => {
    const { network } = connected(moduleComponent('SurfaceBodyBased'));
    expect(defaultSpreadingVariant(network(), 'NODE_DOES_NOT_EXIST')).toBe('max');
  });

  // A boss hands the base its own face, so the base edge starts on the boss.
  // The part it carries is still the metal body, and so is the boss step's
  // source; both follow it.
  it('follows the part through a boss to both spreading steps', () => {
    const component = moduleComponent('SurfaceBodyBased');
    component.thermal_spec.mount = {
      ...emptyMount('Pedestal'),
      contact_L_mm: 80,
      contact_W_mm: 80,
      height_mm: 6,
    };
    const { network, portNodeId } = connected(component);
    const boss = Object.values(network().nodes).find((node) => node.type === 'pedestal')!;

    const edge = baseEdge(network());
    expect(edge.from).toBe(boss.id);
    expect(edge.parameters?.psi_variant).toBe('avg');

    const bossStep = Object.values(network().edges).find(
      (candidate) => candidate.from === portNodeId && candidate.to === boss.id,
    )!;
    expect(bossStep.method).toBe('spreading_disc');
    expect(bossStep.parameters?.psi_variant).toBe('avg');
  });
});

/**
 * A project saved before this default existed carries `max` on every base edge.
 * Opening it must move an untouched edge to the new default — and nothing else.
 */
describe('a project saved with the old default', () => {
  const asSavedBefore = (network: ThermalNetwork, pinned = false) => {
    const edge = baseEdge(network);
    edge.parameters = { ...edge.parameters, psi_variant: 'max' };
    edge.rth = { ...edge.rth, analytical: discR('max') };
    if (pinned) edge.metadata = { ...edge.metadata, [PSI_VARIANT_PINNED_KEY]: true };
    return edge.id;
  };

  it('is refreshed to the patch average when Screen 05 opens it', () => {
    const { network, mats } = connected(moduleComponent('SurfaceBodyBased'));
    const saved = structuredClone(network());
    const id = asSavedBefore(saved);

    expect(refreshHskBaseConnectionEdges(saved, mats)).toBe(1);
    expect(saved.edges[id].parameters?.psi_variant).toBe('avg');
    expect(saved.edges[id].rth.analytical).toBeCloseTo(discR('avg'), 12);
    // Idempotent: a second pass finds nothing to do.
    expect(refreshHskBaseConnectionEdges(saved, mats)).toBe(0);
  });

  it('keeps a peak an engineer pinned', () => {
    const { network, mats } = connected(moduleComponent('SurfaceBodyBased'));
    const saved = structuredClone(network());
    const id = asSavedBefore(saved, true);

    expect(refreshHskBaseConnectionEdges(saved, mats)).toBe(0);
    expect(saved.edges[id].parameters?.psi_variant).toBe('max');
    expect(spreadingVariantFor(saved, saved.edges[id])).toBe('max');
  });

  // The solver projects the component master onto its own clone first, so a
  // project solved before anyone opens Screen 05 must already use the default.
  it('solves with the patch average even before Screen 05 refreshes it', () => {
    const component = moduleComponent('SurfaceBodyBased');
    const { network, mats } = connected(component);
    const saved = structuredClone(network());
    const id = asSavedBefore(saved);

    const projected = projectComponentMaster(saved, [component], mats);
    expect(projected.edges[id].parameters?.psi_variant).toBe('avg');
    expect(projected.edges[id].rth.analytical).toBeCloseTo(discR('avg'), 12);
    // The stored network is not touched by the projection.
    expect(saved.edges[id].parameters?.psi_variant).toBe('max');
  });

  it('solves with a pinned peak as pinned', () => {
    const component = moduleComponent('SurfaceBodyBased');
    const { network, mats } = connected(component);
    const saved = structuredClone(network());
    const id = asSavedBefore(saved, true);

    const projected = projectComponentMaster(saved, [component], mats);
    expect(projected.edges[id].parameters?.psi_variant).toBe('max');
    expect(projected.edges[id].rth.analytical).toBeCloseTo(discR('max'), 12);
  });

  it('leaves a junction part on the peak through both paths', () => {
    const component = moduleComponent('JunctionBased');
    const { network, mats } = connected(component);
    const saved = structuredClone(network());
    const id = asSavedBefore(saved);

    expect(refreshHskBaseConnectionEdges(structuredClone(saved), mats)).toBe(0);
    expect(projectComponentMaster(saved, [component], mats).edges[id].parameters?.psi_variant).toBe(
      'max',
    );
  });
});
