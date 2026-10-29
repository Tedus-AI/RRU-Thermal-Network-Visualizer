/**
 * 01「連結 AI-Thermal 專案」/「從 AI-Thermal 更新」: what the AI-Thermal project
 * (and 5G-RRU's parameter console in it) says about this project, field by
 * field, and the engineer's pick (`domain/projectAiLink.ts`).
 *
 * Ticked to begin with: every field the link owns and nobody here took over,
 * and — on a first link — a field still holding what this tool starts with.
 * Unticked: a field taken over with ✂, and on a first link a value someone
 * already set here (it is not knowable which side changed). Ticked rows take
 * the linked value and lock; unticked ones keep this tool's value, marked
 * taken over so 01 offers 改回.
 *
 * Below the fields, when AI-Thermal states room-temperature powers and the
 * project has no room-temperature scenario: create 「常溫 25 °C」 (ticked).
 */

import { useEffect, useRef, useState } from 'react';
import { Cloud, FileJson, RefreshCw } from 'lucide-react';

import { Button, Modal, Select } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { formatProjectAiValue, projectAiFieldInfo, sameProjectAiValue } from '@/domain/projectAiLink';
import { useProjectStore } from '@/data/projectStore';
import { SourceTag } from './ProjectAiLocked';
import type { ProjectAiLinkState } from './useProjectAiLink';

export function ProjectAiLinkDialog({
  ai,
  readOnly,
  onClose,
}: {
  ai: ProjectAiLinkState;
  readOnly: boolean;
  onClose: () => void;
}) {
  const { plan, fresh, link } = ai;
  const materials = useProjectStore((s) => s.draft?.materials);
  const fileInput = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const [roomTemp, setRoomTemp] = useState(true);
  // The picks start from the plan, once per plan shown (a new read or project).
  const seeded = useRef<unknown>(null);
  useEffect(() => {
    if (!plan || seeded.current === fresh) return;
    seeded.current = fresh;
    setPicks(Object.fromEntries(plan.rows.map((row) => [row.key, row.pick])));
  }, [plan, fresh]);

  const linking = !link || (plan?.first ?? false);
  const reading = ai.status === 'reading';
  const picked = plan ? plan.rows.filter((row) => picks[row.key] ?? row.pick).length : 0;
  const fieldsUpToDate =
    !!plan && !plan.first && plan.rows.length === 0 && plan.relock.length === 0 && plan.dropped.length === 0;
  const offerRoomTemp = !!plan && !!ai.roomTemp;
  const upToDate = fieldsUpToDate && !offerRoomTemp;
  const addsScenario = offerRoomTemp && roomTemp;
  const total = picked + (plan?.relock.length ?? 0) + (plan?.dropped.length ?? 0) + (addsScenario ? 1 : 0);

  const description = fresh
    ? [
        `AI-Thermal 專案「${fresh.project_name}」`,
        fresh.saved_at ? `最後儲存 ${fresh.saved_at.slice(0, 10)}` : null,
        ai.source ? `讀自 ${ai.source.label.startsWith('SharePoint') ? 'SharePoint' : ai.source.label}（${ai.source.at}）` : null,
      ]
        .filter(Boolean)
        .join('・')
    : '專案名稱、頻段、環境溫度，以及 5G-RRU 參數控制台的鰭片製程、銅塊、焊料、導熱孔、散熱器底座與 TIM，連到 AI-Thermal 的同一個專案。';

  const apply = () => {
    const { changed, scenario } = ai.apply(picks, { roomTemp: addsScenario });
    const created = scenario ? `，並新增情境「${scenario}」` : '';
    toast.success(
      linking
        ? `已連結 AI-Thermal 專案「${fresh?.project_name}」${changed ? `，更新 ${changed} 項` : ''}${created}。`
        : changed
          ? `已從 AI-Thermal 更新 ${changed} 項${created}。`
          : scenario
            ? `已新增情境「${scenario}」。`
            : '已與 AI-Thermal 同步。',
    );
    onClose();
  };

  const fmt = (key: string, value: string | number | null) => formatProjectAiValue(key, value);

  return (
    <Modal
      title={link ? '從 AI-Thermal 更新' : '連結 AI-Thermal 專案'}
      description={description}
      width="max-w-3xl"
      onClose={onClose}
      footer={
        !plan || upToDate ? (
          <Button onClick={onClose}>關閉</Button>
        ) : (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              disabled={readOnly || (!linking && fieldsUpToDate && !addsScenario)}
              onClick={apply}
            >
              {linking ? `連結${picked ? `並套用 ${picked} 項` : ''}` : fieldsUpToDate ? '新增情境' : `套用 ${total} 項`}
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
            if (file) void ai.readFile(file);
          }}
        />

        {!ai.source && (
          <div className="flex flex-col gap-2">
            <p className="text-ink-500">唯讀 AI-Thermal 的資料庫，不會改到 AI-Thermal 或 5G-RRU 的資料。</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Cloud size={14} />} disabled={reading} onClick={() => void ai.readSharePoint()}>
                {reading ? '讀取中…' : '從 SharePoint 讀取'}
              </Button>
              <Button icon={<FileJson size={14} />} disabled={reading} onClick={() => fileInput.current?.click()}>
                選擇本機的 thermal_db.json
              </Button>
            </div>
            {ai.status === 'error' && <p className="text-danger-600">{ai.message}</p>}
          </div>
        )}

        {ai.source && !link && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label htmlFor="ai-link-project" className="text-[12px] font-semibold text-ink-700">
                AI-Thermal 專案
              </label>
              <Select
                id="ai-link-project"
                className="mt-1.5"
                value={ai.target ?? ''}
                onChange={(event) => ai.setTarget(event.target.value)}
                items={[
                  ...(ai.target ? [] : [{ value: '', label: '— 請選擇 —' }]),
                  ...ai.projects.map((p) => ({
                    value: p.id,
                    label: `${p.name}${p.name !== p.id ? `（${p.id}）` : ''}${p.id === ai.suggested ? '・03 的元件來自這裡' : ''}`,
                  })),
                ]}
              />
            </div>
            <button
              type="button"
              className="mb-2 text-accent-700 hover:underline disabled:opacity-50"
              disabled={reading}
              onClick={() => (ai.source?.label.startsWith('SharePoint') ? void ai.readSharePoint() : fileInput.current?.click())}
            >
              <RefreshCw size={12} className="mr-1 inline" aria-hidden />
              重新讀取
            </button>
          </div>
        )}

        {ai.missing && (
          <p className="rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5 text-warn-600">
            讀到的資料庫裡沒有 AI-Thermal 專案「{ai.target}」（可能已刪除，或讀錯了檔案）。01 維持原樣。
          </p>
        )}

        {plan && (
          <p className="tabular text-ink-700">
            <b>{plan.rows.length}</b> 項不同・相同 <b>{plan.same + plan.relock.length}</b> 項
            {link && ai.source && (
              <button
                type="button"
                className="ml-2 text-accent-700 hover:underline disabled:opacity-50"
                disabled={reading}
                onClick={() => (ai.source?.label.startsWith('SharePoint') ? void ai.readSharePoint() : fileInput.current?.click())}
              >
                重新讀取
              </button>
            )}
          </p>
        )}

        {fieldsUpToDate && <p className="text-ok-600">已是最新：01 與 AI-Thermal 專案「{fresh?.project_name}」相同。</p>}

        {plan?.first && (
          <div className="rounded-md border border-accent-500/25 bg-accent-50 p-2.5 text-[12px] leading-relaxed text-ink-700">
            <p className="font-semibold">第一次連結</p>
            <p className="mt-0.5 text-ink-600">
              01 還在出廠預設（或空白）的欄位預設勾選；01 已經填過、又和 AI-Thermal 不同的，分不出是哪一邊改的，預設不勾。
              勾的用 AI-Thermal（或 5G-RRU）的值並鎖定；沒勾的保留 01 的值、不鎖定，之後可以按「改回」。
              兩邊相同的欄位直接鎖定。
            </p>
          </div>
        )}

        {plan && plan.rows.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-3 text-[12px]">
              <button type="button" className="text-accent-700 hover:underline" onClick={() => setPicks(Object.fromEntries(plan.rows.map((r) => [r.key, true])))}>
                全部用 AI-Thermal
              </button>
              <button type="button" className="text-accent-700 hover:underline" onClick={() => setPicks(Object.fromEntries(plan.rows.map((r) => [r.key, false])))}>
                全部保留 01
              </button>
            </div>
            <table className="tabular w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[11.5px] text-ink-500">
                  <th className="w-7 py-1 font-normal" aria-label="套用" />
                  <th className="py-1 font-normal">項目</th>
                  <th className="py-1 pr-3 text-right font-normal">01 目前</th>
                  <th className="py-1 pr-3 text-right font-normal">連結的值</th>
                  <th className="py-1 font-normal">說明</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => {
                  const info = materials ? projectAiFieldInfo(row.key, materials) : row;
                  return (
                    <tr key={row.key} className="border-b border-line/60 last:border-0">
                      <td className="py-1">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-accent-600)]"
                          aria-label={`套用 ${info.group} ${info.label}`}
                          checked={picks[row.key] ?? row.pick}
                          disabled={readOnly}
                          onChange={(event) => setPicks((current) => ({ ...current, [row.key]: event.target.checked }))}
                        />
                      </td>
                      <td className="py-1 text-ink-700" title={`${row.source}：${row.from}`}>
                        {info.group}・{info.label}
                        {info.unit && info.unit !== '—' && <span className="text-ink-400">（{info.unit}）</span>}
                      </td>
                      <td className="py-1 pr-3 text-right text-ink-500">{fmt(row.key, row.current)}</td>
                      <td className="py-1 pr-3 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-semibold text-ink-900">{fmt(row.key, row.incoming)}</span>
                          <SourceTag source={row.source} />
                        </span>
                        {row.before != null && !sameProjectAiValue(row.before, row.incoming) && (
                          <span className="block text-[11px] text-ink-400">上次 {fmt(row.key, row.before)}</span>
                        )}
                      </td>
                      <td className="py-1 text-[11.5px] whitespace-nowrap text-ink-400">{row.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {offerRoomTemp && ai.roomTemp && (
          <label className="flex items-start gap-2 rounded-md border border-line bg-surface-muted p-2.5" data-room-temp-offer>
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-600)]"
              checked={roomTemp}
              disabled={readOnly}
              onChange={(event) => setRoomTemp(event.target.checked)}
            />
            <span className="leading-relaxed">
              <span className="font-semibold text-ink-900">另外新增情境「常溫 25 °C」</span>
              <span className="block text-[12px] text-ink-600">
                環境 25 °C、功耗用「常溫 Pd」：AI-Thermal 有 {ai.roomTemp.parts} 顆元件填了 Pd@25°C（帶進 03 的「常溫功耗」）。
                目前的情境不變；新增後可在 01 的情境表改名或調整，之後的更新不會再動它。
              </span>
            </span>
          </label>
        )}

        {plan && plan.relock.length > 0 && (
          <p className="text-ink-600">
            另有 {plan.relock.length} 項與連結的值相同、還沒鎖定，{linking ? '連結' : '套用'}後一起鎖定，數值不變。
          </p>
        )}
        {plan && plan.dropped.length > 0 && materials && (
          <p className="text-ink-600">
            AI-Thermal／5G-RRU 不再提供 {plan.dropped.map((key) => projectAiFieldInfo(key, materials).label).join('、')}，
            套用後改由本工具維護（數值不變）。
          </p>
        )}
      </div>
    </Modal>
  );
}
