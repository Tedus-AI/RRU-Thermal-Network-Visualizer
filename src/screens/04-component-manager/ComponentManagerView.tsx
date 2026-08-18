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
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useComponentLibraryStore } from '@/data/componentLibraryStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';

import { createComponent, type Component } from '@/domain/component';
import { completenessOf, completenessScore, statusOf, summarizeReadiness, validateComponent } from '@/domain/componentReadiness';

import { ComponentReadinessCards } from './ComponentReadinessCards';
import { ComponentTable } from './ComponentTable';
import { ComponentInspector } from './ComponentInspector';
import {
  CategoryTabs,
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
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
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
    useComponentLibraryStore.getState().load();
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
      description="Review and complete the thermal specification of every component. No thermal nodes or edges are created in this screen."
      descriptionZh="檢視並補齊各元件的熱規格。本畫面不建立任何熱網路節點 (Node) 或邊 (Edge)。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          {requiresReview && <Badge tone="warn">Network review required / 需重新檢視網路</Badge>}
        </div>
      }
      rightPanel={
        <ComponentInspector
          component={selected}
          readOnly={readOnly}
          onPatch={patchComponent}
          onSaveToLibrary={(component) => {
            useComponentLibraryStore.getState().saveComponent(component);
            toast.success(`"${component.name}" saved to the component library / 已存入元件庫`);
          }}
        />
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
            <Button
              icon={<Save size={15} />}
              disabled={readOnly || !dirty}
              onClick={handleSave}
            >
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
          <ComponentReadinessCards
            summary={summary}
            statusFilter={filters.status}
            onStatusFilter={(status) => setFilters({ ...filters, status })}
          />

          <CategoryTabs components={components} active={tab} onChange={setTab} />

          <ComponentToolbar
            filters={filters}
            onFilters={setFilters}
            sources={sources}
            selectedCount={selected ? 1 : 0}
            readOnly={readOnly}
            onAdd={() => setShowAdd(true)}
            onDuplicate={() => {
              if (!selected) return;
              const copy = useComponentStore.getState().duplicateComponent(selected.id);
              if (copy) {
                setSelectedId(copy.id);
                toast.success(`Duplicated as "${copy.name}" / 已複製`);
              }
            }}
            onDelete={() => setShowDelete(true)}
            onBulkEdit={() => setShowBulk(true)}
          />

          <ComponentTable
            components={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPatch={patchComponent}
            readOnly={readOnly}
          />

          <p className="text-[12px] text-ink-400">
            Showing {visible.length} of {components.length} components / 顯示 {visible.length} 筆，共{' '}
            {components.length} 筆
          </p>
        </>
      )}

      {showAdd && (
        <AddComponentModal
          existingNames={components.map((component) => component.name)}
          onClose={() => setShowAdd(false)}
          onAdd={(newDraft: NewComponentDraft) => {
            const id = `CMP_${newDraft.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
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
                  limit_C:
                    newDraft.limit_C == null
                      ? null
                      : { value: newDraft.limit_C, source: 'Manual', updated_at: new Date().toISOString() },
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

      {showDelete && selected && (
        <Modal
          title="Delete Component? / 刪除元件？"
          description={`"${selected.name}" will be removed from this project. Any thermal network mapping that referenced it becomes orphaned and the network will need review — this screen never rewrites topology.`}
          onClose={() => setShowDelete(false)}
          footer={
            <>
              <Button onClick={() => setShowDelete(false)}>Cancel / 取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  useComponentStore.getState().deleteComponent(selected.id);
                  setSelectedId(null);
                  setShowDelete(false);
                  toast.warning(`"${selected.name}" deleted / 已刪除`);
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
                    {validateComponent(component)
                      .filter((issue) => issue.severity === 'warning')
                      .length}{' '}
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
