/**
 * Duplicate Project (01 §16).
 *
 * What is copied: the project record (identity, product context, materials) and,
 * when ticked, the scenarios. Components, the thermal network, FloTHERM mapping
 * and solver results are NOT copied — this modal used to offer checkboxes for
 * them, ticked, that changed nothing, so a duplicate came out empty while the
 * dialog said otherwise. The dialog now says what it does; copying the rest
 * would be a feature of its own (01 §16 says solver results and FloTHERM
 * mapping stay off by default in any case: 00 §16, Rule 3).
 */

import { useState } from 'react';
import { Button, Field, Modal, TextInput } from '@/ui/primitives';
import {
  PROJECT_ID_PATTERN,
  createBaselineScenario,
  type Project,
  type Scenario,
} from '@/domain/project';
import { projectIdExists, saveProject, saveScenarios } from '@/data/persistence';
import { createRevision } from '@/domain/revision';
import { toast } from '@/ui/toast';


export function DuplicateProjectModal({
  source,
  scenarios,
  onClose,
  onDuplicated,
}: {
  source: Project;
  scenarios: Scenario[];
  onClose: () => void;
  onDuplicated: (projectId: string) => void;
}) {
  const [name, setName] = useState(`${source.project_name}（副本）`);
  const [id, setId] = useState(`${source.project_id}_COPY`.slice(0, 64));
  const [copyScenarios, setCopyScenarios] = useState(true);

  const error = !name.trim()
    ? '請填新專案名稱。'
    : !PROJECT_ID_PATTERN.test(id.trim())
      ? '專案代號限 3–64 字元：英數字、底線或連字號。'
      : projectIdExists(id.trim())
        ? `專案代號「${id.trim()}」已被使用。`
        : null;

  const handleDuplicate = () => {
    if (error) return;
    const now = new Date().toISOString();
    const copy: Project = {
      ...source,
      project_id: id.trim(),
      project_name: name.trim(),
      revision: createRevision('project'),
      status: 'active',
      meta: { ...source.meta, created_at: now, updated_at: now },
    };
    saveProject(copy);

    if (copyScenarios && scenarios.length > 0) {
      saveScenarios(
        copy.project_id,
        scenarios.map((s) => ({
          ...s,
          project_id: copy.project_id,
          revision: createRevision('scenario'),
        })),
      );
    } else {
      saveScenarios(copy.project_id, [createBaselineScenario(copy.project_id)]);
    }

    toast.success(`已複製為「${copy.project_name}」`);
    onDuplicated(copy.project_id);
  };

  return (
    <Modal
      title="複製專案"
      description="複製專案資料（基本資料、材料與製程預設）；元件與熱網路不會複製。來源專案不受影響。"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={Boolean(error)} onClick={handleDuplicate}>
            複製
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="New Project Name" zh="新專案名稱" htmlFor="dup_name" required>
          <TextInput id="dup_name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="New Project ID" zh="新專案代號" htmlFor="dup_id" required error={error ?? undefined}>
          <TextInput
            id="dup_id"
            value={id}
            className="font-mono"
            invalid={Boolean(error)}
            onChange={(e) => setId(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2.5 text-[13px] text-ink-700">
          <input
            type="checkbox"
            checked={copyScenarios}
            className="size-4 accent-[var(--color-accent-600)]"
            onChange={(e) => setCopyScenarios(e.target.checked)}
          />
          一併複製情境（{scenarios.length} 個）
        </label>
      </div>
    </Modal>
  );
}
