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

const materials = () => ({
  ...defaultMaterials(),
  hsk_base_k_W_mK: sourced(96, 'Manual'),
  hsk_base_thickness_mm: sourced(6, 'Manual'),
  hsk_base_L_mm: sourced(300, 'Manual'),
  hsk_base_W_mm: sourced(220, 'Manual'),
});

const chainFor = (mount: Partial<MountSpec> & { type: MountType }, sourceAreaMm2?: number) =>
  buildMountChain({
    portNodeId: PORT,
    componentRef: 'CMP_PA',
    mount: { ...emptyMount(mount.type), ...mount },
    materials: materials(),
    sourceAreaMm2,
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
  });

  /**
   * An integral boss is the heat sink's own metal, so there is no interface
   * beneath it and no seat: one conduction step, and the spreading edge then
   * starts from the boss — which is the whole point, because the base spreads
   * from the BOSS footprint rather than the component's.
   */
  it('builds an integral boss as one conduction step and no joint', () => {
    const chain = chainFor({
      type: 'Pedestal',
      contact_L_mm: 20,
      contact_W_mm: 20,
      height_mm: 10,
    });
    expect(chain.nodes.map((node) => node.type)).toEqual(['pedestal']);
    expect(walk(chain)).toEqual({ path: ['conduction:BLOCK'], end: chain.entryNodeId });

    // 10 mm through 400 mm² of the base metal.
    const boss = chain.edges[0];
    expect(boss.parameters).toMatchObject({ length_mm: 10, k_W_mK: 96, area_mm2: 400 });
    expect(activeRth(boss.rth)).toBeCloseTo(0.01 / (96 * 400e-6), 10);
  });

  /**
   * A bolted boss breaks both assumptions the integral one rests on: it can be
   * another metal, and there is a real interface underneath that somebody has
   * to specify.
   */
  describe('a boss bolted on rather than machined in', () => {
    const bolted = (extra: Partial<MountSpec> = {}) =>
      chainFor({
        type: 'Pedestal',
        attachment: 'Bolted',
        contact_L_mm: 20,
        contact_W_mm: 20,
        height_mm: 10,
        ...extra,
      });

    it('conducts through its own metal when one is stated', () => {
      const chain = bolted({ block_k_W_mK: 385 });
      expect(chain.edges[0].parameters).toMatchObject({ k_W_mK: 385 });
    });

    it('falls back to the heat sink metal when none is stated', () => {
      expect(bolted().edges[0].parameters).toMatchObject({ k_W_mK: 96 });
    });

    /**
     * The seat is a node and not just an edge because the joint and the base
     * spreading are IN SERIES. Both hung between the boss and the base would
     * read as parallel, which is a different circuit and a wrong answer.
     */
    it('adds a dry joint and a seat for the spreading edge to start from', () => {
      const chain = bolted();
      expect(chain.nodes.map((node) => node.type)).toEqual(['pedestal', 'base_zone']);
      expect(walk(chain)).toEqual({
        path: ['conduction:BLOCK', 'contact:BASE_JOINT'],
        end: chain.entryNodeId,
      });
      // The joint carries the mount footprint, so the base still spreads from it.
      expect(chain.edges[1].parameters).toMatchObject({ area_mm2: 400 });
    });

    it('uses a stated interface material instead of dry contact', () => {
      const putty = materials().tim.find((entry) => /putty/i.test(entry.id))!;
      const chain = bolted({ joint_tim_id: putty.id, joint_blt_mm: 0.2 });
      const joint = chain.edges[1];
      expect(joint.type).toBe('tim');
      expect(joint.parameters).toMatchObject({
        thickness_mm: 0.2,
        k_W_mK: putty.k_W_mK.value!,
        area_mm2: 400,
      });
    });
  });

  /**
   * A block wider than the part it carries is a spreading problem, not a
   * column: heat enters over the component's exit face and fans out inside the
   * metal before it uses the full width.
   */
  it('spreads through a block wider than the part it carries', () => {
    const chain = chainFor(
      { type: 'Pedestal', contact_L_mm: 40, contact_W_mm: 40, height_mm: 3 },
      900,
    );
    expect(chain.edges[0].method).toBe('spreading_disc');
    expect(chain.edges[0].parameters).toMatchObject({
      thickness_mm: 3,
      plate_area_mm2: 1600,
      source_area_mm2: 900,
    });
  });

  it('carries a small base into a heat pipe and onto a seat', () => {
    const chain = chainFor({
      type: 'SmallBaseHeatPipe',
      contact_L_mm: 30,
      contact_W_mm: 20,
      height_mm: 4,
      heat_pipe_R_C_per_W: 0.25,
    });
    expect(chain.nodes.map((node) => node.type)).toEqual([
      'small_base',
      'heat_pipe_condenser',
      'base_zone',
    ]);
    expect(walk(chain).path).toEqual([
      'conduction:BLOCK',
      'heat_pipe:HEAT_PIPE',
      'contact:BASE_JOINT',
    ]);
  });

  it('takes a bare heat pipe straight off the part', () => {
    const chain = chainFor({
      type: 'HeatPipeOnly',
      contact_L_mm: 12,
      contact_W_mm: 12,
      heat_pipe_R_C_per_W: 0.4,
    });
    expect(chain.nodes.map((node) => node.type)).toEqual(['heat_pipe_condenser', 'base_zone']);
    expect(walk(chain).path).toEqual(['heat_pipe:HEAT_PIPE', 'contact:BASE_JOINT']);
    expect(activeRth(chain.edges[0].rth)).toBe(0.4);
  });

  /**
   * A vapour chamber is a vendor resistance and a footprint, nothing else. Its
   * worth is entirely the area it hands the base — the conduction through it is
   * not something this tool can derive, and an "effective k" would be a number
   * nobody measured.
   */
  describe('a vapour chamber', () => {
    const vc = () =>
      chainFor({
        type: 'VaporChamber',
        contact_L_mm: 200,
        contact_W_mm: 200,
        heat_pipe_R_C_per_W: 0.05,
      });

    it('is a vendor resistance, then a joint, then a seat', () => {
      const chain = vc();
      expect(chain.nodes.map((node) => node.type)).toEqual(['vapor_chamber', 'base_zone']);
      expect(walk(chain).path).toEqual(['heat_pipe:VAPOR_CHAMBER', 'contact:BASE_JOINT']);
      expect(activeRth(chain.edges[0].rth)).toBe(0.05);
    });

    /** The footprint it hands the base is the entire reason to fit one. */
    it('hands its own footprint to the base, not the part it carries', () => {
      expect(vc().edges[1].parameters).toMatchObject({ area_mm2: 40000 });
    });

    it('is always a separate part, whatever the record says', () => {
      const chain = chainFor({
        type: 'VaporChamber',
        attachment: 'Integral',
        contact_L_mm: 200,
        contact_W_mm: 200,
      });
      expect(chain.nodes.map((node) => node.type)).toContain('base_zone');
    });

    it('says its resistance is a vendor number and cannot be derived', () => {
      const chain = chainFor({ type: 'VaporChamber', contact_L_mm: 200, contact_W_mm: 200 });
      const device = chain.edges[0];
      expect(device.resolution).toBe('unresolved');
      expect(device.resolution_note).toContain('vendor');
      expect(device.resolution_note).toContain('stated power');
    });
  });

  /**
   * The tool's standing rule. A mount the engineer has chosen but not yet
   * dimensioned still draws — the topology is never withheld — and every edge
   * that cannot resolve says which field is missing.
   */
  it('draws the topology even with nothing dimensioned, and never invents a value', () => {
    for (const type of ['Pedestal', 'SmallBaseHeatPipe', 'HeatPipeOnly', 'VaporChamber'] as const) {
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
        // A field the stored record predates.
        attachment: 'Integral',
      },
    );
    expect(mountOf({}).type).toBe('Direct');
    expect(mountOf({ metadata: {} }).type).toBe('Direct');
  });
});
