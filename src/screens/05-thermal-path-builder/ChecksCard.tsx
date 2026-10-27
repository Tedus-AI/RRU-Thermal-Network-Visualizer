/**
 * Card ④ 檢查: is the network and its boundary ready for 07, and if not, what
 * is left. One list for both halves (`checksModel.ts`); a row opens what it is
 * about — a graph object, or a surface in card ②. Fixed temperatures, an
 * advanced input for test fixtures, are folded at the bottom.
 */

import { AlertTriangle, CircleAlert, CircleCheck, Info } from 'lucide-react';

import { useBoundaryStore } from '@/data/boundaryStore';

import { FixedTemperaturePanel } from '@/screens/06-boundary-conditions/FixedTemperaturePanel';

import { CardDisclosure, WorkspaceCard, type CardTone } from './WorkspaceCard';
import type { CheckIssue, ChecksModel } from './checksModel';
import type { BoundaryWorkspace } from './useBoundaryWorkspace';

const ICON = {
  error: <CircleAlert size={13} className="mt-px shrink-0 text-danger-600" aria-label="錯誤" />,
  warning: <AlertTriangle size={13} className="mt-px shrink-0 text-warn-600" aria-label="警告" />,
  info: <Info size={13} className="mt-px shrink-0 text-accent-600" aria-label="資訊" />,
};

const ROW = {
  error: 'border-danger-500/40 bg-danger-100',
  warning: 'border-warn-500/40 bg-warn-100',
  info: 'border-line bg-surface-muted',
};

export function ChecksCard({
  model,
  boundary,
  readOnly,
  open,
  onToggle,
  onFocusIssue,
}: {
  model: ChecksModel;
  boundary: BoundaryWorkspace;
  readOnly: boolean;
  open: boolean;
  onToggle: () => void;
  onFocusIssue: (issue: CheckIssue) => void;
}) {
  const tone: CardTone = model.errors > 0 ? 'danger' : model.warnings > 0 ? 'warn' : 'ok';
  const status =
    model.errors > 0 || model.warnings > 0
      ? `${model.errors} 錯誤・${model.warnings} 警告`
      : '可以求解';

  return (
    <WorkspaceCard
      id="card-checks"
      index={4}
      title="檢查"
      subtitle="熱網路＋邊界，一份清單"
      status={status}
      tone={tone}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex flex-col gap-2.5">
        <ul className="flex flex-col gap-1" data-readiness>
          {model.rows.map((row) => (
            <li key={row.id} className="flex items-start gap-1.5 text-[11.5px]" data-passed={row.passed}>
              {row.passed ? (
                <CircleCheck size={13} className="mt-px shrink-0 text-ok-600" aria-label="通過" />
              ) : (
                <CircleAlert size={13} className="mt-px shrink-0 text-danger-600" aria-label="未通過" />
              )}
              <span className={`min-w-0 flex-1 ${row.passed ? 'text-ink-700' : 'font-semibold text-danger-600'}`}>
                {row.label}
              </span>
              {row.detail && <span className="tabular shrink-0 text-[10.5px] text-ink-400">{row.detail}</span>}
            </li>
          ))}
        </ul>

        {model.issues.length > 0 && (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto border-t border-line pt-2" data-issues>
            {model.issues.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onFocusIssue(entry)}
                  className={`flex w-full items-start gap-1.5 rounded border px-2 py-1 text-left ${ROW[entry.severity]}`}
                >
                  {ICON[entry.severity]}
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-snug text-ink-900">{entry.text}</span>
                    {entry.hint && (
                      <span className="block text-[10px] leading-snug text-ink-500">→ {entry.hint}</span>
                    )}
                    <span className="block text-[9.5px] text-ink-400">
                      {entry.source === 'network' ? '熱網路' : '散熱表面'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <CardDisclosure
          name="fixed-temperature"
          title="固定溫度（選填）"
          hint={boundary.fixedRows.length > 0 ? `${boundary.fixedRows.length} 個` : '冷板、環境箱治具'}
          defaultOpen={boundary.fixedRows.length > 0}
        >
          <p className="mb-2 text-[10.5px] leading-relaxed text-ink-400">
            已知溫度的冷板、環境箱治具或測試介面用。一般戶外運作用環境溫度＋對流即可，不必填。
          </p>
          <FixedTemperaturePanel
            rows={boundary.fixedRows}
            candidatePorts={boundary.fixedCandidates}
            readOnly={readOnly}
            onAdd={(portId) => boundary.addProfileToPort(portId, 'fixed_temperature_boundary')}
            onPatch={(profile) => useBoundaryStore.getState().upsertProfile(profile)}
            onRemove={boundary.removeProfile}
          />
        </CardDisclosure>
      </div>
    </WorkspaceCard>
  );
}
