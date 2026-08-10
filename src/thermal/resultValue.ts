/**
 * Multi-source result containers — 04 §28.
 *
 * Screen 03 (FloTHERM Import) is DEFERRED, not removed: its real export schema
 * has not been validated against actual FloTHERM output yet. These containers
 * exist now so that adding FloTHERM later needs no refactor of screens 04–10.
 *
 * Hard rules this file encodes (04 §28.5, §40, 00 Rule 9):
 *   - a simulated or measured result never overwrites the analytical value;
 *   - every slot coexists and the active source is an explicit choice;
 *   - nothing here assumes a FloTHERM column name, header or file layout.
 */

import type { Confidence } from './types';

export const RESULT_SOURCES = [
  'analytical',
  'flotherm',
  'measurement',
  'datasheet',
  'manual',
] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

export interface ResultValue<T> {
  value: T;
  unit: string;
  source: ResultSource;
  /** Results are scenario-specific; a 55 °C result is not a 25 °C result. */
  scenario_id?: string;
  reference?: string;
  confidence?: Confidence;
  imported_at?: string;
}

/** Node temperatures from every source, side by side — 04 §28.3. */
export interface TemperatureResultSet {
  analytical?: ResultValue<number>;
  flotherm?: ResultValue<number>;
  measurement?: ResultValue<number>;
}

/** Edge resistances from every source, side by side — 04 §28.4. */
export interface EdgeRthSet {
  analytical?: ResultValue<number>;
  flotherm?: ResultValue<number>;
  measurement?: ResultValue<number>;
  manual?: ResultValue<number>;
}

export type ActiveRthSource = 'analytical' | 'flotherm' | 'measurement' | 'manual';

/**
 * Writes one source's result without touching the others.
 * This is the ONLY sanctioned way to record an imported result.
 */
export function setResult<T>(
  set: Record<string, ResultValue<T> | undefined>,
  source: ResultSource | ActiveRthSource,
  result: ResultValue<T>,
): Record<string, ResultValue<T> | undefined> {
  return { ...set, [source]: result };
}

export function readResult<T>(
  set: Record<string, ResultValue<T> | undefined> | undefined,
  source: ResultSource | ActiveRthSource,
): T | null {
  return set?.[source]?.value ?? null;
}

/**
 * External simulation mapping hook — 04 §28.1, §33.
 *
 * Aliases are free text the engineer types; nothing parses or validates them
 * against a FloTHERM model, because that format is not yet verified.
 */
export interface FlothermMappingHook {
  object_aliases?: string[];
  preferred_junction_object?: string;
  preferred_case_object?: string;
  mapping_status?: 'unmapped' | 'partial' | 'mapped';
}

export interface ExternalMappings {
  flotherm?: FlothermMappingHook;
  /** Reserved for bench measurement points; also unparsed for now. */
  measurement?: { point_aliases?: string[]; mapping_status?: 'unmapped' | 'mapped' };
}
