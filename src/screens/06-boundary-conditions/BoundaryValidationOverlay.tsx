/**
 * Screen 06's validation panel, over the graph.
 *
 * Bottom-RIGHT, matching Screen 05's — the two screens share a canvas component
 * and an engineer moves between them constantly, so the panel that says whether
 * the work is finished should not change corners on the way.
 *
 * It opens itself when there is something to read and folds away when there is
 * not. A panel that is always open teaches the reader to ignore it, and on a
 * finished scenario the only thing it has to say is that the previews were
 * calculated — which the previews themselves already show. Once the reader
 * touches it, their choice stands until the counts actually change.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, CircleAlert, Info } from 'lucide-react';

import type {
  BoundaryValidationMessage,
  BoundaryValidationState,
} from '@/thermal/boundary/types';
import { BoundaryValidationPanel, type ReadinessCheck } from './BoundaryValidationPanel';

export function BoundaryValidationOverlay({
  validation,
  checks,
  onFocus,
}: {
  validation: BoundaryValidationState;
  checks: ReadinessCheck[];
  onFocus: (message: BoundaryValidationMessage) => void;
}) {
  // Info alone is not something to interrupt for; an error or a warning is.
  const needsAttention = validation.errors.length > 0 || validation.warnings.length > 0;
  const [open, setOpen] = useState(needsAttention);

  // Follows the state, not every render: the effect fires only when the scenario
  // crosses between "clean" and "not", so a panel the reader opened on a clean
  // scenario stays open while they read it.
  useEffect(() => {
    setOpen(needsAttention);
  }, [needsAttention]);

  return (
    <div className="absolute right-3 bottom-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[23rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border border-line bg-surface/95 shadow-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="text-[11px] font-bold text-ink-700">Validation / 驗證檢查</span>
        <span className="ml-auto flex items-center gap-2 text-[10px] font-bold">
          <span className="flex items-center gap-1 text-danger-600">
            <CircleAlert size={12} /> {validation.errors.length}
          </span>
          <span className="flex items-center gap-1 text-warn-600">
            <AlertTriangle size={12} /> {validation.warnings.length}
          </span>
          <span className="flex items-center gap-1 text-accent-600">
            <Info size={12} /> {validation.infos.length}
          </span>
        </span>
        <ChevronDown size={13} className={`text-ink-400 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="min-h-0 overflow-y-auto border-t border-line px-2 py-1.5">
          <BoundaryValidationPanel validation={validation} checks={checks} onFocus={onFocus} />
        </div>
      )}
    </div>
  );
}
