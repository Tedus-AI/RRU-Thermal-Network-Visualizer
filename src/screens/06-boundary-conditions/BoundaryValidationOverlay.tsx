import { useState } from 'react';
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
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[23rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border border-line bg-surface/95 shadow-md">
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
