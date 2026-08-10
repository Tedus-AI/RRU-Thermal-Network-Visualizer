/**
 * Rth value-object helpers.
 *
 * Enforces 00 §18 (Rule 4) and §21 (Rule 9) at the data-model level so that no
 * screen can accidentally violate them from a UI handler.
 */

import type {
  Confidence,
  DataSource,
  ResolutionState,
  RthValue,
  ThermalEdge,
} from './types';

export function createRth(
  value: number | null,
  source: DataSource,
  confidence: Confidence,
  reference?: string,
): RthValue {
  const rth: RthValue = {
    analytical: null,
    flotherm: null,
    measurement: null,
    manual: null,
    active_source: source,
    provenance: {
      [source]: {
        source,
        confidence,
        reference,
        timestamp: new Date().toISOString(),
      },
    },
  };
  writeSlot(rth, source, value);
  return rth;
}

/** Which storage slot a given source writes into. */
function slotFor(
  source: DataSource,
): keyof Pick<RthValue, 'analytical' | 'flotherm' | 'measurement' | 'manual'> {
  switch (source) {
    case 'FloTHERM':
      return 'flotherm';
    case 'Measurement':
      return 'measurement';
    case 'Manual':
      return 'manual';
    default:
      // Analytical / Datasheet / Vendor / Assumed all describe a pre-CFD
      // hand-calculated or quoted number.
      return 'analytical';
  }
}

function writeSlot(rth: RthValue, source: DataSource, value: number | null): void {
  rth[slotFor(source)] = value;
}

/**
 * Record a value from one source WITHOUT destroying the others.
 *
 * 00 §21 forbids FloTHERM import from silently overwriting analytical values.
 * `makeActive` defaults to false so an import is a comparison, not a takeover.
 */
export function setRthFromSource(
  rth: RthValue,
  source: DataSource,
  value: number | null,
  confidence: Confidence,
  options: { reference?: string; scenario_id?: string; makeActive?: boolean } = {},
): RthValue {
  const next: RthValue = {
    ...rth,
    provenance: { ...rth.provenance },
  };
  writeSlot(next, source, value);
  next.provenance[source] = {
    source,
    confidence,
    reference: options.reference,
    scenario_id: options.scenario_id,
    timestamp: new Date().toISOString(),
  };
  if (options.makeActive) next.active_source = source;
  return next;
}

/** The resistance the solver actually uses, in °C/W. */
export function activeRth(rth: RthValue): number | null {
  return rth[slotFor(rth.active_source)];
}

export function activeProvenance(rth: RthValue) {
  return rth.provenance[rth.active_source];
}

/**
 * Effective resistance of an edge under a scenario, honouring scenario overrides.
 * Returns null when the edge is disabled or has no usable value.
 */
export function edgeResistance(edge: ThermalEdge, scenarioId?: string): number | null {
  const override = scenarioId ? edge.scenario_overrides?.[scenarioId] : undefined;
  if (override?.enabled === false) return null;
  if (!edge.enabled && override?.enabled !== true) return null;
  if (override?.R_C_per_W != null) return override.R_C_per_W;
  return activeRth(edge.rth);
}

/**
 * RULE 4 GUARD — 00 §18, §62 Rule 4.
 *
 * "Never derive segment thermal resistance from ΔT unless the heat flow through
 * that segment is known."
 *
 * This is the ONLY sanctioned way to turn a measured/simulated temperature drop
 * into a resistance. When Q for the segment is unknown the result is degraded to
 * an unresolved marker instead of a number, so it can never be presented as a
 * resolved segment Rth. Callers must not divide ΔT by component total power as a
 * fallback (00 §53 forbidden item 4).
 */
export function deriveRthFromDeltaT(input: {
  delta_T_C: number;
  /** Heat flow through THIS segment. null when the split is unknown. */
  segment_Q_W: number | null;
}): { value: number | null; resolution: ResolutionState; note: string } {
  const { delta_T_C, segment_Q_W } = input;

  if (segment_Q_W == null) {
    return {
      value: null,
      resolution: 'unresolved',
      note:
        'Segment heat flow is unknown, so ΔT cannot be converted into a segment Rth. ' +
        'Resolve the interface heat flow, or treat this as an effective path only.',
    };
  }

  if (segment_Q_W === 0) {
    return {
      value: null,
      resolution: 'unresolved',
      note: 'Segment heat flow is zero; resistance is indeterminate from ΔT.',
    };
  }

  return {
    value: delta_T_C / segment_Q_W,
    resolution: 'resolved',
    note: 'Derived from ΔT and resolved segment heat flow.',
  };
}

/**
 * Temperature-only data (Tj, Tamb, component power) yields ONE lumped number and
 * cannot be split into Rjc / RTIM / Rbase / Rhsk — 00 §18.3.
 */
export function effectivePathRja(input: {
  T_junction_C: number;
  T_ambient_C: number;
  component_power_W: number;
}): { value: number | null; resolution: ResolutionState; note: string } {
  if (input.component_power_W <= 0) {
    return {
      value: null,
      resolution: 'unresolved',
      note: 'Component power must be positive to compute an effective path resistance.',
    };
  }
  return {
    value: (input.T_junction_C - input.T_ambient_C) / input.component_power_W,
    resolution: 'effective_path_only',
    note:
      'Total effective junction-to-ambient resistance. This cannot be decomposed into ' +
      'individual segment resistances without segment heat flows.',
  };
}
