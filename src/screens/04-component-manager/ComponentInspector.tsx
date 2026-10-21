/**
 * Component inspector — 04 §13–§21, §27, §33.
 *
 * Five tabs: 概要, 熱規格, 幾何, 建模偏好, 來源. External Mapping (FloTHERM
 * aliases) is not offered while Screen 03 is deferred. Nothing here creates a
 * node or an edge (04 §19, §40).
 *
 * The nine-item completeness checklist used to sit under every tab, the same
 * block whichever tab was open. The panel's title bar now carries the score,
 * and this panel lists only what is missing and what to fix, each a link.
 * Each tab is its own component (`ComponentInspectorTabs.tsx` and the Thermal
 * Spec and Geometry files beside it); what they read is derived once per
 * render by `deriveInspector` (`componentInspectorModel.ts`).
 *
 * The screen owns the active tab rather than this component, because an issue
 * elsewhere on the page has to be able to open the tab that fixes it. Every
 * editable control carries the DOM id `issueTargets.ts` names for it.
 *
 * Two things are deliberately NOT asked for here:
 *   - a data source beside every number. Provenance still matters and is still
 *     stored, but it is edited in one place — the Source tab — instead of
 *     doubling the width of every field. A value still on `Assumed` says so.
 *   - an architecture template. The heat path already picks it (`heatPathPatch`).
 */

import { useEffect, useState } from 'react';
import { CircleDashed, Info, Ruler, Share2, Thermometer } from 'lucide-react';

import { Button } from '@/ui/primitives';
import type { Component } from '@/domain/component';
import { useProjectStore } from '@/data/projectStore';
import { COMPLETENESS_ITEMS, COMPLETENESS_ITEMS_ZH } from '@/domain/componentReadiness';
import { confirmAction, issueTarget, type InspectorTab } from './issueTargets';
import {
  deriveInspector,
  type InspectorTabProps,
  type PatchComponent,
} from './componentInspectorModel';
import { ArchitectureTab, OverviewTab, SourceTab } from './ComponentInspectorTabs';
import { ThermalSpecTab } from './ComponentInspectorThermalTab';
import { GeometryTab } from './ComponentInspectorGeometryTab';

type Tab = InspectorTab;

const TABS: Array<{ id: Tab; label: string; icon: typeof Info }> = [
  { id: 'overview', label: '概要', icon: Info },
  { id: 'thermal', label: '熱規格', icon: Thermometer },
  { id: 'geometry', label: '幾何', icon: Ruler },
  { id: 'architecture', label: '建模偏好', icon: Share2 },
  { id: 'source', label: '來源', icon: CircleDashed },
];

/** A request to put the caret in one field; `nonce` lets the same field repeat. */
export interface FocusRequest {
  fieldId: string;
  nonce: number;
}

export interface InspectorProps {
  component: Component | null;
  readOnly: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Set by an issue link elsewhere on the screen. */
  focus?: FocusRequest | null;
  /** Opens a tab AND puts the caret in one of its fields. */
  onGoToField: (tab: Tab, fieldId: string) => void;
  onPatch: PatchComponent;
  onSaveToLibrary: (component: Component) => void;
}

/**
 * Puts the caret in the field an issue link named, and rings it briefly so the
 * eye lands in the same place the focus did.
 */
function useFocusField(focus: FocusRequest | null | undefined, tab: Tab) {
  useEffect(() => {
    if (!focus) return;
    // One frame, so the tab this field lives on has rendered first.
    const timer = window.setTimeout(() => {
      const element = document.getElementById(focus.fieldId);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (element as HTMLElement).focus({ preventScroll: true });
      element.classList.add('ring-2', 'ring-accent-500');
      window.setTimeout(() => element.classList.remove('ring-2', 'ring-accent-500'), 1600);
    }, 0);
    return () => window.clearTimeout(timer);
    // `tab` is a dependency because the focus request switches it first.
  }, [focus, tab]);
}

export function ComponentInspector({
  component,
  readOnly,
  tab,
  onTabChange,
  focus,
  onGoToField,
  onPatch,
  onSaveToLibrary,
}: InspectorProps) {
  const projectMaterials = useProjectStore((s) => s.draft?.materials);
  const projectContext = useProjectStore((s) => s.draft?.project_context);
  const [librarySavedAt, setLibrarySavedAt] = useState(0);
  useFocusField(focus, tab);

  // Keep the acknowledgement beside the action that caused it. The global
  // toast remains useful, but can be missed while the floating panel is open.
  useEffect(() => {
    if (librarySavedAt === 0) return;
    const timer = window.setTimeout(() => setLibrarySavedAt(0), 3000);
    return () => window.clearTimeout(timer);
  }, [librarySavedAt]);

  useEffect(() => setLibrarySavedAt(0), [component?.id]);

  if (!component) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-[13px] text-ink-500">請在表格中選擇一個元件。</p>
      </div>
    );
  }

  const derived = deriveInspector(component, onPatch, projectMaterials, projectContext);
  const { issues, completeness, score, surfaceReferenced } = derived;
  const tabProps: InspectorTabProps = { component, readOnly, onPatch, derived };
  // A stale 'external' (the hidden FloTHERM tab) falls back to the first tab.
  const shown: Tab = TABS.some((item) => item.id === tab) ? tab : 'overview';
  const missing = COMPLETENESS_ITEMS.filter((item) => !completeness[item]);

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-3.5 py-2.5">
          {/* The floating panel's own title bar carries the name and badge. */}
          <nav className="flex flex-wrap gap-1" aria-label="元件檢視分頁">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = shown === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-accent-600 text-white'
                      : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
                  }`}
>
                  <Icon size={12} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="flex flex-col gap-3.5 p-3.5">
          {shown === 'overview' && <OverviewTab {...tabProps} />}
          {shown === 'thermal' && <ThermalSpecTab {...tabProps} />}
          {shown === 'geometry' && <GeometryTab {...tabProps} />}
          {shown === 'architecture' && <ArchitectureTab {...tabProps} />}
          {shown === 'source' && (
            <SourceTab
              {...tabProps}
              librarySavedAt={librarySavedAt}
              onLibrarySaved={setLibrarySavedAt}
              onSaveToLibrary={onSaveToLibrary}
            />
          )}
        </div>
      </section>

      {(missing.length > 0 || issues.length > 0) && (
        <section className="rounded-lg border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <h3 className="text-[13px] font-bold text-ink-700">待處理</h3>
            <span className="tabular text-[12px] text-ink-500">
              完整度 {score.done} / {score.total}
            </span>
          </header>
          {/* The checklist (04 §23), reduced to what is still missing. */}
          {missing.length > 0 && (
            <p className="border-b border-line px-3.5 py-2 text-[12px] text-ink-500">
              尚缺：
              {missing
                .map((item) =>
                  item === 'Rjc' && surfaceReferenced ? null : COMPLETENESS_ITEMS_ZH[item],
                )
                .filter(Boolean)
                .join('、')}
            </p>
          )}
          {issues.length > 0 && (
            <ul className="flex flex-col gap-1.5 p-3.5">
              {issues.map((issue, index) => {
                const target = issueTarget(issue.field);
                const confirm = target?.confirm ? confirmAction(component, target.confirm) : null;
                return (
                  <li key={`${issue.field}-${index}`} className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className={issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'}
                    >
                      {issue.severity === 'error' ? '✕' : '⚠'}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* Every issue is a link to the control that fixes it. */}
                      <button
                        type="button"
                        disabled={!target}
                        onClick={() => target && onGoToField(target.tab, target.fieldId)}
                        className={`text-left text-[12px] ${
                          issue.severity === 'error' ? 'text-danger-600' : 'text-warn-600'
                        } ${target ? 'hover:underline' : 'cursor-default'}`}
                      >
                        {issue.message_zh}
                      </button>
                      {confirm && !readOnly && (
                        <Button
                          className="mt-1 h-6"
                          onClick={() => onPatch(component.id, confirm.patch, confirm.fields)}
                        >
                          {confirm.labelZh}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
