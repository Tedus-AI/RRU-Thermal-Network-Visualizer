/**
 * Screen 01's linked values (`domain/projectAiLink.ts`), the same pattern as
 * 04's (`AiLocked.tsx`): a value the linked AI-Thermal project supplies is a
 * reference, not an editor — white plain text, the tool it came from
 * (AI-Thermal or 5G-RRU, whose parameter console sits in the same project
 * document) and a ✂ to take it over. Taken over, it is the ordinary editor
 * again with one line under it saying what the source has, and the way back.
 */

import type { ReactNode } from 'react';
import { RotateCcw, Scissors } from 'lucide-react';

import { FieldLabel } from '@/ui/FieldLabel';
import {
  formatProjectAiValue,
  isProjectAiLocked,
  isProjectAiUnlocked,
  projectAiCurrent,
  projectAiFieldInfo,
  projectAiLinkOf,
  sameProjectAiValue,
  type ProjectAiSource,
} from '@/domain/projectAiLink';
import { baselineOf } from '@/domain/projectAiLink';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { relockProjectAi, unlockProjectAi } from './projectAiActions';

export interface ProjectAiLockState {
  locked: boolean;
  unlocked: boolean;
  source: ProjectAiSource;
  /** The linked value, as taken at the last sync. */
  linked: string | number | undefined;
  /** The value here differs from the linked one (only meaningful when unlocked). */
  differs: boolean;
  title: string;
}

/** Where a field stands against the link. `null` when the project is not linked or the field is not part of it. */
export function useProjectAiLock(aiKey: string | undefined): ProjectAiLockState | null {
  const draft = useProjectStore((s) => s.draft);
  const scenarios = useScenarioStore((s) => s.scenarios);
  if (!aiKey || !draft) return null;
  const link = projectAiLinkOf(draft);
  if (!link || !(aiKey in link.values)) return null;
  const source = link.sources[aiKey] ?? 'AI-Thermal';
  const info = projectAiFieldInfo(aiKey, draft.materials);
  const current = projectAiCurrent(draft, baselineOf(scenarios), aiKey);
  const date = link.synced_at.slice(0, 10);
  const where = source === '5G-RRU' ? '5G-RRU 的參數控制台' : 'AI-Thermal';
  return {
    locked: isProjectAiLocked(draft, aiKey),
    unlocked: isProjectAiUnlocked(draft, aiKey),
    source,
    linked: link.values[aiKey],
    differs: !sameProjectAiValue(current, link.values[aiKey]),
    title: [
      `${info.label}取自 ${where}（AI-Thermal 專案「${link.project_name}」${date ? `，${date} 同步` : ''}）。`,
      `要改：到 ${where}改，再按 01 的「從 AI-Thermal 更新」；或按 ✂ 解開，改用本工具的值。`,
    ].join('\n'),
  };
}

export function SourceTag({ source }: { source: ProjectAiSource }) {
  return (
    <span
      className={`shrink-0 text-[10.5px] font-semibold ${source === '5G-RRU' ? 'text-rru-700' : 'text-accent-700'}`}
    >
      {source}
    </span>
  );
}

function UnlockButton({ aiKey, label, readOnly }: { aiKey: string; label: string; readOnly: boolean }) {
  return (
    <button
      type="button"
      aria-label={`解開${label}，改用本工具的值`}
      title="解開：改用本工具的值（之後「從 AI-Thermal 更新」預設不覆蓋這一欄）"
      disabled={readOnly}
      onClick={(event) => {
        event.stopPropagation();
        unlockProjectAi(aiKey);
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Scissors size={14} aria-hidden />
    </button>
  );
}

/** The locked value in a form: white plain text, where it came from, the ✂. */
export function ProjectAiBox({
  aiKey,
  lock,
  id,
  text,
  label,
  readOnly,
  compact = false,
}: {
  aiKey: string;
  lock: ProjectAiLockState;
  /** The editor's id, so a focus link from an issue still lands here. */
  id?: string;
  text: ReactNode;
  label: string;
  readOnly: boolean;
  /** In a table cell: no box, the row is the frame. */
  compact?: boolean;
}) {
  return (
    <div
      id={id}
      data-ai-locked={aiKey}
      title={lock.title}
      className={
        compact
          ? 'flex min-h-8 items-center justify-end gap-1.5 text-[13px] text-ink-900'
          : 'flex min-h-9 items-center gap-2 rounded-md border border-l-[3px] border-line border-l-accent-600 bg-surface py-0.5 pr-1 pl-2.5 text-[13px] text-ink-900'
      }
    >
      <span className={`tabular ${compact ? 'shrink-0' : 'min-w-0 flex-1 truncate'}`}>{text}</span>
      <SourceTag source={lock.source} />
      <UnlockButton aiKey={aiKey} label={label} readOnly={readOnly} />
    </div>
  );
}

/** The line under a field that was taken over: what the source has, and the way back. */
export function ProjectAiUnlockedNote({
  aiKey,
  lock,
  readOnly,
  compact = false,
  format = (value) => formatProjectAiValue(aiKey, value),
}: {
  aiKey: string;
  lock: ProjectAiLockState | null;
  readOnly: boolean;
  /** In a table cell: one small ↺ button, its title saying the rest. */
  compact?: boolean;
  format?: (value: string | number | undefined) => string;
}) {
  if (!lock || !lock.unlocked) return null;
  if (compact) {
    return (
      <button
        type="button"
        disabled={readOnly}
        data-ai-unlocked={aiKey}
        title={`${lock.differs ? `已解開・${lock.source} 是 ${format(lock.linked)}` : `已解開，目前與 ${lock.source} 相同`}\n點一下${lock.differs ? `改回 ${lock.source}` : '鎖回'}`}
        aria-label={lock.differs ? `改回 ${lock.source}` : '鎖回'}
        onClick={() => relockProjectAi(aiKey)}
        className={`inline-flex items-center gap-0.5 self-start text-[11px] font-semibold hover:underline disabled:cursor-not-allowed disabled:opacity-40 ${lock.differs ? 'text-warn-600' : 'text-ink-400'}`}
      >
        <RotateCcw size={10} aria-hidden />
        {lock.source}
      </button>
    );
  }
  return (
    <p
      data-ai-unlocked={aiKey}
      className={`flex flex-wrap items-center gap-x-1.5 text-[11px] ${lock.differs ? 'text-warn-600' : 'text-ink-400'}`}
    >
      <span>{lock.differs ? `已解開・${lock.source} 是 ${format(lock.linked)}` : `已解開，目前與 ${lock.source} 相同`}</span>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => relockProjectAi(aiKey)}
        className="inline-flex items-center gap-0.5 font-semibold text-accent-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RotateCcw size={11} aria-hidden />
        {lock.differs ? `改回 ${lock.source}` : '鎖回'}
      </button>
    </p>
  );
}

/**
 * One linked field of a form: the locked box while the link owns it, otherwise
 * the editor (`children`) and, if it was taken over, the note.
 */
export function ProjectAiOwned({
  aiKey,
  readOnly,
  label,
  zh,
  unit,
  tooltip,
  id,
  text,
  children,
}: {
  aiKey: string;
  readOnly: boolean;
  label: string;
  zh: string;
  unit?: string;
  tooltip?: string;
  id?: string;
  /** The locked value; defaults to the linked value as text. */
  text?: ReactNode;
  children: ReactNode;
}) {
  const lock = useProjectAiLock(aiKey);
  if (lock?.locked) {
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel label={label} zh={zh} unit={unit} tooltip={tooltip} htmlFor={id} />
        <ProjectAiBox
          aiKey={aiKey}
          lock={lock}
          id={id}
          label={zh}
          text={text ?? formatProjectAiValue(aiKey, lock.linked)}
          readOnly={readOnly}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {children}
      <ProjectAiUnlockedNote aiKey={aiKey} lock={lock} readOnly={readOnly} />
    </div>
  );
}

/** A line under a control that stays visible but locked (the fin chips). */
export function ProjectAiLockLine({
  aiKey,
  lock,
  readOnly,
  label,
  children,
}: {
  aiKey: string;
  lock: ProjectAiLockState;
  readOnly: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <p
      title={lock.title}
      className="mt-1.5 flex items-center gap-1.5 border-l-[3px] border-l-accent-600 pl-2 text-[11px] text-ink-500"
    >
      <span className="min-w-0">{children}</span>
      <SourceTag source={lock.source} />
      <UnlockButton aiKey={aiKey} label={label} readOnly={readOnly} />
    </p>
  );
}
