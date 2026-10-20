/**
 * 「從 TIM 管理工具帶入」 — pick materials from the TIM Management Tool's catalog into the project's
 * TIM library (`domain/timCatalog.ts`).
 *
 * A material already linked is shown but cannot be picked twice. One that the project already has
 * under the same name is linked rather than duplicated, so components keep pointing at it.
 */

import { useMemo, useState } from 'react';

import { Button, Modal, TextInput } from '@/ui/primitives';
import { sameName, type TimCatalog, type TimCatalogMaterial } from '@/domain/timCatalog';
import type { TimMaterial } from '@/domain/materials';
import { timCatalogStateText, type TimCatalogState } from '@/data/timCatalogStore';

export function TimCatalogPicker({
  library,
  catalog,
  state,
  error,
  onPick,
  onClose,
}: {
  library: TimMaterial[];
  /** null while it is being read, or when it cannot be (then `state` says why). */
  catalog: TimCatalog | null;
  state: TimCatalogState;
  error: string;
  onPick: (picked: TimCatalogMaterial[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.materials ?? [])
      .filter((m) => !q || [m.vendor, m.model, m.type_label, m.family].join(' ').toLowerCase().includes(q))
      .map((m) => {
        const linked = library.some((t) => t.catalog?.id === m.id);
        const same = !linked && library.some((t) => !t.catalog && sameName(t, m));
        return { m, linked, same };
      });
  }, [catalog, library, query]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const confirm = () => {
    const chosen = (catalog?.materials ?? []).filter((m) => picked.includes(m.id));
    if (chosen.length) onPick(chosen);
  };

  return (
    <Modal
      title="從 TIM 管理工具帶入"
      description="TIM 材料在 TIM 管理工具建立。勾選的材料加到本專案：名稱與 k 之後跟著 TIM 管理工具更新，BLT 仍在這裡填。專案已有同名的材料會改為連結它（元件不受影響）。"
      width="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-[12px] text-ink-500">
            {catalog ? `TIM 管理工具 ${catalog.materials.length} 筆材料` : ''}
          </span>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!picked.length} onClick={confirm}>
            {picked.length ? `帶入 ${picked.length} 筆` : '帶入'}
          </Button>
        </>
      }
    >
      <TextInput
        aria-label="搜尋材料"
        className="mb-3 h-8"
        placeholder="搜尋廠商、型號、類型…"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      {!catalog ? (
        <p className="py-4 text-[13px] text-ink-500">{timCatalogStateText(state, error) || '讀取中…'}</p>
      ) : (
        <div className="max-h-[46vh] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-500">
                <th className="w-8 py-1.5" />
                <th className="py-1.5 pr-3 font-semibold">材料</th>
                <th className="py-1.5 pr-3 font-semibold">類型</th>
                <th className="w-24 py-1.5 pr-3 text-right font-semibold">
                  k <span className="font-normal text-ink-400">(W/m·K)</span>
                </th>
                <th className="py-1.5 font-semibold">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, linked, same }) => (
                <tr
                  key={m.id}
                  className={`border-b border-line/60 ${linked ? 'text-ink-400' : 'cursor-pointer hover:bg-surface-muted'}`}
                  onClick={() => !linked && toggle(m.id)}
                >
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`選取 ${m.vendor} ${m.model}`}
                      checked={picked.includes(m.id)}
                      disabled={linked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggle(m.id)}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="font-semibold text-ink-900">{m.model}</span>{' '}
                    <span className="text-ink-500">{m.vendor}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-700">
                    {m.type_label || m.family}
                    {!m.family_exact && <span className="text-ink-400">（類型請確認）</span>}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {m.k ?? '—'}
                    {m.k_method && <div className="text-[11px] text-ink-400">{m.k_method}</div>}
                  </td>
                  <td className="py-1.5 text-[12px] text-ink-500">
                    {linked ? '已在本專案' : same ? '本專案有同名，將改為連結' : m.avl_label}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-[12px] text-ink-400">
                    {query ? '沒有符合的材料' : 'TIM 管理工具的材料庫還沒有材料'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
