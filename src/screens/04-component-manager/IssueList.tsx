/**
 * "Needs attention" — every open issue in the project, as links.
 *
 * The table alone can say a component has a warning; it cannot say which field,
 * and it cannot take you there. This does both: one click selects the component,
 * opens the inspector on the right tab and puts the caret in the field. Once the
 * field is filled — or the guess confirmed — the row disappears on its own,
 * because it is derived from the component, not from a dismissed-flag.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, CircleCheck, XCircle } from 'lucide-react';

import { Button } from '@/ui/primitives';
import type { Component } from '@/domain/component';
import type { ComponentIssue } from '@/domain/componentReadiness';
import { confirmAction, groupIssues, issueTarget, type InspectorTab } from './issueTargets';

export function IssueList({
  components,
  validate,
  readOnly,
  onGoToIssue,
  onPatch,
}: {
  components: Component[];
  validate: (component: Component) => ComponentIssue[];
  readOnly: boolean;
  onGoToIssue: (componentId: string, tab: InspectorTab, fieldId: string) => void;
  onPatch: (id: string, patch: Partial<Component>, fields: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const groups = groupIssues(components, validate);

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ok-500/30 bg-ok-100/40 px-3.5 py-2.5 text-[12px] text-ok-600">
        <CircleCheck size={15} aria-hidden />
        <span className="font-semibold">
          Every enabled component is ready.
          <span className="ml-1.5 font-normal text-ink-500">所有啟用中的元件皆已就緒。</span>
        </span>
      </div>
    );
  }

  const errors = groups.reduce((sum, group) => sum + group.errors, 0);
  const warnings = groups.reduce((sum, group) => sum + group.warnings, 0);

  return (
    <section className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <h2 className="text-[13px] font-bold text-ink-900">
          Needs attention
          <span className="ml-1.5 font-normal text-ink-500">待處理</span>
        </h2>
        <span className="ml-auto flex items-center gap-3 text-[12px]">
          {errors > 0 && (
            <span className="flex items-center gap-1 font-semibold text-danger-600">
              <XCircle size={13} aria-hidden />
              {errors}
            </span>
          )}
          {warnings > 0 && (
            <span className="flex items-center gap-1 font-semibold text-warn-600">
              <AlertTriangle size={13} aria-hidden />
              {warnings}
            </span>
          )}
          <span className="text-ink-400">
            {groups.length} component{groups.length > 1 ? 's' : ''} / {groups.length} 個元件
          </span>
        </span>
      </button>

      {open && (
        <ul className="flex flex-col gap-2 border-t border-line px-3.5 py-2.5">
          {groups.map((group) => (
            <li key={group.component.id}>
              <p className="text-[12px] font-semibold text-ink-900">
                {group.component.name}
                <span className="ml-1.5 font-normal text-ink-400">{group.component.category}</span>
              </p>
              <ul className="mt-1 flex flex-col gap-1 pl-3">
                {group.issues.map((issue, index) => {
                  const target = issueTarget(issue.field);
                  const confirm = target?.confirm
                    ? confirmAction(group.component, target.confirm)
                    : null;
                  return (
                    <li
                      key={`${issue.field}-${index}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      <span
                        aria-hidden
                        className={
                          issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'
                        }
                      >
                        {issue.severity === 'error' ? '✕' : '⚠'}
                      </span>
                      <button
                        type="button"
                        disabled={!target}
                        onClick={() =>
                          target && onGoToIssue(group.component.id, target.tab, target.fieldId)
                        }
                        className={`text-left text-[12px] ${
                          issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'
                        } ${target ? 'hover:underline' : 'cursor-default'}`}
                      >
                        {issue.message_zh}
                        <span className="ml-1.5 text-[11px] text-ink-400">{issue.message}</span>
                      </button>
                      {/* An assumed value is cleared by saying so, not by retyping it. */}
                      {confirm && !readOnly && (
                        <Button
                          className="h-6"
                          onClick={() =>
                            onPatch(group.component.id, confirm.patch, confirm.fields)
                          }
                        >
                          {confirm.labelZh}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
