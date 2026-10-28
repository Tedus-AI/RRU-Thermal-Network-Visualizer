/**
 * Presentation helpers for the export in 10 報告與匯出 (12 §61).
 *
 * Formatting only. Nothing here decides readiness or produces a file — that all
 * lives in `src/export`, per 12 §39's rule that serialization and logic do not
 * belong inside React components.
 */


export function bytes(size: number | undefined | null): string {
  if (size == null || !Number.isFinite(size)) return 'N/A';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleTimeString();
}
