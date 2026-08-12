/**
 * Presentation helpers for Screen 11.
 *
 * Formatting and tone only. Every engineering number arrives already computed
 * from the Screen 10 snapshot — nothing here recalculates one (11 §12, §37).
 */

import type { Tone } from '@/ui/primitives';
import type { OverallThermalStatus } from '@/thermal/overview/overviewTypes';
import type {
  ReportReadiness,
  SnapshotState,
  ValidationState,
} from '@/report/reportTypes';

/** A missing value is N/A. It is never rendered as 0. */
export function num(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(digits);
  return unit ? `${text} ${unit}` : text;
}

export function signed(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const text = `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  return unit ? `${text} ${unit}` : text;
}

export function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}%`;
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function dateOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export const SNAPSHOT_TONE: Record<SnapshotState, Tone> = {
  CURRENT: 'ok',
  WARNING: 'warn',
  STALE: 'danger',
  MISSING: 'danger',
};

export const READINESS_TONE: Record<ReportReadiness, Tone> = {
  EXPORT_READY: 'ok',
  PREVIEW_READY: 'accent',
  WARNING: 'warn',
  BLOCKED: 'danger',
};

export const VALIDATION_TONE: Record<ValidationState, Tone> = {
  READY: 'ok',
  WARNING: 'warn',
  MISSING: 'danger',
  STALE: 'neutral',
};

export const OVERALL_TONE: Record<OverallThermalStatus, Tone> = {
  PASS: 'ok',
  WARNING: 'warn',
  FAIL: 'danger',
  STALE: 'neutral',
  INCOMPLETE: 'warn',
};

/**
 * Bilingual report text — 11 §8.
 *
 * The report's own language is a report setting, separate from the application
 * UI's English-primary rule (§1). In English mode the Chinese half is dropped
 * from the RENDERED REPORT only; the surrounding UI is unaffected.
 */
export function reportLabel(
  mode: 'english' | 'bilingual',
  english: string,
  chinese: string,
): string {
  return mode === 'bilingual' ? `${english} / ${chinese}` : english;
}
