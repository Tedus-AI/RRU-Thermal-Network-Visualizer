/**
 * "I want this segment 20 % lower — what do I actually change, and to what?"
 *
 * A reduction slider on Screen 08 is a wish. This turns the wish into the
 * inputs it would take: for every parameter the segment's own resistance is
 * computed from, which way it has to move and, where the relationship is an
 * exact power law, the number it has to reach.
 *
 * The arithmetic is the calculators' own, read backwards. Every method in
 * `resistance/calculators.ts` except the spreading disc is a product of powers:
 *
 *     conduction / TIM / solder / via    R = t / (k · A · f)
 *     bare contact                       R = 1 / (h_c · A)
 *     a quoted resistance                R = R
 *
 * so R ∝ xᵉ for each input x, and the value that buys a reduction r is
 *
 *     x' = x · (1 − r)^(1/e)
 *
 * — thickness down by the same fraction, conductivity and area up by 1/(1−r).
 *
 * The spreading disc has no such exponent: it is a Bessel series in the ratio of
 * the two radii, the thickness ratio and the Biot number. It gets a target
 * anyway, found by running `computeRth` forward until it lands on the number —
 * bracket, then bisect. That is exact to the tolerance asked for, and it is the
 * same calculator Screen 05 will recompute from when the value is typed in, so
 * the answer is reproducible rather than asymptotic.
 *
 * Which is also how this reports the cases a single input CANNOT reach. Plate
 * thickness spreads further sideways and adds one-dimensional drop, so the
 * resistance through it has a minimum: past that, more metal is worse. A solder
 * joint's effective area cannot exceed 1. Where the search runs into a bound or
 * a turning point it says so, and says how far that input gets on its own,
 * which is a more useful answer than a target nobody can buy.
 *
 * Nothing here writes anything. It names the field and the screen that owns it,
 * because that is where the change is actually made: 08 is an argument about a
 * design, not an editor of one.
 */

import { computeRth, type EdgeParameters } from '../resistance/calculators';
import { edgeResistance } from '../rth';
import type { EdgeMethod, ThermalEdge, ThermalNetwork } from '../types';

/** Where the parameter is actually edited. */
export type LeverScreen = '04' | '05' | '06';

/** Why one input alone cannot reach the target. */
export interface LeverLimit {
  /** The best this input can do by itself, °C/W. */
  best_rth_C_per_W: number;
  /** The value it reaches that at. */
  at_value: number;
  /** `bound` — a physical ceiling; `optimum` — past here it gets worse again. */
  reason: 'bound' | 'optimum';
}

export interface Lever {
  /** The parameter key in `edge.parameters`, or a synthetic id for a 06 input. */
  key: string;
  label: string;
  zh: string;
  unit: string;
  /** Current value, or null when the input lives outside the edge (Screen 06). */
  value: number | null;
  /** Which way this input has to move to bring the resistance down. */
  direction: 'up' | 'down';
  /**
   * R ∝ value^exponent, where it is a power law. `null` otherwise, in which
   * case the target below was found by searching the calculator instead.
   */
  exponent: number | null;
  /** What the value would have to become. Null only when it cannot get there. */
  target: number | null;
  screen: LeverScreen;
  /** Set when `target` is null because this input alone cannot get there. */
  limit?: LeverLimit;
  /** Why this one moves the number, in one line. */
  note?: string;
}

export interface SegmentLevers {
  edge_id: string;
  label: string;
  edge_type: string;
  method: EdgeMethod;
  reduction_pct: number;
  rth_before_C_per_W: number | null;
  rth_after_C_per_W: number | null;
  levers: Lever[];
  /** Set when the method offers no editable input at all. */
  message?: string;
}

type Spec = Omit<Lever, 'value' | 'target' | 'limit'> & {
  /** A physical ceiling on the input, where one exists (a fraction cannot pass 1). */
  max?: number;
};

const AREA: Spec = {
  key: 'area_mm2',
  label: 'Area',
  zh: '面積',
  unit: 'mm²',
  direction: 'up',
  exponent: -1,
  screen: '05',
};

const K: Spec = {
  key: 'k_W_mK',
  label: 'Conductivity k',
  zh: '熱傳導率 k',
  unit: 'W/m·K',
  direction: 'up',
  exponent: -1,
  screen: '05',
};

/** The inputs each method's resistance is a function of, richest first. */
const METHOD_LEVERS: Record<EdgeMethod, Spec[]> = {
  conduction_LkA: [
    {
      key: 'length_mm',
      label: 'Length',
      zh: '長度',
      unit: 'mm',
      direction: 'down',
      exponent: 1,
      screen: '05',
      note: 'A shorter conduction path.',
    },
    { ...K, note: 'A better material for the same shape.' },
    { ...AREA, label: 'Cross-section', zh: '截面積', note: 'A wider path for the same length.' },
  ],
  tim_thickness_k: [
    {
      key: 'thickness_mm',
      label: 'Bond line',
      zh: '厚度 BLT',
      unit: 'mm',
      direction: 'down',
      exponent: 1,
      screen: '05',
      note: 'A thinner bond line — usually the cheapest move.',
    },
    { ...K, note: 'A higher-k pad, grease or gap filler.' },
    { ...AREA, label: 'Effective area', zh: '有效面積', note: 'More real contact, not more nominal.' },
  ],
  via_array: [
    {
      key: 'thickness_mm',
      label: 'Board thickness',
      zh: '板厚',
      unit: 'mm',
      direction: 'down',
      exponent: 1,
      screen: '05',
    },
    {
      key: 'effective_k_W_mK',
      label: 'Effective k',
      zh: '等效熱傳導率',
      unit: 'W/m·K',
      direction: 'up',
      exponent: -1,
      screen: '05',
      note: 'More vias, bigger barrels, or filled vias.',
    },
    { ...AREA, label: 'Via region area', zh: '導熱孔區面積' },
    {
      key: 'via_efficiency',
      label: 'Efficiency',
      zh: '效率係數',
      unit: '—',
      direction: 'up',
      exponent: -1,
      screen: '05',
      max: 1,
    },
  ],
  solder_voiding: [
    {
      key: 'thickness_mm',
      label: 'Joint thickness',
      zh: '焊料厚度',
      unit: 'mm',
      direction: 'down',
      exponent: 1,
      screen: '05',
    },
    K,
    { ...AREA, label: 'Joint area', zh: '焊接面積' },
    {
      key: 'voiding',
      label: 'Effective area',
      zh: '有效面積率',
      unit: '—',
      direction: 'up',
      exponent: -1,
      screen: '05',
      max: 1,
      note: 'Less voiding: profile, preform, or vacuum reflow.',
    },
  ],
  contact_hc: [
    {
      key: 'h_c_W_m2K',
      label: 'Contact conductance',
      zh: '接觸熱導',
      unit: 'W/m²·K',
      direction: 'up',
      exponent: -1,
      screen: '05',
      note: 'Flatter, smoother, or more clamping force.',
    },
    { ...AREA, label: 'Contact area', zh: '接觸面積' },
  ],
  contact_area: [
    {
      key: 'R_C_per_W',
      label: 'Contact Rth',
      zh: '接觸熱阻',
      unit: '°C/W',
      direction: 'down',
      exponent: 1,
      screen: '05',
      note: 'A quoted number: it changes when the joint does.',
    },
  ],
  direct_rth: [
    {
      key: 'R_C_per_W',
      label: 'Rth',
      zh: '熱阻',
      unit: '°C/W',
      direction: 'down',
      exponent: 1,
      screen: '05',
      note: 'Quoted, not derived — a different part or a vendor number.',
    },
  ],
  spreading_disc: [
    {
      key: 'source_area_mm2',
      label: 'Contact area',
      zh: '接觸面積',
      unit: 'mm²',
      direction: 'up',
      exponent: null,
      screen: '05',
      note: 'A bigger footprint on the plate: less fan-out to do.',
    },
    {
      key: 'k_W_mK',
      label: 'Plate conductivity k',
      zh: '底座熱傳導率',
      unit: 'W/m·K',
      direction: 'up',
      exponent: null,
      screen: '05',
    },
    {
      key: 'thickness_mm',
      label: 'Plate thickness',
      zh: '底座厚度',
      unit: 'mm',
      direction: 'up',
      exponent: null,
      screen: '05',
      note: 'Spreads further sideways, but adds 1-D drop — the two compete.',
    },
    {
      key: 'plate_area_mm2',
      label: 'Plate area',
      zh: '底座面積',
      unit: 'mm²',
      direction: 'up',
      exponent: null,
      screen: '05',
    },
  ],
  convection_hA: [
    {
      key: 'boundary_h',
      label: 'Air velocity / fin design',
      zh: '風速 / 鰭片設計',
      unit: '',
      direction: 'up',
      exponent: null,
      screen: '06',
      note: 'h and the wetted area both come from Screen 06, not from this edge.',
    },
  ],
  radiation_hA: [
    {
      key: 'boundary_emissivity',
      label: 'Emissivity / surface area',
      zh: '輻射率 / 表面積',
      unit: '',
      direction: 'up',
      exponent: null,
      screen: '06',
      note: 'Set with the boundary condition, not on this edge.',
    },
  ],
  imported: [],
};

/** The edge types whose resistance is a package number Screen 04 owns. */
const PACKAGE_TYPES = new Set(['package_rjc', 'package_rjb', 'package_rja']);

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** x' = x · (1 − r)^(1/e), the calculator's own law read backwards. */
export function targetValue(
  value: number | null,
  exponent: number | null,
  reductionPct: number,
): number | null {
  if (value == null || exponent == null || exponent === 0) return null;
  if (!(reductionPct > 0) || reductionPct >= 100) return null;
  const factor = 1 - reductionPct / 100;
  const next = value * factor ** (1 / exponent);
  return Number.isFinite(next) ? next : null;
}

/** Multiplicative search: 2 % a step reaches ×1000 in 350, which is plenty. */
const SEARCH_STEP = 1.02;
const SEARCH_LIMIT = 400;
const BISECTIONS = 60;

export interface SolvedTarget {
  value: number | null;
  limit?: LeverLimit;
}

/**
 * The value of ONE input that puts the calculator on `target`, by search.
 *
 * Used where there is no exponent to invert. It walks the input in the
 * direction that helps, 2 % a step, watching the resistance the real calculator
 * returns; the first step past the target brackets it and sixty bisections
 * close it. Two things stop the walk short, and both are answers rather than
 * failures: a physical ceiling on the input, and a turning point — the value
 * where the resistance stops falling and starts rising again, which is exactly
 * what plate thickness does once the one-dimensional drop outgrows the
 * spreading it buys.
 */
export function solveForTarget(
  method: EdgeMethod,
  params: EdgeParameters,
  key: string,
  start: number,
  direction: 'up' | 'down',
  target: number,
  max?: number,
): SolvedTarget {
  const at = (x: number): number | null => {
    const result = computeRth(method, withCoupling(params, key, x));
    return result.value != null && Number.isFinite(result.value) ? result.value : null;
  };

  const first = at(start);
  if (first == null || !(start > 0) || !(target > 0)) return { value: null };
  if (first <= target) return { value: start };

  let previous = start;
  let previousR = first;
  let best = { at_value: start, best_rth_C_per_W: first };
  let reason: LeverLimit['reason'] = 'bound';

  for (let step = 0; step < SEARCH_LIMIT; step += 1) {
    let next = direction === 'up' ? previous * SEARCH_STEP : previous / SEARCH_STEP;
    let bounded = false;
    if (max != null && next > max) {
      next = max;
      bounded = true;
    }
    if (next === previous) break;

    const nextR = at(next);
    if (nextR == null) break;

    if (nextR < best.best_rth_C_per_W) best = { at_value: next, best_rth_C_per_W: nextR };

    if (nextR <= target) {
      // Bracketed between `previous` (too high) and `next` (past it).
      let low = previous;
      let high = next;
      for (let i = 0; i < BISECTIONS; i += 1) {
        const middle = (low + high) / 2;
        const middleR = at(middle);
        if (middleR == null) break;
        if (middleR > target) low = middle;
        else high = middle;
      }
      return { value: high };
    }

    if (nextR > previousR) {
      // It has turned round: past here this input makes the segment worse.
      reason = 'optimum';
      break;
    }
    if (bounded) break;

    previous = next;
    previousR = nextR;
  }

  return { value: null, limit: { ...best, reason } };
}

/**
 * One input changed, with anything that MUST change with it.
 *
 * A refined spreading edge carries the Biot number Screen 07 computed for it,
 * `Bi = h_eff · b / k` — and `k` is the plate's own conductivity, the same
 * number this row is proposing to change. Holding Bi fixed while moving k would
 * answer a question about a plate that does not exist. `h_eff` and `b` do not
 * depend on k, so the correction is exact: Bi ∝ 1/k.
 *
 * The plate AREA moves `b` and `h_eff` and the convective area behind them, so
 * it gets no target at all under a finite Bi — see `segmentLevers`.
 */
function withCoupling(params: EdgeParameters, key: string, x: number): EdgeParameters {
  const next: EdgeParameters = { ...params, [key]: x };
  const bi = numeric(params.bi);
  const k = numeric(params.k_W_mK);
  if (key === 'k_W_mK' && bi != null && k != null && x > 0) next.bi = (bi * k) / x;
  return next;
}

/**
 * The levers on one segment, at one requested reduction.
 *
 * A package resistance is reported as Screen 04's, whatever method Screen 05
 * stored it under: `Rjc` is a datasheet number for a part, and the way to move
 * it is to choose a different part or get a better one out of the vendor — not
 * to edit a length on a graph edge.
 */
export function segmentLevers(
  network: ThermalNetwork,
  scenarioId: string,
  edgeId: string,
  label: string,
  reductionPct: number,
): SegmentLevers {
  const edge: ThermalEdge | undefined = network.edges[edgeId];
  const before = edge ? edgeResistance(edge, scenarioId) : null;
  const after =
    before != null && reductionPct > 0 ? before * (1 - reductionPct / 100) : before;

  if (!edge) {
    return {
      edge_id: edgeId,
      label,
      edge_type: 'unknown',
      method: 'imported',
      reduction_pct: reductionPct,
      rth_before_C_per_W: null,
      rth_after_C_per_W: null,
      levers: [],
      message: 'This segment is no longer in the network.',
    };
  }

  const base: Omit<SegmentLevers, 'levers' | 'message'> = {
    edge_id: edge.id,
    label,
    edge_type: edge.type,
    method: edge.method,
    reduction_pct: reductionPct,
    rth_before_C_per_W: before,
    rth_after_C_per_W: after,
  };

  if (PACKAGE_TYPES.has(edge.type)) {
    return {
      ...base,
      levers: [
        {
          key: 'package_rth',
          label: 'Package Rth (datasheet)',
          zh: '封裝熱阻（資料表）',
          unit: '°C/W',
          value: before,
          direction: 'down',
          exponent: 1,
          target: targetValue(before, 1, reductionPct),
          screen: '04',
          note: 'A part-level number: a different package, die attach, or vendor figure.',
        },
      ],
    };
  }

  const specs = METHOD_LEVERS[edge.method] ?? [];
  if (specs.length === 0) {
    return {
      ...base,
      levers: [],
      message: 'This segment carries a value with no editable inputs behind it.',
    };
  }

  const parameters = edge.parameters ?? {};

  /**
   * The target is a RELATIVE cut on the calculator's own value, not on the
   * stored one.
   *
   * They can differ: a spreading edge carries the finite-Bi resistance the
   * scenario's boundary implies, which Screen 07 refines at solve time, while
   * `computeRth` is what Screen 05 will recompute when the value is typed in.
   * Solving against the calculator is what makes the number reproducible in
   * the field the row points at — and "16.9 % off this segment" means the same
   * thing either way.
   */
  const own = computeRth(edge.method, parameters).value;
  const wanted = own != null && reductionPct > 0 ? own * (1 - reductionPct / 100) : null;

  const quoted = edge.method === 'direct_rth' || edge.method === 'contact_area';

  const levers: Lever[] = specs.map((spec) => {
    const { max: declaredMax, ...rest } = spec;
    // A footprint cannot be bigger than the plate it sits on. The bound is the
    // other parameter's value, so it is read here rather than declared above.
    const max =
      spec.key === 'source_area_mm2'
        ? (numeric(parameters.plate_area_mm2) ?? declaredMax)
        : declaredMax;
    const value =
      spec.screen === '06'
        ? null
        : // A quoted resistance is usually held in the Rth value object rather
          // than typed into `parameters`, so the row falls back to it: without
          // a number there is nothing to propose a change to.
          (numeric(parameters[spec.key]) ??
            (quoted && spec.key === 'R_C_per_W' ? before : null));

    // A power law inverts exactly; anything else is searched on the calculator.
    if (spec.exponent != null) {
      const exact = targetValue(value, spec.exponent, reductionPct);
      if (exact != null && max != null && exact > max) {
        const bestParams = { ...parameters, [spec.key]: max };
        const best = computeRth(edge.method, bestParams).value;
        return {
          ...rest,
          value,
          target: null,
          limit:
            best != null
              ? { best_rth_C_per_W: best, at_value: max, reason: 'bound' as const }
              : undefined,
        };
      }
      return { ...rest, value, target: exact };
    }

    if (value == null || wanted == null) return { ...rest, value, target: null };

    /*
       The base area is not this edge's alone to change.

       Under a finite Bi it sets `b` and, through the wetted area, the `h_eff`
       that Bi was built from — and past this edge it sets the convection
       surface Screen 06 computes. Searching it here would hold all of that
       still and report a number that only holds in a model nobody is building.
    */
    if (spec.key === 'plate_area_mm2' && numeric(parameters.bi) != null) {
      return {
        ...rest,
        value,
        target: null,
        screen: '06',
        note: 'Also sets the convection area and the Bi behind it — a Screen 06 change, not this edge alone.',
      };
    }

    /**
     * No exponent: search, and search BOTH ways.
     *
     * The declared direction is the one that usually helps, but "usually" is
     * not a claim this can make about a plate thickness — thicker spreads
     * further and drops more one-dimensionally, so which way helps depends on
     * where the current design sits relative to the turning point. Trying the
     * other side costs one more search and means the arrow shown is the one the
     * calculator actually agreed with rather than the one that was assumed.
     */
    const other: Lever['direction'] = spec.direction === 'up' ? 'down' : 'up';
    const forward = solveForTarget(
      edge.method,
      parameters,
      spec.key,
      value,
      spec.direction,
      wanted,
      max,
    );
    if (forward.value != null) return { ...rest, value, target: forward.value };

    const back = solveForTarget(edge.method, parameters, spec.key, value, other, wanted);
    if (back.value != null) {
      return { ...rest, value, direction: other, target: back.value };
    }

    // Neither reaches it; report whichever gets further, and say which way.
    const best =
      back.limit && (!forward.limit || back.limit.best_rth_C_per_W < forward.limit.best_rth_C_per_W)
        ? { limit: back.limit, direction: other }
        : { limit: forward.limit, direction: spec.direction };
    return { ...rest, value, direction: best.direction, target: null, limit: best.limit };
  });

  return { ...base, levers };
}
