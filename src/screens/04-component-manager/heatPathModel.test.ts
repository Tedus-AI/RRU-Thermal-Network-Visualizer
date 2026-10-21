/**
 * The heat path panel's chain is Screen 05's chain for one device. These pin
 * the numbers to the STARKCORE parts the panel was designed against, and check
 * that each path and mount produces the steps — and the missing inputs — an
 * engineer would expect to see.
 */

import { describe, expect, it } from 'vitest';

import {
  createComponent,
  emptyMount,
  type Component,
  type HeatPathType,
  type MountSpec,
} from '@/domain/component';
import { DIRECT_CONTACT_TIM_ID, defaultMaterials, type MaterialDefaults } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { heatPathView } from './heatPathModel';

const materials: MaterialDefaults = {
  ...defaultMaterials(),
  copper_k_W_mK: sourced(380, 'Manual'),
  via_effective_k_W_mK: sourced(28, 'Manual'),
  via_efficiency: sourced(0.9, 'Manual'),
  solder_k_W_mK: sourced(58, 'Manual'),
  solder_thickness_mm: sourced(0.3, 'Manual'),
  solder_voiding: sourced(0.75, 'Manual'),
  contact_conductance_W_m2K: sourced(10000, 'Manual'),
  coin_L_mm: sourced(43, 'Manual'),
  coin_W_mm: sourced(39.6, 'Manual'),
  coin_thickness_mm: sourced(2.5, 'Manual'),
  hsk_base_k_W_mK: sourced(150, 'Manual'),
  hsk_base_thickness_mm: sourced(7, 'Manual'),
  hsk_base_L_mm: sourced(336, 'Manual'),
  hsk_base_W_mm: sourced(275, 'Manual'),
};

function part(input: {
  name: string;
  heatPath: HeatPathType;
  power: number;
  qty?: number;
  limit?: number | null;
  limitType?: 'Tj' | 'Tc' | 'Tb' | 'Ts';
  rjc?: number | null;
  body?: boolean;
  L?: number;
  W?: number;
  H?: number;
  sourceL?: number;
  sourceW?: number;
  board?: number;
  timId?: string | null;
  blt?: number;
  mount?: Partial<MountSpec>;
  parameters?: Record<string, number | string | boolean | null>;
}): Component {
  const base = createComponent({
    id: `CMP_${input.name}`,
    name: input.name,
    category: 'RF',
    qty: input.qty ?? 1,
    power_W: input.power,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-10-21T00:00:00.000Z',
    },
  });
  const spec = base.thermal_spec;
  return {
    ...base,
    thermal_spec: {
      ...spec,
      limit_type: input.limitType ?? 'Tj',
      limit_C: input.limit === null ? null : sourced(input.limit ?? 150, 'Manual'),
      r_jc_C_per_W: input.rjc == null ? null : sourced(input.rjc, 'Manual'),
      geometry: {
        ...spec.geometry,
        package_L_mm: input.L ?? null,
        package_W_mm: input.W ?? null,
        package_H_mm: input.H ?? null,
        source_L_mm: input.sourceL ?? null,
        source_W_mm: input.sourceW ?? null,
        board_thickness_mm: input.board ?? null,
      },
      heat_path: {
        type: input.heatPath,
        parameters: {
          ...(input.body ? { source_model: 'SurfaceBodyBased' } : {}),
          ...input.parameters,
        },
      },
      tim: {
        ...spec.tim,
        tim_id: input.timId === undefined ? 'TIM_GREASE' : input.timId,
        blt_mm: input.blt != null ? sourced(input.blt, 'Manual') : null,
      },
      mount: { ...emptyMount(input.mount?.type ?? 'Direct'), ...input.mount },
    },
  };
}

const ids = (view: ReturnType<typeof heatPathView>) => view.segments.map((segment) => segment.id);
const R = (view: ReturnType<typeof heatPathView>, id: string) =>
  view.segments.find((segment) => segment.id === id)?.R ?? null;

describe('heat path panel chain', () => {
  it('matches 05 on the PA: Rjc, solder, coin and TIM for one device', () => {
    const pa = part({
      name: 'GTRB384608FC',
      heatPath: 'Coin',
      power: 52.99,
      qty: 4,
      limit: 225,
      rjc: 1.5,
      L: 20.57,
      W: 9.78,
      H: 3.78,
    });
    const view = heatPathView(pa, materials);

    expect(ids(view)).toEqual(['rjc', 'solder', 'coin', 'tim', 'spread']);
    expect(R(view, 'rjc')).toBe(1.5);
    expect(R(view, 'solder')).toBeCloseTo(0.03428, 5);
    expect(R(view, 'coin')).toBeCloseTo(0.01124, 5);
    // Grease at the material's own BLT, under the whole coin face.
    const grease = materials.tim.find((entry) => entry.id === 'TIM_GREASE')!;
    expect(R(view, 'tim')).toBeCloseTo(
      grease.blt_mm.value! / 1000 / (grease.k_W_mK.value! * ((43 * 39.6) / 1e6)),
      8,
    );
    // One device, not four: the ×4 must not divide the numbers.
    expect(view.powerW).toBeCloseTo(52.99);
    expect(view.missing).toEqual([]);
    expect(view.refR).toBeCloseTo(1.5 + 0.03428 + 0.01124 + (R(view, 'tim') ?? 0), 5);
    expect(view.baseMax).toBeCloseTo(225 - 52.99 * (view.refR ?? 0), 5);
  });

  it('builds the via step from the E-PAD, the board and the 45° spread face', () => {
    const driver = part({
      name: 'B11G3338N81D',
      heatPath: 'Board',
      power: 9.751,
      rjc: 1.7,
      L: 12,
      W: 7,
      sourceL: 9.8,
      sourceW: 4.8,
      board: 2.2,
      timId: DIRECT_CONTACT_TIM_ID,
      parameters: { via_effective_k_W_mK: 25.4, via_efficiency: 1 },
    });
    const view = heatPathView(driver, materials);

    expect(ids(view)).toEqual(['rjc', 'via', 'tim', 'spread']);
    const source = 9.8 * 4.8;
    const spread = (9.8 + 2.2) * (4.8 + 2.2);
    expect(R(view, 'via')).toBeCloseTo(2.2 / 1000 / (25.4 * (Math.sqrt(source * spread) / 1e6)), 6);
    // A dry joint over the spread face: 1 / (h · A).
    expect(R(view, 'tim')).toBeCloseTo(1 / (10000 * (spread / 1e6)), 6);
    expect(view.segments.find((segment) => segment.id === 'tim')?.dry).toBe(true);
    expect(view.via).toMatchObject({ k: 25.4, eff: 1, kCustom: true, effCustom: true });
  });

  it('names what is missing in the field the engineer has to fill', () => {
    const blank = part({ name: 'New', heatPath: 'Board', power: 2, rjc: null, limit: null });
    const view = heatPathView(blank, materials);

    expect(view.missing).toEqual(['限溫', 'Rjc', '板厚', 'E-PAD 長寬']);
    expect(view.refR).toBeNull();
    expect(view.baseMax).toBeNull();
  });

  it('drops the Rjc for a body source and judges a surface limit without it', () => {
    const module = part({
      name: 'Power Module',
      heatPath: 'DirectMetal',
      power: 29,
      limit: 95,
      limitType: 'Ts',
      body: true,
      L: 61,
      W: 58,
      H: 12,
      timId: 'TIM_PUTTY',
    });
    const view = heatPathView(module, materials);

    expect(view.junction).toBe(false);
    expect(ids(view)).toEqual(['tim', 'spread']);
    expect(view.timArea).toBe(61 * 58);
    expect(view.refR).toBe(R(view, 'tim'));
  });

  it('leaves the Rjc out of a Tc estimate but keeps it in the chain', () => {
    const ddr = part({
      name: '2GB_DDR',
      heatPath: 'TopSurface',
      power: 0.545,
      limit: 95,
      limitType: 'Tc',
      rjc: 14,
      L: 13,
      W: 7.5,
      timId: 'TIM_PUTTY',
    });
    const view = heatPathView(ddr, materials);

    expect(ids(view)).toEqual(['rjc', 'tim', 'spread']);
    expect(view.refR).toBe(R(view, 'tim'));
  });

  it('puts embedded heat pipes beside the base, R per pipe over the count', () => {
    const fpga = part({
      name: 'XCZU67DR',
      heatPath: 'TopSurface',
      power: 35,
      limit: 100,
      rjc: 0.16,
      L: 35,
      W: 35,
      timId: 'TIM_PUTTY',
      blt: 0.4,
      mount: {
        type: 'EmbeddedHeatPipe',
        contact_L_mm: 35,
        contact_W_mm: 6.5,
        heat_pipe_count: 2,
        heat_pipe_R_C_per_W: 0.13,
      },
    });
    const view = heatPathView(fpga, materials);
    const pipe = view.segments.find((segment) => segment.id === 'pipe');

    expect(ids(view)).toEqual(['rjc', 'tim', 'pipe', 'spread']);
    expect(pipe).toMatchObject({ name: '熱管 ×2', parallel: true });
    expect(pipe?.R).toBeCloseTo(0.065, 6);
    expect(view.tim).toMatchObject({ kind: 'material', blt: 0.4, custom: true });
    // A parallel branch is not part of the series estimate.
    expect(view.refR).toBeCloseTo(0.16 + (R(view, 'tim') ?? 0), 6);
  });

  it('builds a bolted boss as block, then joint, both in series', () => {
    const boss = part({
      name: 'Boss',
      heatPath: 'TopSurface',
      power: 10,
      rjc: 1,
      L: 20,
      W: 20,
      mount: {
        type: 'Pedestal',
        contact_L_mm: 20,
        contact_W_mm: 20,
        height_mm: 5,
        attachment: 'Bolted',
      },
    });
    const view = heatPathView(boss, materials);

    expect(ids(view)).toEqual(['rjc', 'tim', 'block', 'joint', 'spread']);
    // No wider than the part, so a plain column of base metal.
    expect(R(view, 'block')).toBeCloseTo(5 / 1000 / (150 * (400 / 1e6)), 6);
    expect(R(view, 'joint')).toBeCloseTo(1 / (10000 * (400 / 1e6)), 6);
    expect(view.segments.every((segment) => !segment.parallel)).toBe(true);
  });

  it('says which mount input is missing', () => {
    const boss = part({
      name: 'Boss',
      heatPath: 'TopSurface',
      power: 10,
      rjc: 1,
      L: 20,
      W: 20,
      mount: { type: 'Pedestal' },
    });
    expect(heatPathView(boss, materials).missing).toEqual(['凸台高度', '凸台長寬']);
  });
});
