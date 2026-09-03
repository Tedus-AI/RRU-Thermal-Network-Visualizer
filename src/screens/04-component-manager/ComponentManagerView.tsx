/**
 * Screen 04 — Component Manager.
 * Specification: 04_Component_Manager.md.
 *
 * Review / Complete / Normalize / Manage / Prepare. It creates NO thermal nodes
 * or edges and runs no solver (04 §1, §40). Screen 03 is deferred, so FloTHERM
 * hooks are reserved but nothing parses a FloTHERM file (04 §0, §28, §33).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Boxes, CheckCheck, Save, XCircle } from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useShellActions } from '@/app/shellActions';
import { Badge, Button, Modal, Skeleton } from '@/ui/primitives';
import { FloatingPanel } from '@/ui/FloatingPanel';
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

import { createComponent, isHeatSource, type Component } from '@/domain/component';
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
import { ComponentLibraryManager } from './ComponentLibraryManager';
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLibraryManager, setShowLibraryManager] = useState(false);
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
    toast.success('Component changes saved / 元件變更已儲存');
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
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load component data.</h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入元件資料。</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => projectId && useComponentStore.getState().loadFor(projectId)}
            >
              Retry / 重試
            </Button>
            <Button onClick={() => navigate('/')}>Return to Project Info</Button>
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
      <p className="text-[14px] font-semibold text-ink-700">No components in this project.</p>
      <p className="mt-1 text-[13px] text-ink-400">此專案尚未有任何元件。</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button
          variant="primary"
          onClick={() => navigate(projectPath(projectId, 'import-components'))}
        >
          Import Components / 匯入元件
        </Button>
        <Button disabled={readOnly} onClick={() => setShowAdd(true)}>
          Add Component / 新增元件
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
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          {/* A warning you cannot act on is just noise, so it goes where it is
              resolved: Screen 05 is the only place the network is reviewed. */}
          {requiresReview && (
            <button
              type="button"
              onClick={goToScreen05}
              className="flex items-center gap-1 rounded-full border border-warn-500/40 bg-warn-100/60 px-2.5 py-0.5 text-[11px] font-semibold text-warn-600 hover:border-warn-500"
            >
              Network review required / 需重新檢視網路
              <ArrowRight size={12} aria-hidden />
            </button>
          )}
        </div>
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            onClick={() => navigate(projectPath(projectId, 'import-components'))}
          >
            Back / 返回
          </Button>
          <Button
            icon={<CheckCheck size={15} />}
            onClick={() => {
              const errors = components.filter((c) => statusOf(c) === 'ERROR').length;
              const warnings = components.filter((c) => statusOf(c) === 'WARNING').length;
              if (errors > 0) toast.error(`${errors} components have blocking errors / 有錯誤`);
              else if (warnings > 0) toast.warning(`${warnings} components have warnings / 有警告`);
              else toast.success('All components are ready / 所有元件皆已就緒');
            }}
          >
            Validate All / 全部驗證
          </Button>

          {blockingErrors > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              {blockingErrors} component{blockingErrors > 1 ? 's' : ''} with errors block Continue /
              有錯誤無法繼續
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <Button icon={<Save size={15} />} disabled={readOnly || !dirty} onClick={handleSave}>
              Save Changes / 儲存
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={blockingErrors > 0}
              onClick={handleSaveAndContinue}
            >
              Save &amp; Continue / 儲存並繼續
            </Button>
          </div>
        </div>
      }
    >
      {emptyState || (
        <>
          {/* One status row: readiness left, category filters right. They share a
              card shape so the two halves read as one band on a wide screen. */}
          <div className="flex flex-col gap-2.5 2xl:flex-row 2xl:items-start 2xl:gap-3">
            <ComponentReadinessCards
              summary={summary}
              statusFilter={filters.status}
              onStatusFilter={(status) => setFilters({ ...filters, status })}
            />
            <div className="hidden w-px self-stretch bg-line 2xl:block" aria-hidden />
            <div className="2xl:ml-auto">
              <CategoryTabs components={components} active={tab} onChange={setTab} />
            </div>
          </div>

          <IssueList
            components={components}
            validate={validateComponent}
            readOnly={readOnly}
            onGoToIssue={goToIssue}
            onPatch={patchComponent}
          />

          <ComponentToolbar filters={filters} onFilters={setFilters} sources={sources} />

          <ComponentTable
            components={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPatch={patchComponent}
            onDuplicate={(component) => {
              const copy = useComponentStore.getState().duplicateComponent(component.id);
              if (copy) {
                setSelectedId(copy.id);
                toast.success(`Duplicated as "${copy.name}" / 已複製`);
              }
            }}
            onDelete={setDeleteTarget}
            readOnly={readOnly}
          />

          {/* Actions live under the rows they act on, bottom left. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ComponentActions
              selectedName={selected?.name ?? null}
              visibleCount={visible.length}
              readOnly={readOnly}
              onAdd={() => setShowAdd(true)}
              onAddFromLibrary={() => setShowLibrary(true)}
              onManageLibrary={() => setShowLibraryManager(true)}
              onSaveAllToLibrary={() => {
                const overwrites = libraryOverwrites(
                  useComponentLibraryStore.getState().entries,
                  visible,
                  libraryProject,
                );
                // Nothing to warn about means nothing to ask about.
                if (overwrites.length === 0) {
                  const { saved } = useComponentLibraryStore.getState().saveAll(visible, libraryProject);
                  toast.success(`Saved ${saved} to the library / 已存入元件庫 ${saved} 筆`);
                  return;
                }
                setLibraryOverwriteConfirm(overwrites);
              }}
              onBulkEdit={() => setShowBulk(true)}
            />
            <p className="text-[12px] text-ink-400">
              Showing {visible.length} of {components.length} components / 顯示 {visible.length}{' '}
              筆，共 {components.length} 筆
            </p>
          </div>
        </>
      )}

      {/* The inspector floats so the table keeps the full window width. It is
          non-modal on purpose: clicking another row retargets it in place. */}
      {selected && (
        <FloatingPanel
          storageKey="tnv.04.inspector"
          title={selected.name}
          subtitle={`${selected.id} · ${selected.category}`}
          badge={
            selected.enabled ? (
              <Badge tone={isHeatSource(selected) ? 'danger' : 'neutral'}>
                {isHeatSource(selected) ? 'Heat Source / 熱源' : 'Passive / 被動'}
              </Badge>
            ) : (
              <Badge tone="neutral">Disabled / 停用</Badge>
            )
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
            onSaveToLibrary={(component) => {
              useComponentLibraryStore.getState().saveComponent(component, libraryProject);
              toast.success(`"${component.name}" saved to the component library / 已存入元件庫`);
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
            toast.success(`"${component.name}" added / 已新增`);
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
            toast.success(`"${created.name}" added from the library / 已從元件庫新增`);
          }}
        />
      )}

      {showLibraryManager && (
        <ComponentLibraryManager
          existingNames={components.map((component) => component.name)}
          onClose={() => setShowLibraryManager(false)}
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
            toast.success(`Updated ${ids.length} components / 已更新 ${ids.length} 筆`);
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
          title="Overwrite these library entries? / 覆蓋這些元件庫項目？"
          description={`${libraryOverwriteConfirm.length} of the ${visible.length} components shown are already in the library. Saving replaces the stored thermal spec with this project's version. / 目前顯示的 ${visible.length} 筆元件中，有 ${libraryOverwriteConfirm.length} 筆已存在於元件庫；存入會以本專案的版本取代已儲存的熱學規格。`}
          onClose={() => setLibraryOverwriteConfirm(null)}
          footer={
            <>
              <Button onClick={() => setLibraryOverwriteConfirm(null)}>Cancel / 取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { saved, overwritten } = useComponentLibraryStore
                    .getState()
                    .saveAll(visible, libraryProject);
                  setLibraryOverwriteConfirm(null);
                  toast.success(
                    `Saved ${saved} to the library, ${overwritten.length} overwritten / 已存入元件庫 ${saved} 筆，覆蓋 ${overwritten.length} 筆`,
                  );
                }}
              >
                Overwrite / 覆蓋
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
          title="Delete Component? / 刪除元件？"
          description={`"${deleteTarget.name}" will be removed from this project. Any thermal network mapping that referenced it becomes orphaned and the network will need review — this screen never rewrites topology. / 「${deleteTarget.name}」將從本專案移除；引用它的熱網路對應會成為孤兒並需要重新檢視，本畫面不會改寫拓樸。`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button onClick={() => setDeleteTarget(null)}>Cancel / 取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { id, name } = deleteTarget;
                  useComponentStore.getState().deleteComponent(id);
                  // Only clear the inspector if it was showing the part that went.
                  setSelectedId((current) => (current === id ? null : current));
                  setDeleteTarget(null);
                  toast.warning(`"${name}" deleted / 已刪除`);
                }}
              >
                Delete / 刪除
              </Button>
            </>
          }
        />
      )}

      {warningConfirm != null && (
        <Modal
          title="Continue with warnings? / 仍有警告，要繼續嗎？"
          description={`${warningConfirm} components still have thermal warnings. They can be completed later, but the thermal network will be built with incomplete data.`}
          onClose={() => setWarningConfirm(null)}
          footer={
            <>
              <Button onClick={() => setWarningConfirm(null)}>Stay / 留在此頁</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setWarningConfirm(null);
                  goToScreen05();
                }}
              >
                Continue anyway / 仍要繼續
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
                    warnings
                  </span>
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </ScreenWorkspace>
  );
}
