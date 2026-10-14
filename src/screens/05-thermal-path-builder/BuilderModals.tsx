/**
 * Screen 05 dialogs: generate preview, rebuild, quantity change, add node, and
 * continue-with-warnings.
 */

import { projectPath } from '@/app/navigation';
import { Button, Modal, Select, TextInput } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';

import { useNetworkStore } from '@/data/networkStore';

import type { Component } from '@/domain/component';
import { previewGeneration } from '@/thermal/graph/networkBuilder';
import { manualId } from '@/thermal/graph/idFactory';
import { NODE_TYPES, type NodeType, type ThermalNetwork } from '@/thermal/types';

import { GenerateNetworkPreview } from './GenerateNetworkPreview';
import type { ThermalPathBuilder } from './useThermalPathBuilder';

interface BuilderModalsProps {
  builder: ThermalPathBuilder;
  network: ThermalNetwork;
  projectId: string;
}

export function BuilderModals({ builder, network, projectId }: BuilderModalsProps) {
  const {
    addNodeDraft,
    applyTemplate,
    confirmEntireRebuild,
    enabledComponents,
    handleGenerate,
    manualObjectsFor,
    materials,
    navigate,
    prefs,
    qtyWarning,
    rebuildFor,
    setAddNodeDraft,
    setConfirmEntireRebuild,
    setPrefs,
    setQtyWarning,
    setRebuildFor,
    setSelection,
    setShowGenerate,
    setTool,
    setWarningConfirm,
    showGenerate,
    structurePreset,
    warningConfirm,
  } = builder;
  return (
    <>
      {showGenerate && (
        <GenerateNetworkPreview
          preview={previewGeneration(
            enabledComponents.map((component) => ({
              ...component,
              architecture_prep: {
                ...component.architecture_prep,
                template_preference: (prefs[component.id]?.templateId ??
                  component.architecture_prep
                    .template_preference) as Component['architecture_prep']['template_preference'],
                qty_model_preference: (prefs[component.id]?.qtyModel ??
                  component.architecture_prep
                    .qty_model_preference) as Component['architecture_prep']['qty_model_preference'],
              },
            })),
            materials,
          )}
          structurePreset={structurePreset}
          onCancel={() => setShowGenerate(false)}
          onConfirm={handleGenerate}
        />
      )}

      {rebuildFor && (
        <Modal
          title="Rebuild component subgraph / 重建元件子圖"
          description="Both options rebuild this component from its template. They differ in what happens to anything you added or edited by hand. / 兩個選項都會依模板重建此元件，差別在於你手動新增或修改過的物件會怎麼處理。"
          // Three bilingual choices do not fit the default width on one row.
          width="max-w-2xl"
          onClose={() => {
            setRebuildFor(null);
            setConfirmEntireRebuild(false);
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setRebuildFor(null);
                  setConfirmEntireRebuild(false);
                }}
              >
                Cancel / 取消
              </Button>
              {/*
                Destructive, so it is armed before it fires. The first click
                turns it red and spells out exactly what disappears; only the
                second click does it. The count comes from the same
                `origin.kind === 'manual' || origin.modified` test the store
                uses, so the number shown is the number that will be deleted.
              */}
              <Button
                variant={confirmEntireRebuild ? 'danger' : undefined}
                onClick={() => {
                  if (!confirmEntireRebuild) {
                    setConfirmEntireRebuild(true);
                    return;
                  }
                  applyTemplate(rebuildFor, 'entire');
                  setRebuildFor(null);
                  setConfirmEntireRebuild(false);
                }}
              >
                {confirmEntireRebuild ? 'Confirm delete / 確定刪除' : 'Entire Subgraph / 全部取代'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  applyTemplate(rebuildFor, 'generated_only');
                  setRebuildFor(null);
                  setConfirmEntireRebuild(false);
                }}
              >
                Auto-generated Only / 僅自動產生
              </Button>
            </>
          }
        >
          <dl className="flex flex-col gap-2.5 text-[13px]">
            <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
              <dt className="font-semibold text-ink-900">Auto-generated Only / 僅自動產生</dt>
              <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                Replaces what the template made and <strong>keeps</strong> everything you added or
                edited by hand.
                <span className="block">
                  只取代模板產生的部分，你手動新增或修改過的物件會<strong>保留</strong>。
                </span>
              </dd>
            </div>
            <div
              className={`rounded-md border px-3 py-2 ${
                confirmEntireRebuild
                  ? 'border-danger-500 bg-danger-100/50'
                  : 'border-line bg-surface-muted'
              }`}
            >
              <dt className="font-semibold text-ink-900">Entire Subgraph / 全部取代</dt>
              <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                Deletes <strong>every</strong> node and edge belonging to this component, including
                the ones you added or edited by hand, then rebuilds from the template.
                <span className="block">
                  刪除此元件的<strong>所有</strong>
                  節點與連線（含手動新增與修改過的），再依模板重建。
                </span>
              </dd>
              {manualObjectsFor(rebuildFor) > 0 ? (
                <p
                  className={`mt-1.5 text-[12px] font-semibold ${
                    confirmEntireRebuild ? 'text-danger-600' : 'text-warn-600'
                  }`}
                >
                  {manualObjectsFor(rebuildFor)} hand-made object(s) will be permanently deleted.
                  <span className="block">
                    將永久刪除 {manualObjectsFor(rebuildFor)} 個手動建立／修改的物件。
                  </span>
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-ink-400">
                  This component has no hand-made objects, so both options do the same thing here.
                  <span className="block">此元件沒有手動物件，因此兩個選項結果相同。</span>
                </p>
              )}
            </div>
          </dl>
        </Modal>
      )}

      {qtyWarning && (
        <Modal
          title="Quantity representation change / 變更數量表示方式"
          description="Changing how this component's quantity is represented rebuilds its topology. Existing connections and manual edits on the old instances may be orphaned. / 變更數量表示會重建拓樸，既有連線與手動修改可能會失效。"
          onClose={() => setQtyWarning(null)}
          footer={
            <>
              <Button onClick={() => setQtyWarning(null)}>Cancel / 取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setPrefs({
                    ...prefs,
                    [qtyWarning.componentId]: qtyWarning.next,
                  });
                  setQtyWarning(null);
                  toast.warning(
                    'Representation changed. Re-apply the template to rebuild. / 已變更，請重新套用模板。',
                  );
                }}
              >
                Change anyway / 仍要變更
              </Button>
            </>
          }
        />
      )}

      {addNodeDraft && (
        <Modal
          title="Add node / 新增節點"
          onClose={() => {
            setAddNodeDraft(null);
            setTool('select');
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setAddNodeDraft(null);
                  setTool('select');
                }}
              >
                Cancel / 取消
              </Button>
              <Button
                variant="primary"
                disabled={!addNodeDraft.name.trim()}
                onClick={() => {
                  const id = manualId('NODE', new Set(Object.keys(network.nodes)));
                  useNetworkStore.getState().upsertNode({
                    id,
                    name: addNodeDraft.name.trim(),
                    type: addNodeDraft.type,
                    power_W: 0,
                    temperature_C: null,
                    temperature_source: null,
                    boundary_type: null,
                    zone_id: null,
                    ports: [],
                    origin: { kind: 'manual' },
                  });
                  setSelection({ kind: 'node', id });
                  setAddNodeDraft(null);
                  setTool('select');
                }}
              >
                Add / 新增
              </Button>
            </>
          }
        >
          <FieldLabel label="Node Name" zh="節點名稱" htmlFor="new-node-name" required />
          <TextInput
            id="new-node-name"
            className="mt-1 mb-2"
            value={addNodeDraft.name}
            onChange={(event) => setAddNodeDraft({ ...addNodeDraft, name: event.target.value })}
          />
          <FieldLabel label="Node Type" zh="節點類型" htmlFor="new-node-type" />
          <Select
            id="new-node-type"
            className="mt-1"
            value={addNodeDraft.type}
            options={NODE_TYPES}
            onChange={(event) =>
              setAddNodeDraft({
                ...addNodeDraft,
                type: event.target.value as NodeType,
              })
            }
          />
        </Modal>
      )}

      {warningConfirm != null && (
        <Modal
          title="Continue with warnings? / 有警告，仍要繼續？"
          description={`${warningConfirm} item(s) remain unresolved. They must be completed in Screen 06 or a later calibration. / 尚有 ${warningConfirm} 項未解析，需於 Screen 06 或後續校正完成。`}
          onClose={() => setWarningConfirm(null)}
          footer={
            <>
              <Button onClick={() => setWarningConfirm(null)}>Stay / 留在本頁</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setWarningConfirm(null);
                  navigate(projectPath(projectId, 'boundary'));
                }}
              >
                Continue / 繼續
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
