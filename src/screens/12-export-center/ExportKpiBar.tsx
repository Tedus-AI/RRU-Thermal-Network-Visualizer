/**
 * Header KPI cards — 12 §7, §59.
 *
 * §7 named six: Export Status, Ready Artifacts, Warnings, Blocked, Package Size
 * Estimate, Last Export. Four of them did not earn their place on the page.
 *
 * Export Status printed the same word the badge beside the title already prints,
 * at 21px. Warnings and Blocked were bare counts — "1" and "1" — with nothing
 * saying WHICH artifact or why, so the one question a reader has when they see
 * a blocked count ("what is held back, and what do I do about it?") needed the
 * table below to answer. Package Size Estimate was not an estimate at all: it
 * reported the total of the LAST run and read N/A until there had been one, and
 * the queue already prints a size per file and a session total.
 *
 * What is left is the pair a reader acts on: how much of the catalog is
 * exportable, with the held-back items named behind a disclosure, and when this
 * project was last exported. The tile is `ResultKpiTile`, the one Screens 06,
 * 07, 10 and 11 share, so the row matches the rest of the tool.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronDown, Clock } from 'lucide-react';

import { ResultKpiTile } from '@/ui/ResultKpiTile';
import { biTitle } from '@/ui/FieldLabel';
import type { ArtifactType } from '@/export/exportTypes';
import { ARTIFACT_DEFINITIONS } from '@/export/exportTypes';
import type { ArtifactReadiness } from '@/export/exportValidator';

import { timeOf } from './exportViewModel';
import { T12 } from './tooltips';

export function ExportKpiBar({
  readiness,
  lastExport,
}: {
  readiness: Partial<Record<ArtifactType, ArtifactReadiness>>;
  lastExport: string | null;
}) {
  const [openHeldBack, setOpenHeldBack] = useState(false);

  const total = ARTIFACT_DEFINITIONS.length;
  const ready = ARTIFACT_DEFINITIONS.filter(
    (definition) => readiness[definition.type]?.status === 'READY',
  );
  // Everything that is not plainly exportable, whatever the reason: a warning
  // that wants confirming, a stale source, a prerequisite that never ran. One
  // list, because to the reader they are one question.
  const heldBack = ARTIFACT_DEFINITIONS.filter(
    (definition) => readiness[definition.type]?.status !== 'READY',
  );

  const warnings = heldBack.filter(
    (definition) => readiness[definition.type]?.status === 'WARNING',
  ).length;
  const stopped = heldBack.length - warnings;

  return (
    /* Capped rather than stretched across the page. Six cards used to fill the
       band; two of them spread over 1900 px would each be a metre of white with
       a number at the end, and the tiles on 10 and 11 sit at about 500 px. */
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:max-w-[62rem]">
      <ResultKpiTile
        icon={CheckCircle2}
        label="Ready Artifacts"
        zh="可匯出項目"
        explanation={T12.artifact}
        value={`${ready.length} / ${total}`}
        valueTone={ready.length === total ? 'ok' : ready.length === 0 ? 'danger' : 'warn'}
        note={
          heldBack.length === 0
            ? '全部符合前置條件'
            : `${warnings} 項警告 · ${stopped} 項無法匯出`
        }
        action={
          heldBack.length > 0 && (
            <button
              type="button"
              aria-expanded={openHeldBack}
              title={biTitle('What is held back, and why', '哪些項目不能匯出、原因為何')}
              onClick={() => setOpenHeldBack((open) => !open)}
              className="flex size-4 shrink-0 items-center justify-center rounded text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${openHeldBack ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          )
        }
      >
        {openHeldBack && heldBack.length > 0 && (
          /* The reason, not just the count. A blocked artifact is only
             actionable once the reader knows which one it is and what would
             unblock it — both of which the readiness check already worked out. */
          <ul className="mt-1.5 flex flex-col gap-1 border-t border-line pt-1.5">
            {heldBack.map((definition) => {
              const entry = readiness[definition.type];
              const blocking = entry?.status !== 'WARNING';
              return (
                <li key={definition.type} className="text-[10.5px] leading-snug">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={`shrink-0 font-bold ${blocking ? 'text-danger-600' : 'text-warn-600'}`}
                    >
                      {entry?.status ?? 'NOT_AVAILABLE'}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-ink-900">
                      {definition.zh}
                    </span>
                  </span>
                  {entry?.reason_zh && (
                    <span className="block text-ink-400">{entry.reason_zh}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ResultKpiTile>

      <ResultKpiTile
        icon={Clock}
        label="Last Export"
        zh="上次匯出"
        explanation={T12.exportSession}
        value={lastExport ? timeOf(lastExport) : 'Never'}
        valueTone="neutral"
        note={lastExport ? '本機瀏覽器產生' : '尚未匯出'}
      />
    </div>
  );
}
