/**
 * Duplicate Project (01 §16).
 *
 * Copies the project record (identity, product context, materials) plus what is
 * ticked: components, the thermal network, scenarios and solver results. The
 * work is `duplicateProject` in projectFile.ts — the same writer that imports a
 * project file as a copy, so a duplicate and an imported copy are the same
 * thing.
 *
 * Solver results stay off by default (01 §16; 00 §16, Rule 3): they describe the
 * design they were solved on, and a copy is usually made to change it. Ticking
 * them brings their network and scenarios along, and a network brings its
 * components — those boxes show as ticked and locked, with the reason, rather
 * than letting a copy come out with nodes pointing at parts it does not have.
 *
 * FloTHERM mapping is not offered: Screen 03 is deferred and there is nothing to
 * copy yet.
 */

import { useMemo, useState } from 'react';
import { Button, Field, Modal, TextInput } from '@/ui/primitives';
import { PROJECT_ID_PATTERN, type Project, type Scenario } from '@/domain/project';
import { loadComponents, loadNetwork, loadSolutions, projectIdExists } from '@/data/persistence';
import { flushAutoPersistNow } from '@/data/autoPersist';
import { BUILD_ID } from '@/data/bootstrapStorage';
import {
  duplicateProject,
  resolveDuplicateOptions,
  type DuplicateOptions,
} from '@/data/projectFile';
import { toast } from '@/ui/toast';

type OptionKey = keyof DuplicateOptions;

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
  const [picked, setPicked] = useState<DuplicateOptions>({
    components: true,
    network: true,
    scenarios: true,
    results: false,
  });

  // What the source actually holds, so an option with nothing behind it can say so.
  const counts = useMemo(() => {
    const network = loadNetwork(source.project_id);
    return {
      components: loadComponents(source.project_id).length,
      network: network ? Object.keys(network.nodes ?? {}).length : 0,
      scenarios: scenarios.length,
      results: loadSolutions(source.project_id).length,
    };
  }, [source.project_id, scenarios.length]);

  const resolved = resolveDuplicateOptions(picked);

  const items: Array<{ key: OptionKey; label: string; count: string; lockedBy?: string }> = [
    {
      key: 'components',
      label: '元件',
      count: `${counts.components} 筆`,
      lockedBy: resolved.network ? '熱網路需要' : undefined,
    },
    {
      key: 'network',
      label: '熱網路',
      count: `${counts.network} 節點`,
      lockedBy: picked.results ? '求解結果需要' : undefined,
    },
    {
      key: 'scenarios',
      label: '情境與邊界條件',
      count: `${counts.scenarios} 個`,
      lockedBy: picked.results ? '求解結果需要' : undefined,
    },
    {
      key: 'results',
      label: '求解結果、瓶頸分析與報告設定',
      count: `${counts.results} 組`,
    },
  ];

  const error = !name.trim()
    ? '請填新專案名稱。'
    : !PROJECT_ID_PATTERN.test(id.trim())
      ? '專案代號限 3–64 字元：英數字、底線或連字號。'
      : projectIdExists(id.trim())
        ? `專案代號「${id.trim()}」已被使用。`
        : null;

  const handleDuplicate = () => {
    if (error) return;
    // Edits still inside the save debounce are on screen but not yet in storage,
    // and storage is what the copy is read from.
    flushAutoPersistNow();
    const outcome = duplicateProject(
      source.project_id,
      { id: id.trim(), name: name.trim() },
      picked,
      BUILD_ID,
    );
    if (!outcome) {
      toast.error('無法讀取來源專案，未建立副本。');
      return;
    }
    toast.success(`已複製為「${name.trim()}」`);
    onDuplicated(outcome.project_id);
  };

  return (
    <Modal
      title="複製專案"
      description="基本資料與材料與製程預設一定會複製，其餘依勾選。來源專案不受影響。"
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

        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">一併複製</legend>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <label
                key={item.key}
                className={`flex items-center gap-2.5 text-[13px] ${
                  item.lockedBy ? 'text-ink-500' : 'text-ink-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={resolved[item.key]}
                  disabled={Boolean(item.lockedBy)}
                  className="size-4 accent-[var(--color-accent-600)] disabled:opacity-60"
                  onChange={(e) =>
                    setPicked((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                />
                {item.label}
                <span className="tabular text-[12px] text-ink-400">{item.count}</span>
                {item.lockedBy && (
                  <span className="text-[12px] text-ink-400">（{item.lockedBy}）</span>
                )}
              </label>
            ))}
          </div>
          {!resolved.scenarios && (
            <p className="mt-2 text-[12px] text-ink-400">不複製情境時，副本從基準情境開始。</p>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
