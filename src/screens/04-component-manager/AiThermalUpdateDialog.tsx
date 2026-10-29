/**
 * 04「從 AI-Thermal 更新」: what AI-Thermal now says about the linked
 * components, field by field, and the engineer's pick (`aiThermalLink.ts`).
 *
 * Ticked to begin with: every field AI-Thermal owns and nobody here took over.
 * Unticked: a field taken over with ✂ and changed, a name changed here, a value
 * filled in here that AI-Thermal had left empty, and every component AI-Thermal
 * added (勾選即加入). A component AI-Thermal no longer has is kept and becomes
 * this tool's to maintain; switching it off as well is a tick away.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, FileJson, RefreshCw } from 'lucide-react';

import { Button, Modal, Select } from '@/ui/primitives';
import { componentTotalPowerW } from '@/domain/component';
import type { MaterialDefaults } from '@/domain/materials';
import {
  AI_FIELD_LABEL,
  applyAiPlan,
  formatAiValue,
  type AiField,
  type AiUpdateChoice,
} from '@/domain/aiThermalLink';
import type { Component } from '@/domain/component';
import { timNameOf } from './AiLocked';
import type { AiThermalUpdate } from './useAiThermalUpdate';

export function AiThermalUpdateDialog({
  update,
  components,
  materials,
  readOnly,
  onClose,
  onApply,
}: {
  update: AiThermalUpdate;
  components: Component[];
  materials: MaterialDefaults;
  readOnly: boolean;
  onClose: () => void;
  onApply: (result: ReturnType<typeof applyAiPlan>) => void;
}) {
  const { plan, fresh, target } = update;
  const timName = timNameOf(materials);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState<Record<string, AiField[]>>({});
  const [add, setAdd] = useState<string[]>([]);
  const [disable, setDisable] = useState<string[]>([]);
  // The picks start from the plan, once per plan shown (a new read or project).
  const seeded = useRef<unknown>(null);
  useEffect(() => {
    if (!plan || seeded.current === fresh) return;
    seeded.current = fresh;
    setFields(
      Object.fromEntries(
        plan.updates.map((u) => [u.componentId, u.changes.filter((c) => c.pick).map((c) => c.field)]),
      ),
    );
    setAdd([]);
    setDisable([]);
  }, [plan, fresh]);

  // Parts 5G-RRU excluded are AI-Thermal's too, but rarely wanted: folded away.
  const addable = plan?.added.filter((component) => component.enabled) ?? [];
  const excluded = plan?.added.filter((component) => !component.enabled) ?? [];
  const pickedCount = Object.values(fields).reduce((sum, list) => sum + list.length, 0);
  // A first link is an item of its own: applying it locks the part even with nothing ticked.
  const total =
    pickedCount + add.length + (plan?.removed.length ?? 0) + (plan?.firstLinks ?? 0) + (plan?.relock.length ?? 0);
  const nothing =
    !!plan &&
    plan.updates.length === 0 &&
    plan.removed.length === 0 &&
    plan.link.length === 0 &&
    plan.relock.length === 0 &&
    addable.length === 0 &&
    add.length === 0;
  const tickAll = (on: boolean) =>
    setFields(
      Object.fromEntries(plan?.updates.map((u) => [u.componentId, on ? u.changes.map((c) => c.field) : []]) ?? []),
    );

  const toggle = (id: string, field: AiField, on: boolean) =>
    setFields((previous) => {
      const list = new Set(previous[id] ?? []);
      if (on) list.add(field);
      else list.delete(field);
      return { ...previous, [id]: [...list] };
    });
  const flip = (list: string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((entry) => entry !== id);

  const description = useMemo(() => {
    if (!fresh) return 'AI-Thermal 改過的數量、功耗、限溫、Rjc、散熱路徑、尺寸、板厚、TIM、導熱孔，在這裡更新到本工具。';
    return [
      `AI-Thermal 專案「${fresh.name}」`,
      fresh.savedAt ? `最後儲存 ${fresh.savedAt.slice(0, 10)}` : null,
      update.source ? `讀自 ${update.source.label.startsWith('SharePoint') ? 'SharePoint' : update.source.label}（${update.source.at}）` : null,
    ]
      .filter(Boolean)
      .join('・');
  }, [fresh, update.source]);

  const apply = () => {
    if (!plan || !target) return;
    const choice: AiUpdateChoice = { fields, add, disable };
    onApply(applyAiPlan(components, plan, choice, target, fresh?.savedAt ?? null));
  };

  const reading = update.status === 'reading';

  const addRow = (component: Component) => (
    <li key={component.id}>
      <label className="flex items-center gap-2 text-ink-700">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent-600)]"
          checked={add.includes(component.id)}
          onChange={(event) => setAdd((list) => flip(list, component.id, event.target.checked))}
        />
        <span className="font-semibold text-ink-900">{component.name}</span>
        <span className="tabular text-ink-400">
          {component.category}・{component.qty} 顆・{componentTotalPowerW(component).toFixed(2)} W
        </span>
      </label>
    </li>
  );


  return (
    <Modal
      title="從 AI-Thermal 更新"
      description={description}
      width="max-w-3xl"
      onClose={onClose}
      footer={
        nothing || !plan ? (
          <Button onClick={onClose}>關閉</Button>
        ) : (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={readOnly || total === 0} onClick={apply}>
              套用 {total} 項
            </Button>
          </>
        )
      }
    >
      <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto text-[12.5px]">
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void update.readFile(file);
          }}
        />
        {update.linked.length > 1 && (
          <div className="max-w-sm">
            <label htmlFor="ai-update-project" className="text-[12px] font-semibold text-ink-700">
              AI-Thermal 專案（本專案的元件來自 {update.linked.length} 個）
            </label>
            <Select
              id="ai-update-project"
              className="mt-1.5"
              value={target ?? ''}
              onChange={(event) => update.setTarget(event.target.value)}
              items={update.linked.map((p) => ({ value: p.id, label: `${p.id}（${p.count} 顆）` }))}
            />
          </div>
        )}

        {/* Where to read from: the header's background check found nothing to read. */}
        {!plan && !update.missing && (
          <div className="flex flex-col gap-2">
            <p className="text-ink-500">
              唯讀 AI-Thermal 的資料庫，不會改到 AI-Thermal 或 5G-RRU 的資料。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={update.source ? <RefreshCw size={14} /> : <Cloud size={14} />}
                disabled={reading}
                onClick={() => void update.readSharePoint()}
              >
                {reading ? '讀取中…' : '從 SharePoint 讀取'}
              </Button>
              <Button icon={<FileJson size={14} />} disabled={reading} onClick={() => fileInput.current?.click()}>
                選擇本機的 thermal_db.json
              </Button>
            </div>
            {update.status === 'error' && <p className="text-danger-600">{update.message}</p>}
          </div>
        )}

        {update.missing && (
          <p className="rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5 text-warn-600">
            讀到的資料庫裡沒有 AI-Thermal 專案「{target}」（可能已刪除，或讀錯了檔案）。元件維持原樣。
          </p>
        )}

        {plan && (
          <p className="tabular text-ink-700">
            <b>{plan.updates.length}</b> 顆有更新・AI-Thermal 新增 <b>{addable.length}</b> 顆・已刪除{' '}
            <b>{plan.removed.length}</b> 顆・相同 <b>{plan.same}</b> 顆
            {plan.firstLinks > 0 && (
              <>
                ・第一次連結 <b>{plan.firstLinks}</b> 顆
              </>
            )}
            {update.source && (
              <button
                type="button"
                className="ml-2 text-accent-700 hover:underline disabled:opacity-50"
                disabled={reading}
                onClick={() => {
                  if (update.source?.label.startsWith('SharePoint')) void update.readSharePoint();
                  else fileInput.current?.click();
                }}
              >
                重新讀取
              </button>
            )}
          </p>
        )}

        {nothing && <p className="text-ok-600">已是最新：連到這個 AI-Thermal 專案的元件都與 AI-Thermal 相同。</p>}

        {plan && plan.firstLinks > 0 && (
          <div className="rounded-md border border-accent-500/25 bg-accent-50 p-2.5 text-[12px] leading-relaxed text-ink-700">
            <p className="font-semibold">第一次連結</p>
            <p className="mt-0.5 text-ink-600">
              這 {plan.firstLinks} 顆是舊版從 AI-Thermal 匯入的，當時沒有記下 AI-Thermal 的值，所以數值不同的欄位分不出是
              AI-Thermal 改了、還是在 03 改過：預設不勾，請逐欄確認。勾的用 AI-Thermal 的值並鎖定；沒勾的保留本工具的值、不鎖定。
              與 AI-Thermal 相同的欄位直接鎖定{plan.link.length > 0 ? `（其中 ${plan.link.length} 顆完全相同，套用後直接連結）` : ''}。
            </p>
          </div>
        )}

        {plan && plan.relock.length > 0 && (
          <p className="rounded-md border border-line bg-surface-muted p-2.5 text-[12px] leading-relaxed text-ink-600">
            另有 <b>{plan.relock.length}</b> 顆：AI-Thermal 的值與本工具相同、但還沒鎖定（
            {[...new Set(plan.relock.flatMap((entry) => entry.fields))].map((field) => AI_FIELD_LABEL[field]).join('、')}
            ），套用後一起改為取自 AI-Thermal 並鎖定，數值不變。
            <span className="block text-ink-400" title={plan.relock.map((entry) => entry.name).join('、')}>
              {plan.relock.map((entry) => entry.name).join('、')}
            </span>
          </p>
        )}

        {plan && plan.updates.length > 0 && (
          <section>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[12px] font-bold text-ink-700">有更新的欄位</h3>
              <span className="flex gap-3 text-[11.5px]">
                <button type="button" className="text-accent-700 hover:underline" onClick={() => tickAll(true)}>
                  全部用 AI-Thermal
                </button>
                <button type="button" className="text-accent-700 hover:underline" onClick={() => tickAll(false)}>
                  全部保留本工具
                </button>
              </span>
            </div>
            <p className="mb-2 text-[11.5px] text-ink-500">沒勾的欄位保留本工具的值，之後可以在本工具修改（不再鎖定）。</p>
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-8" />
                <col className="w-28" />
                <col />
                <col />
                <col className="w-44" />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-ink-500">
                  <th />
                  <th className="py-1 font-semibold">欄位</th>
                  <th className="py-1 font-semibold">本工具</th>
                  <th className="py-1 font-semibold">AI-Thermal</th>
                  <th />
                </tr>
              </thead>
              {plan.updates.map((u) => {
                const picked = fields[u.componentId] ?? [];
                const all = u.changes.every((c) => picked.includes(c.field));
                return (
                  <tbody key={u.componentId} className="border-b border-line">
                    <tr className="bg-surface-muted">
                      <td className="py-1 pl-1">
                        <input
                          type="checkbox"
                          aria-label={`${u.name} 全部`}
                          className="size-4 accent-[var(--color-accent-600)]"
                          checked={all}
                          onChange={(event) =>
                            setFields((previous) => ({
                              ...previous,
                              [u.componentId]: event.target.checked ? u.changes.map((c) => c.field) : [],
                            }))
                          }
                        />
                      </td>
                      <td colSpan={4} className="py-1 font-semibold text-ink-900">
                        {u.name}
                        <span className="ml-1.5 font-normal text-ink-400">{u.changes.length} 項</span>
                        {u.firstLink && (
                          <span className="ml-2 rounded-sm bg-accent-100 px-1 text-[10.5px] font-semibold text-accent-700">
                            第一次連結
                          </span>
                        )}
                      </td>
                    </tr>
                    {u.changes.map((c) => (
                      <tr key={c.field} className="align-top">
                        <td className="py-1 pl-1">
                          <input
                            type="checkbox"
                            aria-label={`${u.name} ${AI_FIELD_LABEL[c.field]}`}
                            className="size-4 accent-[var(--color-accent-600)]"
                            checked={picked.includes(c.field)}
                            onChange={(event) => toggle(u.componentId, c.field, event.target.checked)}
                          />
                        </td>
                        <td className="py-1 text-ink-700">{AI_FIELD_LABEL[c.field]}</td>
                        <td className="tabular py-1 pr-2 break-words text-ink-500">
                          {formatAiValue(c.field, c.current, timName)}
                        </td>
                        <td className="tabular py-1 pr-2 break-words font-semibold text-ink-900">
                          {formatAiValue(c.field, c.incoming, timName)}
                        </td>
                        <td className="py-1 text-[11px] text-warn-600">{c.note}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </section>
        )}

        {addable.length > 0 && (
          <section>
            <h3 className="mb-1 text-[12px] font-bold text-ink-700">AI-Thermal 新增的元件（勾選即加入）</h3>
            <ul className="flex flex-col gap-1">{addable.map(addRow)}</ul>
          </section>
        )}

        {excluded.length > 0 && (
          <details className="group">
            <summary className="w-fit cursor-pointer list-none text-[12px] text-ink-500 hover:text-accent-700">
              另有 5G-RRU 已排除的 {excluded.length} 顆，沒有列入
              <span className="ml-1 text-ink-400 group-open:hidden">（展開可加入，加入後為停用）</span>
            </summary>
            <ul className="mt-1.5 flex flex-col gap-1">{excluded.map(addRow)}</ul>
          </details>
        )}

        {plan && plan.removed.length > 0 && (
          <section>
            <h3 className="mb-1 text-[12px] font-bold text-ink-700">AI-Thermal 已沒有的元件</h3>
            <p className="mb-1.5 text-[11.5px] text-ink-500">保留在本工具，改由本工具維護（解除鎖定）。</p>
            <ul className="flex flex-col gap-1">
              {plan.removed.map((component) => (
                <li key={component.id} className="flex items-center gap-3">
                  <span className="font-semibold text-ink-900">{component.name}</span>
                  <label className="flex items-center gap-1.5 text-ink-500">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent-600)]"
                      checked={disable.includes(component.id)}
                      disabled={!component.enabled}
                      onChange={(event) => setDisable((list) => flip(list, component.id, event.target.checked))}
                    />
                    {component.enabled ? '同時停用' : '已停用'}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan && plan.sameName.length > 0 && (
          <p className="text-[11.5px] text-ink-400">
            另有 {plan.sameName.length} 顆與本工具既有元件同名、沒有連結，沒有列入：{plan.sameName.join('、')}。
          </p>
        )}
      </div>
    </Modal>
  );
}
