/**
 * AI-Thermal's numbers in Screen 04 (`aiThermalLink.ts`).
 *
 * A field AI-Thermal supplied is a reference here, not an editor: white plain
 * text with an "AI-Thermal" tag, and a ✂ to take it over. Taken over, it is the
 * ordinary editor again with one line under it saying what AI-Thermal has and
 * offering to go back. The table shows the same reference, with the ✂ left to
 * the inspector so a row stays one line; a field taken over carries a small
 * corner mark there, or it would look exactly like one AI-Thermal never gave.
 */

import type { ReactNode } from 'react';
import { RotateCcw, Scissors } from 'lucide-react';

import { FieldLabel } from '@/ui/FieldLabel';
import type { Component } from '@/domain/component';
import {
  AI_FIELD_LABEL,
  AI_PATCH_FIELDS,
  aiLinkOf,
  aiValueOf,
  formatAiValue,
  isAiLocked,
  relockAiField,
  sameAiValue,
  unlockAiField,
  type AiField,
} from '@/domain/aiThermalLink';
import { DIRECT_CONTACT_TIM_ID, type MaterialDefaults } from '@/domain/materials';

export type PatchFn = (id: string, patch: Partial<Component>, fields: string[]) => void;

/** A TIM id as the engineer reads it. */
export function timNameOf(materials: MaterialDefaults) {
  return (id: string) =>
    id === DIRECT_CONTACT_TIM_ID ? '乾式接觸' : (materials.tim.find((m) => m.id === id)?.name ?? id);
}

function syncedDate(component: Component): string {
  return aiLinkOf(component)?.synced_at?.slice(0, 10) ?? '';
}

/** The tooltip every locked value carries: where it came from and the two ways to change it. */
export function aiLockTitle(component: Component, field: AiField, table = false): string {
  const date = syncedDate(component);
  return [
    `${AI_FIELD_LABEL[field]}取自 AI-Thermal${date ? `（${date} 帶入）` : ''}。`,
    '要改：到 AI-Thermal 改，再按 04 的「從 AI-Thermal 更新」；',
    table ? '或在右側檢視面板按 ✂ 解開，改用本工具的值。' : '或按 ✂ 解開，改用本工具的值。',
  ].join('\n');
}

function unlock(component: Component, field: AiField, onPatch: PatchFn) {
  onPatch(component.id, { provenance: unlockAiField(component, field).provenance }, ['provenance']);
}

/** Back to AI-Thermal's values and locked; only a value that moves invalidates. */
function relock(component: Component, fields: AiField[], onPatch: PatchFn) {
  const link = aiLinkOf(component);
  const touched = new Set<string>(['provenance']);
  let next = component;
  for (const field of fields) {
    if (link && !sameAiValue(aiValueOf(next, field), link.values[field])) {
      for (const path of AI_PATCH_FIELDS[field]) touched.add(path);
    }
    next = relockAiField(next, field);
  }
  onPatch(component.id, next, [...touched]);
}

/** Linked, but AI-Thermal said nothing for this field at the last sync: it is this tool's. */
export function aiNotStated(component: Component, field: AiField): boolean {
  const link = aiLinkOf(component);
  return !!link && !(field in link.values);
}

/** Why a linked part's heat path is not locked when AI-Thermal left it open. */
export const AI_HEAT_PATH_UNSTATED =
  'AI-Thermal 沒有指定主散熱路徑（None 或未選），由本工具決定。' +
  '要由 AI-Thermal 管：到 AI-Thermal 的 TH/ME 頁選「主散熱路徑」，再按 04 的「從 AI-Thermal 更新」。';

/** A table cell's locked value: plain text and a small AI tag. */
export function AiCellRef({
  component,
  field,
  text,
  className = '',
}: {
  component: Component;
  field: AiField;
  text: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={aiLockTitle(component, field, true)}
      className={`tabular flex h-7 min-w-0 items-center justify-center gap-1 px-1 text-[12px] text-ink-900 ${className}`}
    >
      <span className="truncate">{text}</span>
      <AiTag />
    </span>
  );
}

function AiTag() {
  return (
    <span
      aria-label="取自 AI-Thermal"
      className="shrink-0 rounded-sm bg-accent-100 px-1 text-[9.5px] leading-[14px] font-bold text-accent-700"
    >
      AI
    </span>
  );
}

/**
 * The table's mark on a field that was taken over (`fields` share one cell):
 * a small corner button saying what AI-Thermal has, that puts it back. The
 * cell must be `relative`. Amber when the values differ.
 */
export function AiCellUnlocked({
  component,
  fields,
  readOnly,
  onPatch,
  timName,
}: {
  component: Component;
  fields: AiField[];
  readOnly: boolean;
  onPatch: PatchFn;
  timName?: (id: string) => string;
}) {
  const link = aiLinkOf(component);
  if (!link) return null;
  const open = fields.filter((field) => field in link.values && !isAiLocked(component, field));
  if (open.length === 0) return null;
  const differs = open.some((field) => !sameAiValue(aiValueOf(component, field), link.values[field]));
  const title = [
    '已解開：用的是本工具的值。',
    ...open.map(
      (field) => `AI-Thermal 的${AI_FIELD_LABEL[field]}是 ${formatAiValue(field, link.values[field], timName)}。`,
    ),
    differs ? '點一下改回 AI-Thermal 的值並鎖定。' : '目前與 AI-Thermal 相同，點一下鎖回。',
  ].join('\n');
  return (
    <button
      type="button"
      data-ai-unlocked={open.join(' ')}
      aria-label={`${open.map((field) => AI_FIELD_LABEL[field]).join('、')}已解開，${differs ? '改回 AI-Thermal' : '鎖回'}`}
      title={title}
      disabled={readOnly}
      onClick={(event) => {
        event.stopPropagation();
        relock(component, open, onPatch);
      }}
      className={`absolute top-0 right-0.5 z-[1] inline-flex items-center gap-px rounded-sm border bg-surface px-0.5 text-[9px] leading-[11px] font-bold hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-60 ${
        differs ? 'border-warn-500 text-warn-600' : 'border-accent-600/60 text-accent-700'
      }`}
    >
      <Scissors size={8} aria-hidden />
      AI
    </button>
  );
}

/** The ✂ — takes the field over. */
function UnlockButton({
  component,
  field,
  readOnly,
  onPatch,
}: {
  component: Component;
  field: AiField;
  readOnly: boolean;
  onPatch: PatchFn;
}) {
  return (
    <button
      type="button"
      aria-label={`解開${AI_FIELD_LABEL[field]}，改用本工具的值`}
      title="解開：改用本工具的值（之後「從 AI-Thermal 更新」預設不覆蓋這一欄）"
      disabled={readOnly}
      onClick={() => unlock(component, field, onPatch)}
      className="flex size-7 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Scissors size={14} aria-hidden />
    </button>
  );
}

/** The locked value in the inspector: white plain text, the tag, the ✂. */
export function AiLockedBox({
  component,
  field,
  id,
  text,
  readOnly,
  onPatch,
}: {
  component: Component;
  field: AiField;
  id?: string;
  text: ReactNode;
  readOnly: boolean;
  onPatch: PatchFn;
}) {
  return (
    <div
      id={id}
      data-ai-locked={field}
      title={aiLockTitle(component, field)}
      className="flex min-h-9 items-center gap-2 rounded-md border border-l-[3px] border-line border-l-accent-600 bg-surface py-0.5 pr-1 pl-2.5 text-[13px] text-ink-900"
    >
      <span className="tabular min-w-0 flex-1 truncate">{text}</span>
      <span className="shrink-0 text-[10.5px] font-semibold text-accent-700">AI-Thermal</span>
      <UnlockButton component={component} field={field} readOnly={readOnly} onPatch={onPatch} />
    </div>
  );
}

/**
 * The line under a field that was taken over: what AI-Thermal has, and the way
 * back. Nothing when AI-Thermal never supplied the field.
 */
export function AiUnlockedNote({
  component,
  field,
  readOnly,
  onPatch,
  timName,
}: {
  component: Component;
  field: AiField;
  readOnly: boolean;
  onPatch: PatchFn;
  timName?: (id: string) => string;
}) {
  const link = aiLinkOf(component);
  if (!link || !(field in link.values) || isAiLocked(component, field)) return null;
  const differs = !sameAiValue(aiValueOf(component, field), link.values[field]);
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 text-[11px] ${differs ? 'text-warn-600' : 'text-ink-400'}`}
    >
      <span>
        {differs
          ? `已解開・AI-Thermal 是 ${formatAiValue(field, link.values[field], timName)}`
          : '已解開，目前與 AI-Thermal 相同'}
      </span>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => relock(component, [field], onPatch)}
        className="inline-flex items-center gap-0.5 font-semibold text-accent-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RotateCcw size={11} aria-hidden />
        {differs ? '改回 AI-Thermal' : '鎖回'}
      </button>
    </p>
  );
}

/** A line under a control that stays visible but locked (the heat path tiles). */
export function AiLockLine({
  component,
  field,
  readOnly,
  onPatch,
  children,
}: {
  component: Component;
  field: AiField;
  readOnly: boolean;
  onPatch: PatchFn;
  children: ReactNode;
}) {
  return (
    <p
      title={aiLockTitle(component, field)}
      className="mt-1.5 flex items-center gap-1.5 border-l-[3px] border-l-accent-600 pl-2 text-[11px] text-ink-500"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <UnlockButton component={component} field={field} readOnly={readOnly} onPatch={onPatch} />
    </p>
  );
}

/**
 * One AI-Thermal field in the inspector: the locked box while AI-Thermal owns
 * it, otherwise the editor (`children`) and, if it was taken over, the note.
 */
export function AiOwned({
  component,
  field,
  readOnly,
  onPatch,
  label,
  zh,
  unit,
  tooltip,
  id,
  text,
  timName,
  className = '',
  children,
}: {
  component: Component;
  field: AiField;
  readOnly: boolean;
  onPatch: PatchFn;
  label: string;
  zh: string;
  unit?: string;
  tooltip?: string;
  /** The editor's id, so a focus link from an issue still lands here. */
  id?: string;
  /** The locked value; defaults to AI-Thermal's value as text. */
  text?: ReactNode;
  timName?: (id: string) => string;
  className?: string;
  children: ReactNode;
}) {
  if (isAiLocked(component, field)) {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <FieldLabel label={label} zh={zh} unit={unit} tooltip={tooltip} />
        <AiLockedBox
          component={component}
          field={field}
          id={id}
          text={text ?? formatAiValue(field, aiValueOf(component, field), timName)}
          readOnly={readOnly}
          onPatch={onPatch}
        />
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {children}
      <AiUnlockedNote
        component={component}
        field={field}
        readOnly={readOnly}
        onPatch={onPatch}
        timName={timName}
      />
    </div>
  );
}
