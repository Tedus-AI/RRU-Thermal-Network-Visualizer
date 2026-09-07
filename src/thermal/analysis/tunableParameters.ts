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
 * The spreading disc is a Bessel series in the ratio of the two radii and the
 * Biot number, with no such exponent, so it gets directions and no targets
 * rather than a number that would be wrong in the third digit.
 *
 * Nothing here writes anything. It names the field and the screen that owns it,
 * because that is where the change is actually made: 08 is an argument about a
 * design, not an editor of one.
 */

import { edgeResistance } from '../rth';
import type { EdgeMethod, ThermalEdge, ThermalNetwork } from '../types';

/** Where the parameter is actually edited. */
export type LeverScreen = '04' | '05' | '06';

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
   * R ∝ value^exponent. `null` where the relationship is not a power law, in
   * which case there is a direction but no target.
   */
  exponent: number | null;
  /** What the value would have to become for the requested reduction. */
  target: number | null;
  screen: LeverScreen;
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

type Spec = Omit<Lever, 'value' | 'target'>;

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
  const levers = specs.map((spec) => {
    const value = spec.screen === '06' ? null : numeric(parameters[spec.key]);
    return {
      ...spec,
      value,
      target: targetValue(value, spec.exponent, reductionPct),
    };
  });

  return { ...base, levers };
}
