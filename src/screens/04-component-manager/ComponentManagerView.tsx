/**
 * Screen 04 — Component Manager.
 * Specification: 04_Component_Manager.md.
 *
 * Review / Complete / Normalize / Manage / Prepare. It creates NO thermal nodes
 * or edges and runs no solver (04 §1, §40). Screen 03 is deferred, so FloTHERM
 * hooks are reserved but nothing parses a FloTHERM file (04 §0, §28, §33).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Boxes, PanelRightClose, PanelRightOpen, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { FOCUS_PARAM, consumeFocus, revealField } from '@/app/focusLink';

/** Long enough for the inspector to render the box and the flash to finish. */
const FOCUS_REVEAL_WINDOW_MS = 6000;
/** The inspector with its heat path drawing beside the form, and without. */
const INSPECTOR_WIDE = 1120;
const INSPECTOR_NARROW = 560;
import { useShellActions } from '@/app/shellActions';
import { Badge, Button, Modal, Skeleton } from '@/ui/primitives';
import { FloatingPanel } from '@/ui/FloatingPanel';
import { useRememberedFlag } from '@/ui/rememberedFlag';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import {
  libraryOverwrites,
  UNASSIGNED_LIBRARY_PROJECT,
  UNASSIGNED_LIBRARY_PROJECT_LABEL,
  useComponentLibraryStore,
} from '@/data/componentLibraryStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';

import {
  THERMAL_PROFILE_STATUS_ZH,
  createComponent,
  isHeatSource,
  type Component,
} from '@/domain/component';
import { fromLibraryEntry } from '@/data/componentLibraryStore';
import {
  completenessOf,
  completenessScore,
  statusOf,
  summarizeReadiness,
  validateComponent,
} from '@/domain/componentReadiness';

import { ComponentReadinessCards } from './ComponentReadinessCards';
import { ComponentTable } from './ComponentTable';
import { ComponentInspector, type FocusRequest } from './ComponentInspector';
import { AddFromLibraryModal } from './AddFromLibraryModal';
import { IssueList } from './IssueList';
import type { InspectorTab } from './issueTargets';
import {
  CategoryTabs,
  ComponentActions,
  ComponentToolbar,
  DEFAULT_FILTERS,
  filterComponents,
  type CategoryTab,
  type Filters,
} from './ComponentToolbar';
import {
  AddComponentModal,
  BulkEditModal,
  bulkFieldsFor,
  bulkPatchFor,
  draftPower,
  type BulkEditValues,
  type NewComponentDraft,
} from './modals';

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export function ComponentManagerView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const components = useComponentStore((s) => s.components);
  const dirty = useComponentStore((s) => s.dirty);
  const patchComponent = useComponentStore((s) => s.patchComponent);
  const requiresReview = useNetworkStore((s) => s.requiresReview);

  const [tab, setTab] = useState<CategoryTab>('All');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Arrived from Screen 08 with a component whose package Rth to open. */
  const [focusParams] = useSearchParams();
  const [pendingField, setPendingField] = useState<string | null>(null);
  useEffect(() => {
    if (components.length === 0) return;
    const id = consumeFocus(focusParams, FOCUS_PARAM.component, navigate);
    const field = consumeFocus(focusParams, FOCUS_PARAM.field, navigate);
    if (!id || !components.some((entry) => entry.id === id)) return;
    setSelectedId(id);
    setPendingField(field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, focusParams]);

  /**
   * The reveal is held in state, not driven straight off the query string.
   *
   * `consumeFocus` navigates to strip the parameter, which hands this effect a
   * new `focusParams` and re-runs it — and the cleanup of the previous run
   * cancels `revealField` while it is still waiting for the inspector to
   * render. Copying the request out first is what keeps the search alive.
   */
  useEffect(() => {
    if (!pendingField) return;
    const cancel = revealField(pendingField);
    const done = setTimeout(() => setPendingField(null), FOCUS_REVEAL_WINDOW_MS);
    return () => {
      cancel();
      clearTimeout(done);
    };
  }, [pendingField]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  /** The heat path drawing beside the inspector form; open unless folded away. */
  const [inspectorDiagram, setInspectorDiagram] = useRememberedFlag('04.inspector.diagram', true);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  // Subscribed, not read once: the manager can rename or delete entries, and the
  // picker beside it must not go on offering a part that is no longer there.
  const libraryEntries = useComponentLibraryStore((s) => s.entries);
  /**
   * Whose answer a catalogue save records. The catalogue holds one row per part
   * PER PROJECT, so two projects can disagree about the same part's wattage or
   * thermal spec without one silently replacing the other.
   */
  const libraryProject = useMemo(
    () => ({
      id: draft?.project_id ?? UNASSIGNED_LIBRARY_PROJECT,
      name: draft?.project_name || draft?.project_id || UNASSIGNED_LIBRARY_PROJECT_LABEL,
    }),
    [draft?.project_id, draft?.project_name],
  );
  const [showBulk, setShowBulk] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Component | null>(null);
  const [libraryOverwriteConfirm, setLibraryOverwriteConfirm] = useState<string[] | null>(null);
  const [warningConfirm, setWarningConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const projectStore = useProjectStore.getState();
    projectStore.refreshProjects();
    if (projectStore.draft?.project_id !== projectId) {
      projectStore.openProject(projectId);
      useScenarioStore.getState().loadFor(projectId);
      useSolverStore.getState().reset();
    }
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
    // Merges what this browser has with the folder's library file: the build
    // stamp clears localStorage on every deploy, so the file is the durable half.
    void useComponentLibraryStore.getState().loadWithFolder();
  }, [projectId]);

  const handleSave = () => {
    if (!projectId || readOnly) return;
    useComponentStore.getState().save(projectId);
    toast.success('元件變更已儲存');
  };

  // Expose Save to the shared header.
  const setSaveHandler = useShellActions((s) => s.setSaveHandler);
  useEffect(() => {
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, readOnly]);

  const summary = useMemo(() => summarizeReadiness(components), [components]);
  const isComplete = useMemo(
    () => (component: Component) => {
      const score = completenessScore(completenessOf(component));
      return score.done === score.total;
    },
    [],
  );

  const visible = useMemo(
    () => filterComponents(components, tab, filters, isComplete),
    [components, tab, filters, isComplete],
  );

  const sources = useMemo(
    () => [...new Set(components.map((c) => c.provenance.source_type))],
    [components],
  );

  const selected = components.find((component) => component.id === selectedId) ?? null;

  /**
   * The one path every issue link takes: select the component, open the tab that
   * owns the field, and ask the inspector to focus it. The nonce makes clicking
   * the same issue twice re-focus rather than do nothing.
   */
  const goToIssue = (componentId: string, tab: InspectorTab, fieldId: string) => {
    setSelectedId(componentId);
    setInspectorTab(tab);
    setFocus({ fieldId, nonce: Date.now() });
  };

  const blockingErrors = useMemo(
    () => components.filter((component) => statusOf(component) === 'ERROR').length,
    [components],
  );
  const warningCount = useMemo(
    () => components.filter((component) => statusOf(component) === 'WARNING').length,
    [components],
  );

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">無法載入元件資料</h1>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => projectId && useComponentStore.getState().loadFor(projectId)}
            >
              重試
            </Button>
            <Button onClick={() => navigate('/')}>回專案清單</Button>
          </div>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft) return <LoadingState />;

  const goToScreen05 = () => navigate(projectPath(projectId, 'thermal-path'));

  const handleSaveAndContinue = () => {
    if (blockingErrors > 0) return;
    if (dirty) handleSave();
    if (warningCount > 0) {
      setWarningConfirm(warningCount);
      return;
    }
    goToScreen05();
  };

  const emptyState = components.length === 0 && (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <Boxes size={26} className="mx-auto mb-3 text-ink-400" />
      <p className="text-[14px] font-semibold text-ink-700">此專案還沒有元件</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button
          variant="primary"
          onClick={() => navigate(projectPath(projectId, 'import-components'))}
        >
          到 02 匯入元件
        </Button>
        <Button disabled={readOnly} onClick={() => setShowAdd(true)}>
          新增空白元件
        </Button>
      </div>
    </div>
  );

  return (
    <ScreenWorkspace
      title="Component Manager"
      titleZh="元件管理"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">唯讀</Badge>}
          {/* A warning you cannot act on is just noise, so it goes where it is
              resolved: Screen 05 is the only place the network is reviewed. */}
          {requiresReview && (
            <button
              type="button"
              onClick={goToScreen05}
              title="04 改了會影響熱路徑的欄位（數量、TIM、熱路徑、幾何、啟用、新增或刪除元件）。到 05 按「依偏好產生」重建，或檢查後按「儲存並繼續」，這個提醒就會消失。"
              className="flex items-center gap-1 rounded-full border border-warn-500/40 bg-warn-100/60 px-2.5 py-0.5 text-[11px] font-semibold text-warn-600 hover:border-warn-500"
            >
              熱網路需要更新
              <ArrowRight size={12} aria-hidden />
            </button>
          )}
        </div>
      }
      actionBar={
        // Save is gone: components save themselves (autoPersist), so the button
        // sat disabled almost all the time. Back is the sidebar's, and Validate
        // All repeated the status chips at the top in a toast.
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          {blockingErrors > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              {blockingErrors} 個元件有錯誤，修正後才能繼續
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={blockingErrors > 0}
              onClick={handleSaveAndContinue}
            >
              繼續：05 熱路徑建立
            </Button>
          </div>
        </div>
      }
    >
      {emptyState || (
        <>
          <ComponentReadinessCards
            summary={summary}
            recordCount={components.length}
            statusFilter={filters.status}
            onStatusFilter={(status) => setFilters({ ...filters, status })}
          />

          <IssueList
            components={components}
            validate={validateComponent}
            readOnly={readOnly}
            onGoToIssue={goToIssue}
            onPatch={patchComponent}
          />

          <ComponentToolbar
            filters={filters}
            onFilters={setFilters}
            sources={sources}
            tab={tab}
            onReset={() => {
              setFilters(DEFAULT_FILTERS);
              setTab('All');
            }}
            actions={
              <ComponentActions
                visibleCount={visible.length}
                readOnly={readOnly}
                onAdd={() => setShowAdd(true)}
                onAddFromLibrary={() => setShowLibrary(true)}
                onSaveAllToLibrary={() => {
                  const overwrites = libraryOverwrites(
                    useComponentLibraryStore.getState().entries,
                    visible,
                    libraryProject,
                  );
                  // Nothing to warn about means nothing to ask about.
                  if (overwrites.length === 0) {
                    const { saved } = useComponentLibraryStore
                      .getState()
                      .saveAll(visible, libraryProject);
                    toast.success(`已存入元件庫 ${saved} 筆`);
                    return;
                  }
                  setLibraryOverwriteConfirm(overwrites);
                }}
                onBulkEdit={() => setShowBulk(true)}
              />
            }
          />

          {/* The tabs sit on the table they filter. */}
          <div className="flex shrink-0 flex-col">
            <CategoryTabs components={components} active={tab} onChange={setTab} />
            <ComponentTable
              components={visible}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPatch={patchComponent}
              onDuplicate={(component) => {
                const copy = useComponentStore.getState().duplicateComponent(component.id);
                if (copy) {
                  setSelectedId(copy.id);
                  toast.success(`已複製為「${copy.name}」`);
                }
              }}
              onDelete={setDeleteTarget}
              readOnly={readOnly}
            />
            {visible.length !== components.length && (
              <p className="mt-2 text-[12px] text-ink-400">
                顯示 {visible.length} 筆，共 {components.length} 筆
              </p>
            )}
          </div>
        </>
      )}

      {/* The inspector floats so the table keeps the full window width. It is
          non-modal on purpose: clicking another row retargets it in place. */}
      {selected && (
        <FloatingPanel
          // A new key: the old one remembers the single-column width, which
          // would open the two-pane inspector squeezed into one column.
          storageKey="tnv.04.inspector.v2"
          defaultWidth={inspectorDiagram ? INSPECTOR_WIDE : INSPECTOR_NARROW}
          requestedWidth={inspectorDiagram ? INSPECTOR_WIDE : INSPECTOR_NARROW}
          bodyClassName="p-0"
          actions={
            <button
              type="button"
              aria-pressed={inspectorDiagram}
              title={inspectorDiagram ? '收合右邊的散熱路徑圖，回到單欄' : '在右邊顯示散熱路徑圖'}
              onClick={() => setInspectorDiagram((open) => !open)}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[12px] text-ink-500 hover:bg-surface hover:text-ink-900"
            >
              {inspectorDiagram ? <PanelRightClose size={14} aria-hidden /> : <PanelRightOpen size={14} aria-hidden />}
              {inspectorDiagram ? '收合圖' : '顯示圖'}
            </button>
          }
          title={selected.name}
          // The internal id is not shown: nobody reads or types it. Whether
          // the part is in Screen 05's network yet used to be a table column.
          subtitle={`${selected.category}・${
            THERMAL_PROFILE_STATUS_ZH[selected.architecture_prep.thermal_profile_status] ??
            selected.architecture_prep.thermal_profile_status
          }`}
          badge={
            <span className="flex items-center gap-2">
              {(() => {
                const score = completenessScore(completenessOf(selected));
                return (
                  <span
                    className={`tabular text-[12px] font-semibold ${
                      score.done === score.total ? 'text-ok-600' : 'text-warn-600'
                    }`}
                    title="熱資料完整度（9 項）"
                  >
                    完整度 {score.done}/{score.total}
                  </span>
                );
              })()}
              {selected.enabled ? (
                <Badge tone={isHeatSource(selected) ? 'danger' : 'neutral'}>
                  {isHeatSource(selected) ? '熱源' : '被動'}
                </Badge>
              ) : (
                <Badge tone="neutral">停用</Badge>
              )}
            </span>
          }
          onClose={() => setSelectedId(null)}
        >
          <ComponentInspector
            component={selected}
            readOnly={readOnly}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            focus={focus}
            onGoToField={(nextTab, fieldId) => goToIssue(selected.id, nextTab, fieldId)}
            onPatch={patchComponent}
            showDiagram={inspectorDiagram}
            onSaveToLibrary={(component) => {
              useComponentLibraryStore.getState().saveComponent(component, libraryProject);
              toast.success(`已把「${component.name}」存入元件庫`);
            }}
          />
        </FloatingPanel>
      )}

      {showAdd && (
        <AddComponentModal
          existingNames={components.map((component) => component.name)}
          onClose={() => setShowAdd(false)}
          onAdd={(newDraft: NewComponentDraft) => {
            const id = `CMP_${newDraft.name
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, '_')}`;
            const component = useComponentStore.getState().addComponent({
              id,
              name: newDraft.name.trim(),
              category: newDraft.category,
              qty: newDraft.qty,
              power_W: newDraft.power_W,
              provenance: {
                source_type: 'Manual',
                source_project_id: projectId,
                source_project_name: draft.project_name,
                source_file: null,
                imported_at: new Date().toISOString(),
                last_modified_at: new Date().toISOString(),
              },
            } satisfies Parameters<typeof createComponent>[0]);

            // Carry the limit the user stated in the dialog.
            useComponentStore.getState().patchComponent(
              component.id,
              {
                power_W: draftPower(newDraft),
                thermal_spec: {
                  ...component.thermal_spec,
                  limit_type: newDraft.limit_type,
                  // The user picked it in the dialog, so it is not a guess.
                  limit_type_confirmed: true,
                  limit_C:
                    newDraft.limit_C == null
                      ? null
                      : {
                          value: newDraft.limit_C,
                          source: 'Manual',
                          updated_at: new Date().toISOString(),
                        },
                },
              },
              ['power_W', 'limit_type', 'limit_C'],
            );

            setSelectedId(component.id);
            setShowAdd(false);
            toast.success(`已新增「${component.name}」`);
          }}
        />
      )}

      {showLibrary && (
        <AddFromLibraryModal
          entries={libraryEntries}
          existingNames={components.map((component) => component.name)}
          onClose={() => setShowLibrary(false)}
          onAdd={(entry, qty) => {
            // A fresh id per use: the same catalogue part can appear twice in
            // one radio, and they are two components, not one shared record.
            const rehydrated = fromLibraryEntry(entry, {
              id: `CMP_${entry.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${Date.now()
                .toString(36)
                .toUpperCase()}`,
              qty,
            });
            const created = useComponentStore.getState().addComponent({
              id: rehydrated.id,
              name: rehydrated.name,
              category: rehydrated.category,
              qty,
              power_W: rehydrated.power_W.value,
              provenance: rehydrated.provenance,
            });
            // `addComponent` only takes the identity fields, so the spec the
            // library actually holds is written straight after.
            useComponentStore
              .getState()
              .patchComponent(
                created.id,
                {
                  power_W: rehydrated.power_W,
                  thermal_spec: rehydrated.thermal_spec,
                  architecture_prep: rehydrated.architecture_prep,
                },
                ['power_W', 'thermal_spec', 'architecture_prep'],
              );
            setSelectedId(created.id);
            setShowLibrary(false);
            toast.success(`已從元件庫加入「${created.name}」`);
          }}
        />
      )}

      {showBulk && (
        <BulkEditModal
          count={visible.length}
          onClose={() => setShowBulk(false)}
          onApply={(values: BulkEditValues) => {
            const ids = visible.map((component) => component.id);
            useComponentStore
              .getState()
              .bulkPatch(ids, bulkPatchFor(values), bulkFieldsFor(values));
            setShowBulk(false);
            toast.success(`已更新 ${ids.length} 筆`);
          }}
        />
      )}

      {/*
        An overwrite here replaces a whole thermal spec — Rjc, geometry, heat
        path, mount, TIM — with this project's version of the part, for every
        future project that pulls it from the catalogue. So the parts that would
        change are NAMED before anything is written, not counted after.
      */}
      {libraryOverwriteConfirm && (
        <Modal
          title="覆蓋這些元件庫項目？"
          description={`目前列出的 ${visible.length} 筆中，有 ${libraryOverwriteConfirm.length} 筆已在元件庫；存入會以本專案的版本取代元件庫裡的熱規格。`}
          onClose={() => setLibraryOverwriteConfirm(null)}
          footer={
            <>
              <Button onClick={() => setLibraryOverwriteConfirm(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { saved, overwritten } = useComponentLibraryStore
                    .getState()
                    .saveAll(visible, libraryProject);
                  setLibraryOverwriteConfirm(null);
                  toast.success(
                    `已存入元件庫 ${saved} 筆，其中覆蓋 ${overwritten.length} 筆`,
                  );
                }}
              >
                覆蓋
              </Button>
            </>
          }
        >
          <ul className="max-h-56 overflow-y-auto rounded-md border border-line">
            {libraryOverwriteConfirm.map((name) => (
              <li
                key={name}
                className="border-b border-line px-3 py-1.5 text-[12px] text-ink-700 last:border-b-0"
              >
                {name}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="刪除元件？"
          description={`「${deleteTarget.name}」會從本專案移除。熱網路中用到它的部分需要到 05 重新檢視；本頁不會改動熱網路。`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { id, name } = deleteTarget;
                  useComponentStore.getState().deleteComponent(id);
                  // Only clear the inspector if it was showing the part that went.
                  setSelectedId((current) => (current === id ? null : current));
                  setDeleteTarget(null);
                  toast.warning(`已刪除「${name}」`);
                }}
              >
                刪除
              </Button>
            </>
          }
        />
      )}

      {warningConfirm != null && (
        <Modal
          title="仍有警告，要繼續嗎？"
          description={`${warningConfirm} 個元件還有警告。之後可以再補，但熱網路會以不完整的資料建立。`}
          onClose={() => setWarningConfirm(null)}
          footer={
            <>
              <Button onClick={() => setWarningConfirm(null)}>留在此頁</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setWarningConfirm(null);
                  goToScreen05();
                }}
              >
                仍要繼續
              </Button>
            </>
          }
        >
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[12px]">
            {components
              .filter((component) => statusOf(component) === 'WARNING')
              .map((component) => (
                <li key={component.id} className="flex justify-between gap-3">
                  <span className="font-medium text-ink-900">{component.name}</span>
                  <span className="text-right text-ink-400">
                    {
                      validateComponent(component).filter((issue) => issue.severity === 'warning')
                        .length
                    }{' '}
                    項警告
                  </span>
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </ScreenWorkspace>
  );
}
