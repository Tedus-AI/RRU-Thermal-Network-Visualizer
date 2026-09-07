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

  it('gives the spreading disc directions but no target, because it is not a power law', () => {
    const network = networkOf(
      edge(
        'E1',
        'spreading_disc',
        { source_area_mm2: 100, plate_area_mm2: 10000, thickness_mm: 6, k_W_mK: 200 },
        'spreading',
      ),
    );
    const result = segmentLevers(network, 'S1', 'E1', 'TIM → Base', 20);

    expect(result.levers.length).toBeGreaterThan(0);
    expect(result.levers.every((lever) => lever.target === null)).toBe(true);
    expect(result.levers.every((lever) => lever.direction === 'up')).toBe(true);
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
