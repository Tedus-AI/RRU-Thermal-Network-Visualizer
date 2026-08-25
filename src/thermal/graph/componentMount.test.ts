import { describe, expect, it } from 'vitest';

import { emptyMount, type MountSpec, type MountType } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';
import { activeRth } from '../rth';

import type { ThermalEdge } from '../types';
import {
  MOUNT_ROLE_KEY,
  buildMountChain,
  isOwnedByMount,
  mountOf,
  type MountChain,
} from './componentMount';

const PORT = 'NODE_CMP_PA_TIM';
const BASE = 'NODE_HSK_BASE';

const materials = () => ({
  ...defaultMaterials(),
  hsk_base_k_W_mK: sourced(96, 'Manual'),
  hsk_base_thickness_mm: sourced(6, 'Manual'),
  hsk_base_L_mm: sourced(300, 'Manual'),
  hsk_base_W_mm: sourced(220, 'Manual'),
});

const chainFor = (mount: Partial<MountSpec> & { type: MountType }) =>
  buildMountChain({
    portNodeId: PORT,
    targetNodeId: BASE,
    componentRef: 'CMP_PA',
    mount: { ...emptyMount(mount.type), ...mount },
    materials: materials(),
  });

/** Every edge, in the order heat actually travels. */
const walk = (chain: MountChain) => {
  const byFrom = new Map<string, ThermalEdge>(chain.edges.map((edge) => [edge.from, edge]));
  const path: string[] = [];
  let cursor: string | undefined = PORT;
  for (let step = 0; cursor && byFrom.has(cursor) && step < 10; step += 1) {
    const edge: ThermalEdge = byFrom.get(cursor)!;
    path.push(`${edge.type}:${edge.metadata?.[MOUNT_ROLE_KEY]}`);
    cursor = edge.to;
  }
  return { path, end: cursor };
};

describe('component mount chains', () => {
  /**
   * Direct is what every project built before mounts existed had, so it must
   * add nothing at all — otherwise the change would rewrite graphs it was never
   * meant to touch.
   */
  it('adds nothing for a direct mount', () => {
    const chain = chainFor({ type: 'Direct' });
    expect(chain.nodes).toEqual([]);
    expect(chain.edges).toEqual([]);
    expect(chain.entryNodeId).toBe(PORT);
    expect(chain.needsBaseEdge).toBe(true);
  });

  /**
   * A boss is one conduction step down the metal, and it hands the spreading
   * edge a new starting node — which is the whole point: the base then spreads
   * from the BOSS footprint, not the component's.
   */
  it('builds a boss as one conduction step ending at a new node', () => {
    const chain = chainFor({
      type: 'Pedestal',
      contact_L_mm: 20,
      contact_W_mm: 20,
      height_mm: 10,
    });
    expect(chain.nodes.map((node) => node.type)).toEqual(['pedestal']);
    expect(walk(chain)).toEqual({ path: ['conduction:BLOCK'], end: chain.entryNodeId });
    expect(chain.entryNodeId).not.toBe(PORT);
    expect(chain.needsBaseEdge).toBe(true);

    // 10 mm through 400 mm² of ADC12.
    const boss = chain.edges[0];
    expect(boss.parameters).toMatchObject({ length_mm: 10, k_W_mK: 96, area_mm2: 400 });
    expect(activeRth(boss.rth)).toBeCloseTo(0.01 / (96 * 400e-6), 10);
  });

  it('carries a small base into a heat pipe and onto the base', () => {
    const chain = chainFor({
      type: 'SmallBaseHeatPipe',
      contact_L_mm: 30,
      contact_W_mm: 20,
      height_mm: 4,
      heat_pipe_R_C_per_W: 0.25,
    });
    expect(chain.nodes.map((node) => node.type)).toEqual(['small_base', 'heat_pipe_condenser']);
    expect(walk(chain).path).toEqual([
      'conduction:BLOCK',
      'heat_pipe:HEAT_PIPE',
      'contact:CONDENSER_JOINT',
    ]);
    // It reached the structure itself, so no spreading edge may be added.
    expect(walk(chain).end).toBe(BASE);
    expect(chain.needsBaseEdge).toBe(false);
  });

  it('takes a bare heat pipe straight off the part', () => {
    const chain = chainFor({
      type: 'HeatPipeOnly',
      contact_L_mm: 12,
      contact_W_mm: 12,
      heat_pipe_R_C_per_W: 0.4,
    });
    expect(chain.nodes.map((node) => node.type)).toEqual(['heat_pipe_condenser']);
    expect(walk(chain).path).toEqual(['heat_pipe:HEAT_PIPE', 'contact:CONDENSER_JOINT']);
    expect(walk(chain).end).toBe(BASE);
    expect(chain.needsBaseEdge).toBe(false);
    expect(activeRth(chain.edges[0].rth)).toBe(0.4);
  });

  /**
   * The tool's standing rule. A mount the engineer has chosen but not yet
   * dimensioned still draws — the topology is never withheld — and every edge
   * that cannot resolve says which field is missing.
   */
  it('draws the topology even with nothing dimensioned, and never invents a value', () => {
    for (const type of ['Pedestal', 'SmallBaseHeatPipe', 'HeatPipeOnly'] as const) {
      const chain = chainFor({ type });
      expect(chain.nodes.length, type).toBeGreaterThan(0);
      expect(chain.edges.length, type).toBeGreaterThan(0);

      const unresolved = chain.edges.filter((edge) => edge.resolution === 'unresolved');
      expect(unresolved.length, type).toBeGreaterThan(0);
      for (const edge of unresolved) {
        expect(activeRth(edge.rth), `${type} ${edge.id}`).toBeNull();
        expect(edge.resolution_note, `${type} ${edge.id}`).toBeTruthy();
      }
    }
  });

  it('says a heat pipe resistance cannot be derived', () => {
    const chain = chainFor({ type: 'HeatPipeOnly', contact_L_mm: 10, contact_W_mm: 10 });
    const pipe = chain.edges.find((edge) => edge.type === 'heat_pipe')!;
    expect(pipe.resolution).toBe('unresolved');
    expect(pipe.resolution_note).toContain('vendor');
  });

  /** A mount is disposable: changing it has to remove every piece of the old one. */
  it('marks every node and edge as owned by the port that made it', () => {
    const chain = chainFor({
      type: 'SmallBaseHeatPipe',
      contact_L_mm: 30,
      contact_W_mm: 20,
      height_mm: 4,
      heat_pipe_R_C_per_W: 0.25,
    });
    for (const item of [...chain.nodes, ...chain.edges]) {
      expect(isOwnedByMount(item, PORT), item.id).toBe(true);
      expect(isOwnedByMount(item, 'NODE_SOMETHING_ELSE'), item.id).toBe(false);
    }
    // Every mount edge is sweepable by the store's existing EDGE_PORT_ rule.
    for (const edge of chain.edges) expect(edge.id.startsWith('EDGE_PORT_')).toBe(true);
  });

  it('reads a stamped spec back off a node, and defaults anything older to Direct', () => {
    expect(mountOf({ metadata: { mount_spec: { type: 'Pedestal', height_mm: 8 } } })).toMatchObject(
      {
        type: 'Pedestal',
        height_mm: 8,
      },
    );
    expect(mountOf({}).type).toBe('Direct');
    expect(mountOf({ metadata: {} }).type).toBe('Direct');
  });
});
