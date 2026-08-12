/**
 * Presentation helpers for Screen 12.
 *
 * Formatting only. Nothing here decides readiness or produces a file — that all
 * lives in `src/export`, per 12 §39's rule that serialization and logic do not
 * belong inside React components.
 */

import type { Tone } from '@/ui/primitives';
import type {
  ArtifactStatus,
  GlobalExportStatus,
  SourceReadiness,
} from '@/export/exportTypes';

export const ARTIFACT_TONE: Record<ArtifactStatus, Tone> = {
  READY: 'ok',
  WARNING: 'warn',
  BLOCKED: 'danger',
  NOT_AVAILABLE: 'neutral',
  EXPORTING: 'accent',
  EXPORTED: 'ok',
  FAILED: 'danger',
};

export const GLOBAL_TONE: Record<GlobalExportStatus, Tone> = {
  READY: 'ok',
  WARNING: 'warn',
  PARTIAL: 'warn',
  EXPORTING: 'accent',
  COMPLETE: 'ok',
  FAILED: 'danger',
};

export const SOURCE_TONE: Record<SourceReadiness, Tone> = {
  READY: 'ok',
  WARNING: 'warn',
  BLOCKED: 'danger',
  NOT_AVAILABLE: 'neutral',
};

/** Bytes as an engineer reads them, with the unit attached. */
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
