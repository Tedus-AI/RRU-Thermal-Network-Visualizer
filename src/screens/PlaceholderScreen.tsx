/**
 * Placeholder for screens 02–12.
 *
 * Routing, the shell and the shared stores exist from Phase 0, but each screen is
 * only implemented from its own specification document (00 §63 item 12: do not
 * implement all screens at once).
 */

import { Construction } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { SCREENS } from '@/app/navigation';
import { Button } from '@/ui/primitives';
import { useGuardedNavigate } from '@/app/useGuardedNavigate';
import { projectPath } from '@/app/navigation';

export function PlaceholderScreen({ code }: { code: string }) {
  const screen = SCREENS.find((s) => s.code === code)!;
  const { projectId } = useParams();
  const navigate = useGuardedNavigate();

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-lg rounded-lg border border-line bg-surface p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-surface-muted text-ink-400">
          <Construction size={22} />
        </div>
        <h1 className="text-[17px] font-bold text-ink-900">
          {screen.code} {screen.label}
          <span className="ml-2 font-normal text-ink-400">({screen.labelEn})</span>
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          此畫面尚未開發。依照開發規範，每個 Screen 只會依據它自己的規格文件
          <code className="mx-1 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[12px] text-ink-700">
            {screen.code}_{screen.labelEn.replace(/ /g, '_')}.md
          </code>
          與 UI mockup 實作。
        </p>
        {projectId && (
          <Button
            className="mt-5"
            variant="secondary"
            onClick={() => navigate(projectPath(projectId, 'info'))}
          >
            返回專案資訊
          </Button>
        )}
      </div>
    </div>
  );
}
