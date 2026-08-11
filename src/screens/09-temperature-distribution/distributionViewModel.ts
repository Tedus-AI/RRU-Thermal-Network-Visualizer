/**
 * Presentation helpers for Screen 09.
 *
 * Formatting and colour only. Nothing here recomputes a statistic — the numbers
 * arrive from `thermal/analysis` and are displayed as given.
 */

import type { Tone } from '@/ui/primitives';
import type { LimitStatus, TemperatureRow } from '@/thermal/analysis/temperatureDataset';

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

export function ordinal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const rounded = Math.round(value);
  const suffix =
    rounded % 100 >= 11 && rounded % 100 <= 13
      ? 'th'
      : rounded % 10 === 1
        ? 'st'
        : rounded % 10 === 2
          ? 'nd'
          : rounded % 10 === 3
            ? 'rd'
            : 'th';
  return `${rounded}${suffix} percentile`;
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export const STATUS_TONE: Record<LimitStatus, Tone> = {
  within_limit: 'ok',
  near_limit: 'warn',
  over_limit: 'danger',
  no_limit: 'neutral',
};

/**
 * Temperature colour ramp, shared by the histogram bars and the network view so
 * the same temperature reads the same colour in both (09 §21).
 */
export const TEMPERATURE_RAMP = [
  '#2563eb',
  '#0ea5e9',
  '#10b981',
  '#facc15',
  '#f97316',
  '#dc2626',
] as const;

export interface TemperatureScale {
  min: number;
  max: number;
  colorOf: (value: number | null | undefined) => string;
  bands: Array<{ color: string; from: number; to: number }>;
}

const NEUTRAL = '#cbd5e1';

/**
 * 09 §21, §22 — `fixed` locks the range so two scenarios share one colour scale.
 * Without the lock, auto-scaling makes a cooler scenario look identical to a
 * hotter one, which is exactly the visual lie §22 is written to prevent.
 */
export function buildScale(values: number[], fixed?: { min: number; max: number }): TemperatureScale {
  const finite = values.filter((value) => Number.isFinite(value));
  const min = fixed ? fixed.min : finite.length > 0 ? Math.min(...finite) : 0;
  const max = fixed ? fixed.max : finite.length > 0 ? Math.max(...finite) : 0;
  const span = max - min;

  const bands = TEMPERATURE_RAMP.map((color, index) => ({
    color,
    from: min + (span * index) / TEMPERATURE_RAMP.length,
    to: min + (span * (index + 1)) / TEMPERATURE_RAMP.length,
  }));

  return {
    min,
    max,
    bands,
    colorOf: (value) => {
      if (value == null || !Number.isFinite(value)) return NEUTRAL;
      if (span <= 0) return TEMPERATURE_RAMP[Math.floor(TEMPERATURE_RAMP.length / 2)];
      const ratio = (value - min) / span;
      const index = Math.min(
        TEMPERATURE_RAMP.length - 1,
        Math.max(0, Math.floor(ratio * TEMPERATURE_RAMP.length)),
      );
      return TEMPERATURE_RAMP[index];
    },
  };
}

/** Short label for a row on a chart axis. */
export function rowLabel(row: TemperatureRow): string {
  if (row.component_name && row.component_name !== row.node_name) {
    return `${row.node_name} · ${row.component_name}`;
  }
  return row.node_name;
}

export function downloadCsv(filename: string, contents: string): void {
  if (typeof document === 'undefined') return;
  // A BOM so Excel opens the Traditional Chinese column values correctly.
  const blob = new Blob([`﻿${contents}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
