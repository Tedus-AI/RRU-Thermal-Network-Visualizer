/**
 * Shared CSV serialization — 12 §25, §26, §27, §39.
 *
 * One writer for every CSV artifact, so delimiter, quoting, encoding, unit
 * headers and decimal precision are decided in a single place rather than being
 * re-implemented per generator (§39: serialization does not live in components).
 *
 * §26 is the rule that matters: precision affects the SERIALIZED text only. The
 * stored value keeps every digit the solver produced.
 */

import type { CsvEncoding, DecimalPrecision, ExportConfiguration } from './exportTypes';

/** A column knows its own name, unit and how to read a row. */
export interface CsvColumn<T> {
  header: string;
  /** Unit shown in the header when `csv_include_units` is on, e.g. `°C`. */
  unit?: string;
  value: (row: T) => string | number | null | undefined;
  /** Numbers are rounded to the configured precision unless this says otherwise. */
  raw?: boolean;
}

const BOM = '﻿';

/** 12 §25 — comma delimiter, RFC 4180 quoting. */
function escape(value: string): string {
  if (value === '') return '';
  const needsQuotes = /[",\r\n]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

function format(
  value: string | number | null | undefined,
  precision: DecimalPrecision,
  raw: boolean,
): string {
  // 12 §31, and the project-wide rule: an unknown value is blank, never 0.
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return raw ? String(value) : value.toFixed(precision);
  }
  return escape(value);
}

export function buildCsv<T>(
  rows: T[],
  columns: Array<CsvColumn<T>>,
  config: Pick<ExportConfiguration, 'decimal_precision' | 'csv_include_units'>,
): string {
  const header = columns
    .map((column) =>
      escape(
        config.csv_include_units && column.unit
          ? `${column.header} (${column.unit})`
          : column.header,
      ),
    )
    .join(',');

  const body = rows.map((row) =>
    columns
      .map((column) => format(column.value(row), config.decimal_precision, column.raw === true))
      .join(','),
  );

  // A trailing newline: POSIX tools and Excel both prefer a terminated last line.
  return [header, ...body].join('\r\n') + '\r\n';
}

/**
 * 12 §27 — `UTF-8 with BOM` is the default because Excel misreads a plain
 * UTF-8 CSV containing Traditional Chinese as the local ANSI code page.
 */
export function encodeCsv(text: string, encoding: CsvEncoding): string {
  return encoding === 'utf8_bom' ? BOM + text : text;
}

/** 12 §25 — Pretty or Compact, and nothing in between. */
export function encodeJson(value: unknown, format: 'pretty' | 'compact'): string {
  return format === 'pretty' ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}
