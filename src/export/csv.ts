/**
 * JSON serialization for the export layer.
 *
 * This module used to build the CSV tables as well — the column list, the
 * decimal formatting, the unit row and the UTF-8 BOM. Those went with the five
 * data files the Export Center no longer produces, and the three settings that
 * steered them went with the panel rows. What is left is the one writer the
 * Engineering Package still needs.
 */

/**
 * The manifest is written pretty and always has been readable by eye: it is
 * the file an engineer opens to ask which solve a package came from, and a
 * compact one answers that question in a single unbroken line.
 */
export function encodeJson(value: unknown, format: 'pretty' | 'compact' = 'pretty'): string {
  return format === 'pretty' ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}
