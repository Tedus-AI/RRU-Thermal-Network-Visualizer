/**
 * The lever targets, checked against the calculators they are read backwards
 * from.
 *
 * A target is only worth showing if putting it back through the forward
 * calculator reproduces the resistance the slider asked for. That is what these
 * assert: not that the arithmetic matches a hand-written expectation, but that
 * the round trip closes.
 */

import { describe, expect, it } from 'vitest';

import { computeRth } from '../resistance/calculators';
import { createRth } from '../rth';
import type { EdgeMethod, ThermalEdge, ThermalNetwork } from '../types';

import { segmentLevers, targetValue } from './tunableParameters';

function edge(
  id: string,
  method: EdgeMethod,
  parameters: Record<string, number>,
  type = 'tim',
): ThermalEdge {
  const computed = computeRth(method, parameters);
  return {
    id,
    from: 'A',
    to: 'B',
    type: type as ThermalEdge['type'],
    method,
    rth: createRth(computed.value, 'Analytical', 'high'),
    parameters,
    heat_flow_W: null,
    delta_T_C: null,
    resolution: 'resolved',
    enabled: true,
  };
}

function networkOf(...edges: ThermalEdge[]): ThermalNetwork {
  return {
    schema_version: '1.0',
    project_id: 'TEST',
    id: 'NET',
    name: 'levers',
    nodes: {},
    edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
    created_at: '',
    updated_at: '',
  } as unknown as ThermalNetwork;
}

const TIM = { thickness_mm: 0.25, k_W_mK: 3, area_mm2: 400 };

describe('targetValue', () => {
  it('scales a numerator down by the reduction', () => {
    expect(targetValue(0.25, 1, 20)).toBeCloseTo(0.2, 10);
  });

  it('scales a denominator up by 1/(1 − r)', () => {
    expect(targetValue(3, -1, 20)).toBeCloseTo(3.75, 10);
  });

  it('has nothing to say without an exponent, at 0 %, or at 100 %', () => {
    expect(targetValue(3, null, 20)).toBeNull();
    expect(targetValue(3, -1, 0)).toBeNull();
    expect(targetValue(3, -1, 100)).toBeNull();
    expect(targetValue(null, -1, 20)).toBeNull();
  });
});

describe('segmentLevers', () => {
  it('offers the three TIM inputs, each with the value that buys the cut', () => {
    const network = networkOf(edge('E1', 'tim_thickness_k', TIM));
    const result = segmentLevers(network, 'S1', 'E1', 'Lid → TIM', 20);

    expect(result.levers.map((lever) => lever.key)).toEqual([
      'thickness_mm',
      'k_W_mK',
      'area_mm2',
    ]);
    expect(result.levers.map((lever) => lever.direction)).toEqual(['down', 'up', 'up']);
    expect(result.rth_after_C_per_W).toBeCloseTo(result.rth_before_C_per_W! * 0.8, 12);
  });

  it('every target, put back through the calculator, gives the asked-for Rth', () => {
    const network = networkOf(edge('E1', 'tim_thickness_k', TIM));
    const result = segmentLevers(network, 'S1', 'E1', 'Lid → TIM', 20);
    const wanted = result.rth_after_C_per_W!;

    for (const lever of result.levers) {
      expect(lever.target, lever.key).not.toBeNull();
      const forward = computeRth('tim_thickness_k', { ...TIM, [lever.key]: lever.target! });
      expect(forward.value, lever.key).toBeCloseTo(wanted, 12);
    }
  });

  it('holds for the 1/(h·A) form too, where both inputs go up', () => {
    const params = { h_c_W_m2K: 5000, area_mm2: 600 };
    const network = networkOf(edge('E1', 'contact_hc', params, 'contact'));
    const result = segmentLevers(network, 'S1', 'E1', 'Base → Plate', 35);
    const wanted = result.rth_after_C_per_W!;

    expect(result.levers.every((lever) => lever.direction === 'up')).toBe(true);
    for (const lever of result.levers) {
      const forward = computeRth('contact_hc', { ...params, [lever.key]: lever.target! });
      expect(forward.value, lever.key).toBeCloseTo(wanted, 12);
    }
  });

  /**
   * The spreading disc has no exponent to invert, so its targets come from
   * searching the calculator. The check is the same one: put the target back
   * through `computeRth` and it has to land on the number.
   */
  it('searches the spreading disc, and every target it returns is exact', () => {
    const params = {
      source_area_mm2: 100,
      plate_area_mm2: 10000,
      thickness_mm: 6,
      k_W_mK: 200,
    };
    const network = networkOf(edge('E1', 'spreading_disc', params, 'spreading'));
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → Base', 20);
    const wanted = computeRth('spreading_disc', params).value! * 0.8;

    expect(result.levers.every((lever) => lever.exponent === null)).toBe(true);
    expect(result.levers.some((lever) => lever.target != null)).toBe(true);

    for (const lever of result.levers) {
      if (lever.target == null) continue;
      const forward = computeRth('spreading_disc', { ...params, [lever.key]: lever.target });
      // A bisection, not a closed form: six figures, not twelve.
      expect(forward.value, lever.key).toBeCloseTo(wanted, 8);
    }
  });

  /**
   * Plate thickness is why the search runs BOTH ways.
   *
   * A thicker plate spreads further sideways and adds one-dimensional drop, so
   * which way helps depends on where the design already sits. On the real
   * STARKCORE base — 7 mm of aluminium under a 3538 mm² footprint — the 1-D
   * term dominates, so the answer is a THINNER plate, and the arrow shown has
   * to say so. Reading the declared "up" off the spec would have sent the
   * reader the wrong way.
   */
  const BASE = {
    source_area_mm2: 3538,
    plate_area_mm2: 92400,
    thickness_mm: 7,
    k_W_mK: 150,
  };

  it('turns the arrow round when the other direction is the one that helps', () => {
    const network = networkOf(edge('E1', 'spreading_disc', BASE, 'spreading'));
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → HSK Base', 16.9);
    const wanted = computeRth('spreading_disc', BASE).value! * (1 - 0.169);

    const thickness = result.levers.find((lever) => lever.key === 'thickness_mm')!;
    expect(thickness.direction).toBe('down');
    expect(thickness.target).toBeLessThan(7);
    expect(
      computeRth('spreading_disc', { ...BASE, thickness_mm: thickness.target! }).value,
    ).toBeCloseTo(wanted, 8);
  });

  /**
   * And when NEITHER direction reaches it, the turning point is the answer.
   *
   * A bigger base is the intuitive move and, on this geometry, very nearly a
   * useless one: the footprint already covers 3.8 % of the plate and the
   * one-dimensional drop through 7 mm dominates, so growing the base buys
   * 0.000002 °C/W and then starts costing. Telling the reader that is the
   * point of the row — it is exactly the change someone would otherwise spend
   * a week on.
   */
  it('reports the turning point rather than a target it cannot reach', () => {
    const network = networkOf(edge('E1', 'spreading_disc', BASE, 'spreading'));
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → HSK Base', 16.9);

    const plate = result.levers.find((lever) => lever.key === 'plate_area_mm2')!;
    expect(plate.target).toBeNull();
    expect(plate.limit?.reason).toBe('optimum');
    // Whatever it reports as the best, the calculator has to agree.
    expect(
      computeRth('spreading_disc', { ...BASE, plate_area_mm2: plate.limit!.at_value }).value,
    ).toBeCloseTo(plate.limit!.best_rth_C_per_W, 10);
    expect(plate.limit!.best_rth_C_per_W).toBeLessThan(computeRth('spreading_disc', BASE).value!);
  });

  /**
   * A refined spreading edge carries the Biot number Screen 07 computed for it,
   * and Bi = h_eff·b/k contains the very conductivity this row proposes to
   * change. Holding Bi still while moving k would answer a question about a
   * plate that does not exist — and it is not a small error: on this edge the
   * uncorrected target is nearly a third off.
   */
  it('moves Bi with k, because Bi is built on k', () => {
    const withBi = { ...BASE, bi: 0.42 };
    const network = networkOf(edge('E1', 'spreading_disc', withBi, 'spreading'));
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → HSK Base', 20);
    const wanted = computeRth('spreading_disc', withBi).value! * 0.8;

    const k = result.levers.find((lever) => lever.key === 'k_W_mK')!;
    expect(k.target).not.toBeNull();

    // Bi ∝ 1/k: h_eff and b do not depend on the plate's conductivity.
    const corrected = computeRth('spreading_disc', {
      ...withBi,
      k_W_mK: k.target!,
      bi: (0.42 * BASE.k_W_mK) / k.target!,
    });
    expect(corrected.value).toBeCloseTo(wanted, 8);

    // And the same target with Bi frozen does NOT land on it.
    const frozen = computeRth('spreading_disc', { ...withBi, k_W_mK: k.target! });
    expect(Math.abs(frozen.value! - wanted) / wanted).toBeGreaterThan(0.05);
  });

  /**
   * The plate area is the one input this cannot answer for. Under a finite Bi
   * it sets b and the h_eff that Bi was built from, and past this edge it sets
   * the convection surface Screen 06 computes — so it gets a direction and a
   * reason, not a number that only holds in a model nobody is building.
   */
  it('will not put a number on the base area once Bi is finite', () => {
    const network = networkOf(edge('E1', 'spreading_disc', { ...BASE, bi: 0.42 }, 'spreading'));
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → HSK Base', 20);

    const plate = result.levers.find((lever) => lever.key === 'plate_area_mm2')!;
    expect(plate.target).toBeNull();
    expect(plate.limit).toBeUndefined();
    expect(plate.note).toMatch(/Screen 06/);
  });

  /** A footprint cannot outgrow the plate it sits on, however much it would help. */
  it('will not ask for a contact patch bigger than the base', () => {
    const network = networkOf(edge('E1', 'spreading_disc', BASE, 'spreading'));
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → HSK Base', 99);

    const source = result.levers.find((lever) => lever.key === 'source_area_mm2')!;
    expect(source.target).toBeNull();
    expect(source.limit?.at_value).toBeLessThanOrEqual(BASE.plate_area_mm2);
  });

  /** A fraction cannot pass 1, whatever the closed form says it needs. */
  it('will not ask for more than all of a solder joint', () => {
    const params = { thickness_mm: 0.1, k_W_mK: 50, area_mm2: 400, voiding: 0.95 };
    const network = networkOf(edge('E1', 'solder_voiding', params, 'solder'));
    const result = segmentLevers(network, 'S1', 'E1', 'Die → Pad', 30);

    const voiding = result.levers.find((lever) => lever.key === 'voiding')!;
    expect(voiding.target).toBeNull();
    expect(voiding.limit).toEqual({
      best_rth_C_per_W: computeRth('solder_voiding', { ...params, voiding: 1 }).value!,
      at_value: 1,
      reason: 'bound',
    });
  });

  it('sends a package resistance to Screen 04, not to the edge parameters', () => {
    const network = networkOf(edge('E1', 'direct_rth', { R_C_per_W: 0.16 }, 'package_rjc'));
    const result = segmentLevers(network, 'S1', 'E1', 'Junction → Lid', 25);

    expect(result.levers).toHaveLength(1);
    expect(result.levers[0].screen).toBe('04');
    expect(result.levers[0].value).toBeCloseTo(0.16, 12);
    expect(result.levers[0].target).toBeCloseTo(0.12, 12);
  });

  it('sends a boundary-derived edge to Screen 06 with no value of its own', () => {
    const network = networkOf(edge('E1', 'convection_hA', {}, 'convection'));
    const result = segmentLevers(network, 'S1', 'E1', 'Fin → Ambient', 20);

    expect(result.levers).toHaveLength(1);
    expect(result.levers[0].screen).toBe('06');
    expect(result.levers[0].value).toBeNull();
    expect(result.levers[0].target).toBeNull();
  });

  it('reads the scenario override, so the levers match the segment being tuned', () => {
    const base = edge('E1', 'tim_thickness_k', TIM);
    const network = networkOf({
      ...base,
      scenario_overrides: { S1: { R_C_per_W: 1.5 } },
    });
    const result = segmentLevers(network, 'S1', 'E1', 'Lid → TIM', 50);

    expect(result.rth_before_C_per_W).toBeCloseTo(1.5, 12);
    expect(result.rth_after_C_per_W).toBeCloseTo(0.75, 12);
  });

  it('says so rather than inventing levers for an edge that has gone', () => {
    const result = segmentLevers(networkOf(), 'S1', 'MISSING', 'gone', 20);
    expect(result.levers).toHaveLength(0);
    expect(result.message).toMatch(/no longer/);
  });
});
