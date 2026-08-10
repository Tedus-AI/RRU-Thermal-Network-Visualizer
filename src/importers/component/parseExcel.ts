/**
 * Excel workbook parsing — 02 §5, §7.
 *
 * Multi-sheet workbooks expose a sheet list so the user can choose which one to
 * import (AC-02-03).
 */

import readXlsxFile, { readSheet } from 'read-excel-file/browser';
import type { ParsedTable } from './types';

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Reading every sheet is the only way this reader enumerates sheet names. */
export async function listExcelSheets(file: File): Promise<string[]> {
  const workbook = await readXlsxFile(file);
  return workbook.map((sheet) => sheet.sheet);
}

/** Turns a raw grid into headers + rows, tolerating blank leading rows. */
export function gridToTable(
  grid: string[][],
  sourceName: string,
  sheets?: string[],
  activeSheet?: string,
): ParsedTable {
  const firstFilled = grid.findIndex((row) => row.some((cell) => cell.length > 0));
  if (firstFilled === -1) {
    return { headers: [], rows: [], sheets, activeSheet, sourceName };
  }

  const headers = grid[firstFilled];
  const width = headers.length;
  const rows = grid
    .slice(firstFilled + 1)
    .filter((row) => row.some((cell) => cell.length > 0))
    .map((row) => {
      const cells = [...row];
      while (cells.length < width) cells.push('');
      return cells.slice(0, width);
    });

  return { headers, rows, sheets, activeSheet, sourceName };
}

export async function parseExcelFile(file: File, sheet?: string): Promise<ParsedTable> {
  const workbook = await readXlsxFile(file);
  const sheets = workbook.map((entry) => entry.sheet);
  const activeSheet = sheet && sheets.includes(sheet) ? sheet : sheets[0];

  const data = await readSheet(file, activeSheet);
  const grid = (data as unknown[][]).map((row) => row.map(cellToText));

  return gridToTable(grid, file.name, sheets, activeSheet);
}

/** `.xls` is the pre-2007 binary format; the reader only handles OOXML. */
export function isLegacyXls(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xls');
}
