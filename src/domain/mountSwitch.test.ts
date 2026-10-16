/**
 * Switching a part between mount types to compare them.
 *
 * The mount fields are shared by every type and mean different things in each:
 * an embedded pipe's width and resistance are ONE pipe's, a vapour chamber's
 * are the whole chamber's. Comparing the two on a real XCZU67DR — a 60 × 60
 * chamber at 0.015 °C/W against two 6.5 mm pipes at 0.13 each — went VC → pipes
 * → VC and came back with a 35 × 6.5 chamber at 0.13 °C/W: the pipe's numbers,
 * drawn on Screen 05 as a chamber, and a joint four times its real resistance.
 */

import { describe, expect, it } from 'vitest';

import {
  createComponent,
  emptyMount,
  switchMountType,
  type MountSpec,
  type ThermalSpec,
} from './component';

const VC: MountSpec = {
  ...emptyMount('VaporChamber'),
  contact_L_mm: 60,
  contact_W_mm: 60,
  heat_pipe_R_C_per_W: 0.015,
  heat_pipe_qmax_W: 60,
  joint_tim_id: 'TIM_PUTTY',
  joint_blt_mm: 0.5,
};
const PIPES: MountSpec = {
  ...emptyMount('EmbeddedHeatPipe'),
  contact_L_mm: 35,
  contact_W_mm: 6.5,
  heat_pipe_count: 2,
  heat_pipe_R_C_per_W: 0.13,
  heat_pipe_qmax_W: 20,
};

function spec(mount: MountSpec = VC): ThermalSpec {
  const base = createComponent({
    id: 'CMP_FPGA',
    name: 'FPGA-A',
    category: 'Digital',
    qty: 1,
    power_W: 35,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-10-16T00:00:00.000Z',
    },
  });
  return { ...base.thermal_spec, mount };
}

/** What Screen 04 does with the type picker: apply the switch to the spec. */
const apply = (from: ThermalSpec, type: Parameters<typeof switchMountType>[1]): ThermalSpec => ({
  ...from,
  ...switchMountType(from, type),
});

describe('switching a part to another mount type', () => {
  it('never hands the new type the old type’s numbers', () => {
    const switched = apply(spec(VC), 'EmbeddedHeatPipe');

    expect(switched.mount).toEqual(emptyMount('EmbeddedHeatPipe'));
  });

  it('brings each type back exactly as it was left', () => {
    let current = apply(spec(VC), 'EmbeddedHeatPipe');
    current = { ...current, mount: PIPES };
    current = apply(current, 'VaporChamber');

    expect(current.mount).toEqual(VC);

    current = apply(current, 'EmbeddedHeatPipe');
    expect(current.mount).toEqual(PIPES);
  });

  it('remembers only the types not in use, and keeps nothing for Direct', () => {
    const toPipes = apply(spec(VC), 'EmbeddedHeatPipe');
    expect(Object.keys(toPipes.mount_by_type ?? {})).toEqual(['VaporChamber']);

    const toDirect = apply({ ...toPipes, mount: PIPES }, 'Direct');
    expect(Object.keys(toDirect.mount_by_type ?? {}).sort()).toEqual([
      'EmbeddedHeatPipe',
      'VaporChamber',
    ]);

    const back = apply(toDirect, 'VaporChamber');
    expect(back.mount).toEqual(VC);
    expect(Object.keys(back.mount_by_type ?? {})).toEqual(['EmbeddedHeatPipe']);
  });

  it('is a no-op when the type does not change', () => {
    const same = switchMountType(spec(VC), 'VaporChamber');

    expect(same.mount).toEqual(VC);
    expect(same.mount_by_type).toBeUndefined();
  });

  it('keeps a vapour chamber bolted whatever was remembered for it', () => {
    const remembered: ThermalSpec = {
      ...spec(emptyMount('Direct')),
      mount_by_type: { VaporChamber: { ...VC, attachment: 'Integral' } },
    };

    expect(apply(remembered, 'VaporChamber').mount?.attachment).toBe('Bolted');
  });
});
