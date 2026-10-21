/**
 * Component inspector — 04 §13–§21, §27, §33.
 *
 * Two halves. The left is the form, in four tabs: 概要, 散熱路徑, 建模偏好,
 * 來源. The right is the selected part's heat path drawn as a stack, with its
 * resistance chain under it (`HeatPathPane`). External Mapping (FloTHERM
 * aliases) is not offered while Screen 03 is deferred. Nothing here creates a
 * node or an edge (04 §19, §40).
 *
 * 散熱路徑 replaced the 熱規格 and 幾何 tabs: one layer's numbers used to live
 * on two tabs, so the form is now one card per layer, in heat-flow order
 * (`ComponentInspectorPathTab.tsx`). The two halves talk through one piece of
 * state: the layer whose field has the caret, or whose card or drawing the
 * pointer is over, lights up on both sides, and clicking a layer in the
 * drawing opens the card that sets it.
 *
 * The nine-item completeness checklist used to sit under every tab. The panel's
 * title bar now carries the score, and this panel lists only what is missing
 * and what to fix, each a link. What the tabs read is derived once per render
 * by `deriveInspector` (`componentInspectorModel.ts`); what the drawing reads,
 * by `heatPathView` (`heatPathModel.ts`).
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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleDashed, Info, Layers, Share2 } from 'lucide-react';

import { Button } from '@/ui/primitives';
import type { Component } from '@/domain/component';
import { useProjectStore } from '@/data/projectStore';
import { COMPLETENESS_ITEMS, COMPLETENESS_ITEMS_ZH } from '@/domain/componentReadiness';
import { defaultMaterials } from '@/domain/materials';
import { confirmAction, issueTarget, type InspectorTab } from './issueTargets';
import {
  deriveInspector,
  type InspectorTabProps,
  type PatchComponent,
} from './componentInspectorModel';
import { ArchitectureTab, OverviewTab, SourceTab } from './ComponentInspectorTabs';
import { PathTab } from './ComponentInspectorPathTab';
import { HeatPathPane, type PathFocus } from './HeatPathPane';
import type { DimKey } from './heatPathDrawing';
import {
  CARD_LAYER,
  LAYER_CARD,
  heatPathView,
  type HeatLayer,
  type PathCardId,
} from './heatPathModel';
import './heatPath.css';

type Tab = InspectorTab;

const TABS: Array<{ id: Tab; label: string; icon: typeof Info }> = [
  { id: 'overview', label: '概要', icon: Info },
  { id: 'thermal', label: '散熱路徑', icon: Layers },
  { id: 'architecture', label: '建模偏好', icon: Share2 },
  { id: 'source', label: '來源', icon: CircleDashed },
];

const NO_FOCUS: PathFocus = { layer: null, dim: null };

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
  /** Show the heat path drawing beside the form. */
  showDiagram?: boolean;
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

/** The layer and dimension a form element sets, read off its nearest field. */
function layerAt(target: EventTarget | null): PathFocus {
  const element = target instanceof Element ? target : null;
  const field = element?.closest('[data-layer]');
  const card = element?.closest('[data-card]');
  const layer = (field?.getAttribute('data-layer') ??
    (card ? CARD_LAYER[card.getAttribute('data-card') as PathCardId] : null)) as HeatLayer | null;
  return { layer: layer ?? null, dim: (field?.getAttribute('data-dim') as DimKey | null) ?? null };
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
  showDiagram = true,
}: InspectorProps) {
  const projectMaterials = useProjectStore((s) => s.draft?.materials);
  const projectContext = useProjectStore((s) => s.draft?.project_context);
  const [librarySavedAt, setLibrarySavedAt] = useState(0);
  const [pathFocus, setPathFocus] = useState<PathFocus>(NO_FOCUS);
  const [hover, setHover] = useState<HeatLayer | null>(null);
  /** A card a click on the drawing asked for, opened once its tab has rendered. */
  const [pendingCard, setPendingCard] = useState<{ card: PathCardId; layer: HeatLayer } | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  useFocusField(focus, tab);

  // Keep the acknowledgement beside the action that caused it. The global
  // toast remains useful, but can be missed while the floating panel is open.
  useEffect(() => {
    if (librarySavedAt === 0) return;
    const timer = window.setTimeout(() => setLibrarySavedAt(0), 3000);
    return () => window.clearTimeout(timer);
  }, [librarySavedAt]);

  useEffect(() => {
    setLibrarySavedAt(0);
    setPathFocus(NO_FOCUS);
    setHover(null);
  }, [component?.id]);

  // Scroll the asked-for card into the form pane, flash it, and put the caret
  // in its first field for that layer.
  useLayoutEffect(() => {
    if (!pendingCard) return;
    setPendingCard(null);
    const pane = formRef.current;
    const card = pane?.querySelector<HTMLElement>(`#hp-card-${pendingCard.card}`);
    if (!pane || !card) {
      setPathFocus({ layer: pendingCard.layer, dim: null });
      return;
    }
    const scrolls = pane.scrollHeight > pane.clientHeight + 4 && getComputedStyle(pane).overflowY !== 'visible';
    if (scrolls) {
      pane.scrollTop += card.getBoundingClientRect().top - pane.getBoundingClientRect().top - 52;
    } else {
      card.scrollIntoView({ block: 'center' });
    }
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
    const layer = pendingCard.layer;
    // A value box first, then a choice: the caret should land where a number is typed.
    const scope = `[data-layer="${layer}"]`;
    const first =
      card.querySelector<HTMLElement>(
        `${scope} input:not([type=radio]):not([type=checkbox]):not([disabled]):not([readonly]), ${scope} select:not([disabled])`,
      ) ??
      card.querySelector<HTMLElement>(
        `${scope} input:checked:not([disabled]), ${scope}[aria-checked="true"]:not([disabled]), ${scope} [aria-checked="true"]:not([disabled])`,
      ) ??
      card.querySelector<HTMLElement>(
        'input:not([type=radio]):not([type=checkbox]):not([disabled]):not([readonly]), select:not([disabled])',
      );
    if (first) first.focus({ preventScroll: true });
    else setPathFocus({ layer, dim: null });
  }, [pendingCard]);

  if (!component) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-[13px] text-ink-500">請在表格中選擇一個元件。</p>
      </div>
    );
  }

  const derived = deriveInspector(component, onPatch, projectMaterials, projectContext);
  const view = heatPathView(component, projectMaterials ?? defaultMaterials());
  const { issues, completeness, score, surfaceReferenced } = derived;
  const tabProps: InspectorTabProps = { component, readOnly, onPatch, derived };
  // A stale 'external' (the hidden FloTHERM tab) falls back to the first tab.
  const shown: Tab = TABS.some((item) => item.id === tab) ? tab : 'overview';
  const missing = COMPLETENESS_ITEMS.filter((item) => !completeness[item]);
  // A card lights for the drawing only while nothing in the form has the caret.
  const hotCard = !pathFocus.layer && hover ? LAYER_CARD[hover] : null;

  const pickLayer = (layer: HeatLayer) => {
    if (shown !== 'thermal') onTabChange('thermal');
    setPendingCard({ card: LAYER_CARD[layer], layer });
  };

  return (
    <div className="hp-root @container h-full">
      <div className={`flex flex-col ${showDiagram ? '@4xl:h-full @4xl:flex-row' : ''}`}>
        <div
          ref={formRef}
          className={`flex min-w-0 flex-col ${
            showDiagram ? '@4xl:min-h-0 @4xl:flex-1 @4xl:overflow-y-auto @4xl:border-r @4xl:border-line' : ''
          }`}
          onFocus={(event) => setPathFocus(layerAt(event.target))}
          onBlur={() => {
            // Deferred: focus moving between two fields passes through body.
            window.setTimeout(() => {
              if (!formRef.current?.contains(document.activeElement)) setPathFocus(NO_FOCUS);
            }, 0);
          }}
          onMouseOver={(event) => {
            const card = (event.target as Element).closest('[data-card]');
            const next = card ? CARD_LAYER[card.getAttribute('data-card') as PathCardId] : null;
            if (next !== hover) setHover(next);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <nav
            className="sticky top-0 z-[2] flex flex-wrap gap-1 border-b border-line bg-surface px-3.5 py-2"
            aria-label="元件檢視分頁"
          >
            {/* The floating panel's own title bar carries the name and badge. */}
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = shown === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium transition-colors ${
                    active ? 'bg-accent-600 text-white' : 'text-ink-500 hover:bg-surface-muted hover:text-ink-900'
                  }`}
                >
                  <Icon size={12} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-col gap-3.5 p-3.5">
            {shown === 'overview' && <OverviewTab {...tabProps} />}
            {shown === 'thermal' && <PathTab {...tabProps} view={view} hotCard={hotCard} />}
            {shown === 'architecture' && <ArchitectureTab {...tabProps} />}
            {shown === 'source' && (
              <SourceTab
                {...tabProps}
                librarySavedAt={librarySavedAt}
                onLibrarySaved={setLibrarySavedAt}
                onSaveToLibrary={onSaveToLibrary}
              />
            )}

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
                      .map((item) => (item === 'Rjc' && surfaceReferenced ? null : COMPLETENESS_ITEMS_ZH[item]))
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
        </div>

        {showDiagram && (
          <div className="order-first flex min-w-0 flex-col border-b border-line @4xl:order-none @4xl:min-h-0 @4xl:flex-1 @4xl:border-b-0">
            <HeatPathPane
              view={view}
              focus={pathFocus}
              hover={hover}
              onHover={setHover}
              onPickLayer={pickLayer}
            />
          </div>
        )}
      </div>
    </div>
  );
}
