/**
 * Per-field provenance — 04 §27, AC-04-16.
 *
 * A thermal number is only as trustworthy as where it came from. Every field a
 * thermal engineer would question in review (power, thermal limit, Rjc, TIM
 * properties) carries its source, reference and confidence alongside the value.
 */

import type { Confidence, DataSource } from '@/thermal/types';

export type ThermalDataSource = DataSource;

export interface SourcedValue<T> {
  /** null means genuinely unknown. It must never be coerced to 0 (04 §11, AC-04-06). */
  value: T | null;
  source: ThermalDataSource;
  reference?: string;
  confidence?: Confidence;
  updated_at?: string;
}

export function sourced<T>(
  value: T | null,
  source: ThermalDataSource = 'Manual',
  options: { reference?: string; confidence?: Confidence } = {},
): SourcedValue<T> {
  return {
    value,
    source,
    reference: options.reference,
    confidence: options.confidence,
    updated_at: new Date().toISOString(),
  };
}

/** Unknown value that still records where the gap came from. */
export function unknownValue<T>(source: ThermalDataSource = 'Imported'): SourcedValue<T> {
  return { value: null, source, confidence: 'low', updated_at: new Date().toISOString() };
}

export function valueOf<T>(sv: SourcedValue<T> | null | undefined): T | null {
  return sv?.value ?? null;
}

export function hasValue<T>(sv: SourcedValue<T> | null | undefined): boolean {
  return sv?.value != null;
}

/** Replace the value while keeping a record of who changed it. */
export function withValue<T>(
  sv: SourcedValue<T> | null | undefined,
  value: T | null,
  source: ThermalDataSource = 'Manual',
): SourcedValue<T> {
  return {
    ...(sv ?? {}),
    value,
    source,
    updated_at: new Date().toISOString(),
  } as SourcedValue<T>;
}
