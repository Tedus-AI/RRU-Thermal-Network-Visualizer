/**
 * Presentation helpers for Screen 10.
 *
 * Formatting, tone and section numbering only. Nothing here computes a thermal
 * result — every number arrives from `thermal/overview`, which itself only reads
 * what Screens 07, 08 and 09 produced (10 §36).
 */

import type { Tone } from '@/ui/primitives';
import type { Confidence } from '@/thermal/types';
import type { EnergyGrade } from '@/thermal/solver/solverTypes';
import type {
  ComponentThermalStatus,
  OverallThermalStatus,
  ReadinessState,
  ReportReadiness,
} from '@/thermal/overview/overviewTypes';

/** A missing value is N/A. It is never rendered as 0 (00 Rule 2). */
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

export const OVERALL_TONE: Record<OverallThermalStatus, Tone> = {
  PASS: 'ok',
  WARNING: 'warn',
  FAIL: 'danger',
  STALE: 'neutral',
  INCOMPLETE: 'warn',
};

export const COMPONENT_TONE: Record<ComponentThermalStatus, Tone> = {
  PASS: 'ok',
  'NEAR LIMIT': 'warn',
  FAIL: 'danger',
  'NO LIMIT': 'neutral',
};

export const READINESS_TONE: Record<ReadinessState, Tone> = {
  READY: 'ok',
  WARNING: 'warn',
  MISSING: 'danger',
  STALE: 'neutral',
};

export const REPORT_TONE: Record<ReportReadiness, Tone> = {
  READY: 'ok',
  WARNING: 'warn',
  BLOCKED: 'danger',
};

export const ENERGY_TONE: Record<EnergyGrade, Tone> = {
  green: 'ok',
  warning: 'warn',
  error: 'danger',
};

export const ENERGY_GRADE_LABEL: Record<EnergyGrade, { label: string; zh: string }> = {
  green: { label: 'GOOD', zh: '良好' },
  warning: { label: 'WARNING', zh: '偏高' },
  error: { label: 'ERROR', zh: '不可接受' },
};

export const CONFIDENCE_TONE: Record<Confidence, Tone> = {
  high: 'ok',
  medium: 'warn',
  low: 'danger',
};

export const CONFIDENCE_LABEL: Record<Confidence, { label: string; zh: string }> = {
  high: { label: 'High', zh: '高' },
  medium: { label: 'Medium', zh: '中' },
  low: { label: 'Low', zh: '低' },
};

/**
 * Where each marker sits on the Min–Max range bar, 0–1 (10 §10).
 * Returns null when the range has no width, so the bar renders as a single
 * point instead of dividing by zero and putting every marker at NaN%.
 */
export function rangePosition(
  value: number | null,
  min: number | null,
  max: number | null,
): number | null {
  if (value == null || min == null || max == null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max <= min) return null;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
