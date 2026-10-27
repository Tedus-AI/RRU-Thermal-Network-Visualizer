/**
 * Card ④ 檢查: the network's validation and the boundary set's, as one list.
 *
 * They used to be two panels on two pages, each saying "ready" about its own
 * half. The five readiness rows are what "ready for 07" means; the messages
 * below them are the work left, blocking first.
 */

import type { GraphIssue, GraphValidationResult } from '@/thermal/graph/graphValidation';
import type {
  BoundaryValidationMessage,
  BoundaryValidationState,
} from '@/thermal/boundary/types';
import type { BoundarySummary } from '@/screens/06-boundary-conditions/boundaryViewModel';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ReadinessRow {
  id: string;
  label: string;
  passed: boolean;
  /** The number behind the tick, e.g. `1 / 1`, `45 °C`. */
  detail?: string;
}

export type CheckIssue =
  | { key: string; severity: IssueSeverity; text: string; hint?: string; source: 'network'; issue: GraphIssue }
  | {
      key: string;
      severity: IssueSeverity;
      text: string;
      hint?: string;
      source: 'boundary';
      message: BoundaryValidationMessage;
    };

export interface ChecksModel {
  rows: ReadinessRow[];
  issues: CheckIssue[];
  errors: number;
  warnings: number;
  infos: number;
}

const ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

export function buildChecks({
  network,
  nodeCount,
  boundary,
  summary,
  ambient_C,
}: {
  network: GraphValidationResult | null;
  nodeCount: number;
  boundary: BoundaryValidationState;
  summary: BoundarySummary;
  ambient_C: number | null | undefined;
}): ChecksModel {
  const networkErrors = network?.errors ?? 0;
  const rows: ReadinessRow[] = [
    {
      id: 'network',
      label: '熱網路完整，沒有阻擋錯誤',
      passed: nodeCount > 0 && networkErrors === 0,
      detail: nodeCount === 0 ? '還沒有熱網路' : networkErrors > 0 ? `${networkErrors} 個錯誤` : undefined,
    },
    {
      id: 'surfaces',
      label: '每個散熱表面都有邊界條件',
      passed: summary.portsTotal > 0 && summary.portsAssigned === summary.portsTotal,
      detail: `${summary.portsAssigned} / ${summary.portsTotal}`,
    },
    {
      id: 'convection',
      label: '至少一條對流路徑把熱帶到環境',
      passed: summary.convectionProfiles > 0,
    },
    {
      id: 'ambient',
      label: '情境有環境溫度',
      passed: ambient_C != null && Number.isFinite(ambient_C),
      detail: ambient_C != null && Number.isFinite(ambient_C) ? `${ambient_C} °C` : undefined,
    },
    {
      id: 'values',
      label: '邊界的數值都有效',
      passed: boundary.errors.length === 0,
      detail: boundary.errors.length > 0 ? `${boundary.errors.length} 個錯誤` : undefined,
    },
  ];

  const issues: CheckIssue[] = [
    ...(network?.issues ?? []).map((issue, index): CheckIssue => ({
      key: `n:${issue.code}:${issue.nodeId ?? issue.edgeId ?? index}`,
      severity: issue.severity,
      text: issue.messageZh || issue.message,
      source: 'network',
      issue,
    })),
    ...[...boundary.errors, ...boundary.warnings, ...boundary.infos].map(
      (message): CheckIssue => ({
        key: `b:${message.id}`,
        severity: message.severity,
        text: message.message_zh || message.message,
        hint: message.suggested_action,
        source: 'boundary',
        message,
      }),
    ),
  ].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return {
    rows,
    issues,
    errors: issues.filter((entry) => entry.severity === 'error').length,
    warnings: issues.filter((entry) => entry.severity === 'warning').length,
    infos: issues.filter((entry) => entry.severity === 'info').length,
  };
}
