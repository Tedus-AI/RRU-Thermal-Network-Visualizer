/**
 * Temperature statistics and histogram binning — 09 §11, §23, §24, §37, §40.
 *
 * Every number here describes the ACTIVE FILTERED dataset and nothing else
 * (09 §23). Change the scope or a filter and these change with it; they are
 * never computed over the whole network behind the user's back.
 *
 * The bin edges are computed here rather than left to the chart library, because
 * 09 §40 requires the binning to be app-controlled: a library that re-guesses
 * "nice" bins per render would give a different histogram for the same data.
 */

import { percentileOfSorted, sortedFinite } from './percentile';

/** 09 §37. `null` where the dataset is empty — a statistic of nothing is not 0. */
export interface TemperatureStatistics {
  count: number;
  min_C: number | null;
  max_C: number | null;
  mean_C: number | null;
  median_C: number | null;
  p90_C: number | null;
  p95_C: number | null;
  /**
   * Population standard deviation. The dataset is a complete enumeration of the
   * selected nodes, not a sample drawn from a larger population, so dividing by
   * n is the correct choice and n−1 would be a mis-application.
   */
  std_dev_C: number | null;
}

export function computeStatistics(values: number[]): TemperatureStatistics {
  const sorted = sortedFinite(values);
  const count = sorted.length;

  if (count === 0) {
    return {
      count: 0,
      min_C: null,
      max_C: null,
      mean_C: null,
      median_C: null,
      p90_C: null,
      p95_C: null,
      std_dev_C: null,
    };
  }

  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / count;

  return {
    count,
    min_C: sorted[0],
    max_C: sorted[count - 1],
    mean_C: mean,
    median_C: percentileOfSorted(sorted, 0.5),
    p90_C: percentileOfSorted(sorted, 0.9),
    p95_C: percentileOfSorted(sorted, 0.95),
    std_dev_C: Math.sqrt(variance),
  };
}

// --- histogram (09 §11, §40) ------------------------------------------------

export const BIN_PRESETS = ['auto', '5', '10', 'custom'] as const;
export type BinMode = (typeof BIN_PRESETS)[number];

export interface HistogramBin {
  from_C: number;
  to_C: number;
  /** "55–60" — the axis label. */
  label: string;
  count: number;
  node_ids: string[];
}

/**
 * Auto width: Freedman–Diaconis, rounded to an engineering-friendly step so the
 * axis reads in whole degrees rather than 3.71 °C.
 */
export function autoBinWidth(values: number[]): number {
  const sorted = sortedFinite(values);
  if (sorted.length < 2) return 5;

  const q1 = percentileOfSorted(sorted, 0.25) as number;
  const q3 = percentileOfSorted(sorted, 0.75) as number;
  const iqr = q3 - q1;
  const span = sorted[sorted.length - 1] - sorted[0];
  if (!(span > 0)) return 5;

  const raw = iqr > 0 ? (2 * iqr) / Math.cbrt(sorted.length) : span / Math.sqrt(sorted.length);
  const steps = [1, 2, 2.5, 5, 10, 20, 25, 50];
  return steps.find((step) => step >= raw) ?? 100;
}

export function resolveBinWidth(mode: BinMode, custom: number, values: number[]): number {
  switch (mode) {
    case 'auto':
      return autoBinWidth(values);
    case '5':
      return 5;
    case '10':
      return 10;
    case 'custom':
      return Number.isFinite(custom) && custom > 0 ? custom : 5;
    default:
      return 5;
  }
}

/**
 * Bins anchored to multiples of the width, so 55–60 / 60–65 come out the same
 * every time regardless of where the data happens to start (09 §40).
 *
 * A value on a boundary belongs to the bin it OPENS — [from, to) — except at the
 * very top, where the last bin is closed so the maximum is never dropped.
 */
export function buildHistogram(
  entries: Array<{ node_id: string; temperature_C: number }>,
  width: number,
): HistogramBin[] {
  const usable = entries.filter((entry) => Number.isFinite(entry.temperature_C));
  if (usable.length === 0 || !(width > 0)) return [];

  const temperatures = usable.map((entry) => entry.temperature_C);
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);

  const first = Math.floor(min / width) * width;
  const last = Math.floor(max / width) * width;
  const binCount = Math.round((last - first) / width) + 1;

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, index) => {
    const from = first + index * width;
    const to = from + width;
    return {
      from_C: from,
      to_C: to,
      label: `${trim(from)}–${trim(to)}`,
      count: 0,
      node_ids: [],
    };
  });

  for (const entry of usable) {
    let index = Math.floor((entry.temperature_C - first) / width);
    // The top edge belongs to the last bin rather than falling off the end.
    if (index >= bins.length) index = bins.length - 1;
    if (index < 0) index = 0;
    bins[index].count++;
    bins[index].node_ids.push(entry.node_id);
  }

  return bins;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
