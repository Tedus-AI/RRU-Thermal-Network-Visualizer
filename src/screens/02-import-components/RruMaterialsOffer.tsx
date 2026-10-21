/**
 * 5G-RRU's parameter console → this project's 01 materials (`aiThermalMaterials.ts`).
 *
 * Shown on the check step, inside the materials card, when the source is an
 * AI-Thermal project: the coin, solder, generic via numbers, heat-sink base and
 * TIM fallbacks 5G-RRU stored for that project, beside 01's current values.
 * Nothing changes until 帶入 01; a value someone already set in 01 starts
 * unticked. A changed material makes the staged rows re-read (the store's
 * `reparse`), so a part that inherited the old bond line is judged again.
 */

import { useMemo, useState } from 'react';

import { Button } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { useProjectStore } from '@/data/projectStore';
import type { MaterialDefaults } from '@/domain/materials';
import {
  rruMaterialDefaultPick,
  rruMaterialPatch,
  rruMaterialRows,
} from '@/importers/component/aiThermalMaterials';

/** " · 5G-RRU 參數 9 項與 01 不同" for the folded materials card; nothing when all match. */
export function useRruMaterialsSummary(project: Record<string, unknown> | null): string | undefined {
  const materials = useProjectStore((s) => s.draft?.materials);
  return useMemo(() => {
    if (!project || !materials) return undefined;
    const differ = rruMaterialRows(project, materials).filter((r) => !r.same).length;
    return differ > 0 ? ` · 5G-RRU 參數 ${differ} 項與 01 不同` : undefined;
  }, [project, materials]);
}

const fmt = (value: number | null) => (value == null ? '—' : String(+value.toFixed(4)));

/**
 * 5G-RRU's parameter console for this project, offered to 01 (`aiThermalMaterials.ts`).
 * Each row shows 01's value next to 5G-RRU's; nothing changes until 帶入 01.
 */
export function RruMaterialsOffer({
  project,
  projectName,
  materials,
}: {
  project: Record<string, unknown>;
  projectName: string;
  materials: MaterialDefaults;
}) {
  const readOnly = useProjectStore((s) => s.isReadOnly());
  const patchMaterials = useProjectStore((s) => s.patchMaterials);
  const rows = useMemo(() => rruMaterialRows(project, materials), [project, materials]);
  const differ = rows.filter((r) => !r.same);
  const [ticked, setPicked] = useState<string[]>(() => rruMaterialDefaultPick(rows));
  // A row that became equal (applied, or typed in 01) drops out of the pick.
  const picked = ticked.filter((id) => differ.some((r) => r.id === id));

  if (rows.length === 0) return null;
  const sameCount = rows.length - differ.length;
  const apply = () => {
    const chosen = differ.filter((r) => picked.includes(r.id));
    if (chosen.length === 0) return;
    patchMaterials(rruMaterialPatch(materials, rows, picked, `5G-RRU 參數控制台（${projectName}）`));
    toast.success(`已把 5G-RRU 的 ${chosen.length} 項材料設定帶入 01。`);
  };

  return (
    <section className="rounded-md border border-line bg-surface p-3 text-[12px]" aria-labelledby="ait-mat-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="ait-mat-title" className="font-semibold text-ink-700">
          5G-RRU 參數控制台 → 01 材料與製程
        </p>
        <p className="text-ink-400">
          {differ.length === 0 ? `${rows.length} 項都與 01 相同` : `${differ.length} 項不同${sameCount ? `・${sameCount} 項相同` : ''}`}
        </p>
      </div>
      {differ.length > 0 && (
        <>
          <table className="tabular mt-2 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[11.5px] text-ink-500">
                <th className="w-7 py-1 font-normal" aria-label="帶入" />
                <th className="py-1 font-normal">項目</th>
                <th className="py-1 text-right font-normal">01 目前</th>
                <th className="py-1 text-right font-normal">5G-RRU</th>
              </tr>
            </thead>
            <tbody>
              {differ.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="py-1">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent-600)]"
                      aria-label={`帶入 ${r.group} ${r.label}`}
                      checked={picked.includes(r.id)}
                      disabled={readOnly}
                      onChange={(event) =>
                        setPicked((current) =>
                          event.target.checked ? [...current, r.id] : current.filter((id) => id !== r.id),
                        )
                      }
                    />
                  </td>
                  <td className="py-1 text-ink-700" title={`5G-RRU：${r.from}`}>
                    {r.group}・{r.label}
                    {r.unit !== '—' && <span className="text-ink-400">（{r.unit}）</span>}
                  </td>
                  <td className="py-1 text-right text-ink-500">
                    {fmt(r.current)}
                    {r.current != null && (
                      <span className="ml-1 text-[11px] text-ink-400">{r.currentStated ? '已設定' : '預設'}</span>
                    )}
                  </td>
                  <td className="py-1 text-right font-semibold text-ink-900">{fmt(r.incoming)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={readOnly || picked.length === 0}
              onClick={apply}
            >
              帶入 01（{picked.length} 項）
            </Button>
            <span className="text-ink-400">
              {readOnly ? '專案唯讀，不能帶入。' : '01 已設定的值預設不勾；只帶入 5G-RRU 有存的值。'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
