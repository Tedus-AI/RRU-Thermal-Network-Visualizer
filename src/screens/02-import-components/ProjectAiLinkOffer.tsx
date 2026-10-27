/**
 * 02's check step, for an AI-Thermal source: linking 01 to the project being
 * imported (`domain/projectAiLink.ts`).
 *
 * The 5G-RRU parameter console used to be offered here as a one-time copy into
 * 01's materials. A link replaces it: the project name, the band, the ambient
 * and 5G-RRU's fin process, coin, solder, via, base and TIM values are taken
 * from the AI-Thermal project and kept up to date by 01's 「從 AI-Thermal 更新」.
 * The dialog is 01's own, fed the database this screen has already read.
 */

import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';

import { Button } from '@/ui/primitives';
import { useProjectStore } from '@/data/projectStore';
import type { AiThermalDb } from '@/importers/component/parseAiThermal';
import { ProjectAiLinkDialog } from '@/project/ProjectAiLinkDialog';
import { useProjectAiLink } from '@/project/useProjectAiLink';

export function ProjectAiLinkOffer({
  db,
  label,
  projectId,
  projectName,
}: {
  db: AiThermalDb;
  label: string;
  projectId: string;
  projectName: string;
}) {
  const readOnly = useProjectStore((s) => s.isReadOnly());
  const ai = useProjectAiLink({ background: false });
  const { adoptDb, setTarget } = ai;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    adoptDb(db, label);
    setTarget(projectId);
  }, [db, label, projectId, adoptDb, setTarget]);

  const link = ai.link;
  const differ = ai.plan?.rows.length ?? 0;

  if (link && link.project_id !== projectId) {
    return (
      <p className="rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5 text-[12px] text-warn-600">
        01 連結的是 AI-Thermal 專案「{link.project_name}」，不是這次匯入的「{projectName}」。專案名稱、頻段、環境溫度與
        5G-RRU 參數照 01 的連結；要改連到這個專案，請在 01 解除連結後重新連結。
      </p>
    );
  }

  return (
    <section className="rounded-md border border-line bg-surface p-3 text-[12px]" aria-labelledby="ait-link-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="ait-link-title" className="font-semibold text-ink-700">
          AI-Thermal 專案「{projectName}」→ 01 專案資訊
        </p>
        <p className="text-ink-400">
          {link ? (ai.pending > 0 ? `已連結・${ai.pending} 項可更新` : '已連結・沒有要更新的') : `${differ} 項與 01 不同`}
        </p>
      </div>
      <p className="mt-1.5 leading-relaxed text-ink-500">
        {link
          ? '01 已連結這個專案：專案名稱、頻段、環境溫度，以及 5G-RRU 參數控制台的鰭片製程、銅塊、焊料、導熱孔、散熱器底座與 TIM，由 01 的「從 AI-Thermal 更新」維護。'
          : '連結後，專案名稱、頻段、環境溫度，以及 5G-RRU 參數控制台的鰭片製程、銅塊、焊料、導熱孔、散熱器底座與 TIM，都改取這個專案的值並鎖定（可按 ✂ 解開），之後由 01 的「從 AI-Thermal 更新」維護。'}
      </p>
      {(!link || ai.pending > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={<Link2 size={14} />} disabled={readOnly || !ai.plan} onClick={() => setOpen(true)}>
            {link ? `更新 01（${ai.pending} 項）…` : '連結 01…'}
          </Button>
          {readOnly && <span className="text-ink-400">專案唯讀，不能連結。</span>}
        </div>
      )}
      {open && <ProjectAiLinkDialog ai={ai} readOnly={readOnly} onClose={() => setOpen(false)} />}
    </section>
  );
}
