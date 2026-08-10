/**
 * Delimited-text parsers — 02 §7, §5.
 *
 * Covers CSV files and pasted spreadsheet data. Excel binary workbooks are
 * handled by parseExcel.ts.
 */

import type { ParsedTable } from './types';

/**
 * Splits one delimited line, honouring RFC 4180 quoting so a quoted comma or an
 * escaped quote inside a component name survives.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * Picks the delimiter by which candidate yields the most consistent column count
 * across the first few lines. Beats "assume comma" for pasted Excel data (tabs)
 * and for European CSV exports (semicolons).
 */
export function detectDelimiter(lines: string[]): string {
  const candidates = ['\t', ',', ';', '|'];
  let best = ',';
  let bestScore = -1;

  for (const delimiter of candidates) {
    const counts = lines.slice(0, 5).map((line) => splitDelimitedLine(line, delimiter).length);
    if (counts.length === 0) continue;
    const columns = counts[0];
    if (columns < 2) continue;
    const consistent = counts.every((count) => count === columns);
    const score = (consistent ? 100 : 0) + columns;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

export interface ParseTextOptions {
  sourceName: string;
  delimiter?: string;
}

export function parseDelimitedText(text: string, options: ParseTextOptions): ParsedTable {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], sourceName: options.sourceName };
  }

  const delimiter = options.delimiter ?? detectDelimiter(lines);
  const headers = splitDelimitedLine(lines[0], delimiter);
  const width = headers.length;

  const rows = lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    // Pad short rows and drop overflow so every row matches the header width.
    while (cells.length < width) cells.push('');
    return cells.slice(0, width);
  });

  return { headers, rows, sourceName: options.sourceName };
}

export async function parseCsvFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  return parseDelimitedText(text, { sourceName: file.name });
}

export function parsePastedTable(text: string): ParsedTable {
  return parseDelimitedText(text, { sourceName: 'Pasted table' });
}
