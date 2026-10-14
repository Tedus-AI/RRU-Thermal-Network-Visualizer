/**
 * Screen 05 action bar: back, reset view, the out-of-date Rth notice, Validate
 * and Save & Continue.
 */

import { ArrowLeft, ArrowRight, CircleCheck, RefreshCw, RotateCcw } from 'lucide-react';

import { projectPath } from '@/app/navigation';
import { Button } from '@/ui/primitives';

import { staleComponentNames } from '@/thermal/graph/staleLinkedEdges';

import type { ThermalPathBuilder } from './useThermalPathBuilder';

/** For the hover list on the out-of-date badge. */
function rthText(value: number | null): string {
  return value == null ? 'unresolved' : `${value.toFixed(3)} °C/W`;
}

interface BuilderActionBarProps {
  builder: ThermalPathBuilder;
  projectId: string;
  blockingErrors: number;
  isEmpty: boolean;
  onSaveAndContinue: () => void;
  onValidate: () => void;
}

export function BuilderActionBar({
  builder,
  projectId,
  blockingErrors,
  isEmpty,
  onSaveAndContinue: handleSaveAndContinue,
  onValidate: handleValidate,
}: BuilderActionBarProps) {
  const { canvasRef, layoutMode, navigate, readOnly, setShowGenerate, staleEdges } = builder;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
      <Button
        icon={<ArrowLeft size={15} />}
        onClick={() => navigate(projectPath(projectId, 'components'))}
      >
        Back / 返回
      </Button>
      <Button
        icon={<RotateCcw size={15} />}
        onClick={() => {
          canvasRef.current?.runLayout(layoutMode);
          canvasRef.current?.fit();
        }}
      >
        Reset View / 重設視圖
      </Button>

      {blockingErrors > 0 && (
        <span className="text-[12px] font-medium text-danger-600">
          {blockingErrors} blocking error{blockingErrors > 1 ? 's' : ''} must be fixed before
          Screen 06 / 需先修正錯誤
        </span>
      )}

      {/* The graph is drawing numbers the solver would not use. It is not an
          error — Screen 07 already reads the links live, so the ANSWER is
          current; it is this picture that has fallen behind. Placed here
          because the action bar is always on screen, and made a button
          because the remedy is one dialog away and there is no reason to
          make someone go and find it. */}
      {staleEdges.length > 0 && !readOnly && (
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          title={staleEdges
            .map(
              (entry) =>
                `${entry.component_name} · ${entry.edge_id}: ${rthText(entry.stored_C_per_W)} → ${rthText(entry.resolved_C_per_W)}`,
            )
            .join('\n')}
          className="flex items-center gap-1.5 rounded-md border border-warn-400 bg-warn-100 px-2.5 py-1 text-[12px] font-medium text-warn-600 transition-colors hover:border-warn-500 hover:bg-warn-400/25"
        >
          <RefreshCw size={13} />
          {staleEdges.length} resistance{staleEdges.length > 1 ? 's' : ''} out of date on{' '}
          {staleComponentNames(staleEdges).length} component
          {staleComponentNames(staleEdges).length > 1 ? 's' : ''}
          <span className="text-warn-600/80">／熱阻已過期，點此重新產生</span>
        </button>
      )}

      <div className="ml-auto flex gap-2">
        <Button
          icon={<CircleCheck size={15} />}
          onClick={handleValidate}
        >
          Validate / 驗證
        </Button>
        <Button
          variant="primary"
          trailingIcon={<ArrowRight size={15} />}
          disabled={blockingErrors > 0 || isEmpty}
          onClick={handleSaveAndContinue}
        >
          Save &amp; Continue / 儲存並繼續
        </Button>
      </div>
    </div>
  );
}
