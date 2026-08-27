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

const chainFor = (mount: Partial<MountSpec> & { type: MountType }, sourceAreaMm2?: number) =>
  buildMountChain({
    portNodeId: PORT,
    targetNodeId: BASE,
    componentRef: 'CMP_PA',
    mount: { ...emptyMount(mount.type), ...mount },
    materials: materials(),
    sourceAreaMm2,
  });

/**
 * The CONDUCTION route, in the order heat travels.
 *
 * A parallel mount has two edges leaving one node, so this follows the one that
 * does not jump straight to the structure — that is the bypass, and it is
 * asserted on directly rather than walked.
 */
const walk = (chain: MountChain) => {
  const byFrom = new Map<string, ThermalEdge>(
    chain.edges.filter((edge) => edge.to !== BASE).map((edge) => [edge.from, edge]),
  );
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

  /**
   * A local block SITS ON the main base — that is what a local block is — so
   * heat arriving in it splits two ways: down through the joint, and along the
   * pipe soldered underneath. Built as a series chain this read 0.761 C/W
   * against 0.183 for the real circuit: 4.2x pessimistic, and in the direction
   * that makes a heat pipe look like pure added resistance.
   */
  describe('a local block with a heat pipe under it', () => {
    const blockPipe = () =>
      chainFor({
        type: 'SmallBaseHeatPipe',
        contact_L_mm: 30,
        contact_W_mm: 20,
        height_mm: 4,
        heat_pipe_R_C_per_W: 0.25,
      });

    it('sends the pipe to the base IN PARALLEL with the joint under the block', () => {
      const chain = blockPipe();
      expect(chain.nodes.map((node) => node.type)).toEqual(['small_base', 'base_zone']);

      const block = chain.nodes.find((node) => node.type === 'small_base')!;
      const leavingBlock = chain.edges.filter((edge) => edge.from === block.id);
      expect(leavingBlock).toHaveLength(2);
      // One down through the joint onto the seat, one straight to the structure.
      expect(leavingBlock.map((edge) => edge.type).sort()).toEqual(['contact', 'heat_pipe']);
      expect(leavingBlock.find((edge) => edge.type === 'heat_pipe')!.to).toBe(BASE);
    });

    /** The conduction route still ends on a seat, so the base still spreads. */
    it('keeps the downward route ending where the spreading edge starts', () => {
      const chain = blockPipe();
      expect(walk(chain).path).toEqual(['conduction:BLOCK', 'contact:BASE_JOINT']);
      expect(chain.needsBaseEdge).toBe(true);
      expect(chain.entryNodeId).toBe(chain.nodes.find((node) => node.type === 'base_zone')!.id);
    });
  });

  /**
   * Pipes lying in grooves in the base, machined flush. The part sits on a face
   * that is part copper and part aluminium, so heat has TWO routes to the fins
   * and they are in parallel. Modelled as a series chain this read 0.380 C/W
   * where the parallel circuit gives 0.071 — wrong in the direction that makes
   * an embedded pipe look like a penalty for fitting one.
   */
  describe('a heat pipe embedded in the base', () => {
    const embedded = (extra: Partial<MountSpec> = {}, source?: number) =>
      chainFor(
        {
          type: 'EmbeddedHeatPipe',
          contact_L_mm: 40,
          contact_W_mm: 16,
          heat_pipe_R_C_per_W: 0.1,
          ...extra,
        },
        source,
      );

    it('adds no body and no joint — the pipe is already in the base', () => {
      const chain = embedded({}, 1600);
      expect(chain.nodes).toEqual([]);
      expect(chain.edges).toHaveLength(1);
      expect(chain.entryNodeId).toBe(PORT);
    });

    it('runs one edge from the part straight to the structure', () => {
      const pipe = embedded({}, 1600).edges[0];
      expect(pipe.from).toBe(PORT);
      expect(pipe.to).toBe(BASE);
      expect(pipe.type).toBe('heat_pipe');
      expect(activeRth(pipe.rth)).toBe(0.1);
    });

    /*
       The count applies to BOTH halves: copper is L x W x pipes, and the branch
       is R_one / pipes, because N identical pipes run between the same two
       points. Anything else asks the engineer to do one of those two
       multiplications by hand.
    */
    it('multiplies the copper and divides the resistance by the pipe count', () => {
      const chain = embedded({ heat_pipe_count: 2 }, 2000);
      const pipe = chain.edges[0];
      expect(activeRth(pipe.rth)).toBeCloseTo(0.05, 9);
      expect(pipe.parameters?.R_per_pipe_C_per_W).toBe(0.1);
      expect(pipe.parameters?.pipes).toBe(2);
      // copper = 40 x 16 x 2 = 1280
      expect(chain.spreadingSourceAreaMm2).toBe(2000 - 1280);
    });

    it('leaves a single pipe exactly as the vendor quoted it', () => {
      expect(activeRth(embedded({ heat_pipe_count: 1 }, 1600).edges[0].rth)).toBe(0.1);
      expect(activeRth(embedded({}, 1600).edges[0].rth)).toBe(0.1);
    });

    it('stays unresolved when no resistance is quoted, whatever the count', () => {
      const pipe = embedded({ heat_pipe_R_C_per_W: null, heat_pipe_count: 3 }, 1600).edges[0];
      expect(activeRth(pipe.rth)).toBeNull();
      expect(pipe.resolution).not.toBe('resolved');
      expect(pipe.parameters?.pipes).toBe(3);
    });

    /** The copper is not available to the aluminium branch. */
    it('leaves the caller only the aluminium that the pipes do not occupy', () => {
      expect(embedded({}, 1600).spreadingSourceAreaMm2).toBe(1600 - 640);
      expect(embedded({}, 1600).needsBaseEdge).toBe(true);
    });

    it('has no aluminium branch when the pipes cover the whole face', () => {
      const chain = embedded({ contact_L_mm: 40, contact_W_mm: 40 }, 1600);
      expect(chain.spreadingSourceAreaMm2).toBe(0);
      expect(chain.needsBaseEdge).toBe(false);
    });

    /** Nothing to subtract from means nothing to say; the caller reads the graph. */
    it('does not invent an area when the component exit face is unstated', () => {
      expect(embedded().spreadingSourceAreaMm2).toBeNull();
      expect(embedded().needsBaseEdge).toBe(true);
    });
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
    for (const type of [
      'Pedestal',
      'SmallBaseHeatPipe',
      'EmbeddedHeatPipe',
      'VaporChamber',
    ] as const) {
      const chain = chainFor({ type });
      expect(chain.edges.length, type).toBeGreaterThan(0);
      // An embedded pipe deliberately builds no node: it is a bypass off the
      // face the part already sits on, not a body between the two.
      if (type !== 'EmbeddedHeatPipe') expect(chain.nodes.length, type).toBeGreaterThan(0);

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
