/**
 * Analysis cache key — 08 §14, §26.
 *
 * An analysis is only valid for the exact inputs it was run on. The key
 * therefore carries the 07 baseline fingerprint AND every setting that changes
 * the answer: scope, reduction, target metric, target node and the filters.
 * Change any of them and the stored analysis is DIRTY, not merely out of date.
 */

import type { AnalysisSettings, BottleneckAnalysis } from './analysisTypes';
import { resultRevisionMatches, type SourceRevision } from '@/domain/revision';

export function analysisKey(baselineSignature: string, settings: AnalysisSettings): string {
  const filters = settings.filters;
  return [
    baselineSignature,
    settings.scope,
    settings.reduction_pct,
    settings.target_metric,
    settings.target_node_id ?? '-',
    [...settings.custom_edge_ids].sort().join(','),
    filters.edge_type,
    filters.component,
    filters.zone,
    filters.rth_source,
    filters.confidence,
    filters.sharing,
    filters.boundary,
  ].join('|');
}

/** True when a stored analysis still describes the inputs on screen. */
export function isAnalysisCurrent(
  analysis: BottleneckAnalysis | null,
  baselineSignature: string | null,
  settings: AnalysisSettings,
  sourceRevision?: SourceRevision,
): boolean {
  if (!analysis || !baselineSignature) return false;
  if (
    sourceRevision &&
    (!analysis.source_revision || !resultRevisionMatches(analysis.source_revision, sourceRevision))
  ) {
    return false;
  }
  return analysisKey(analysis.baseline_signature, analysis.settings) === analysisKey(baselineSignature, settings);
}
