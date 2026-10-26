/**
 * AI-Thermal's TIM models → this project's 01 materials.
 *
 * A row's TIM is matched against 01 by name at apply (`matchTimId`), so a model
 * 01 does not have imports as NO TIM. AI-Thermal's TIM 型號庫 holds the model's
 * k and compressed gap, so the check step offers to add the missing ones to 01
 * — ticked, since without them the parts arrive with no interface at all. A
 * model linked to the TIM Management Tool there is linked here too. Adding
 * re-reads the staged rows (the store's `reparse`), which then find it.
 */

import { useState } from 'react';

import { Button } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { useProjectStore } from '@/data/projectStore';
import type { MaterialDefaults, TimMaterial } from '@/domain/materials';
import { sourced, unknownValue } from '@/domain/sourcedValue';
import type { AiThermalTimNeed } from '@/importers/component/parseAiThermal';

const fmt = (value: number | null, unit: string) => (value == null ? '—' : `${+value.toFixed(4)} ${unit}`);

/** The 01 material for one AI-Thermal model. */
export function timMaterialFromAiThermal(need: AiThermalTimNeed, taken: Set<string>): TimMaterial {
  const base = `TIM_AIT_${need.model.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'MODEL'}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  const reference = 'AI-Thermal TIM 型號庫';
  return {
    id,
    name: need.model,
    k_W_mK: need.k == null ? unknownValue<number>('Imported') : sourced(need.k, 'Imported', { reference }),
    blt_mm: need.gap_mm == null ? unknownValue<number>('Imported') : sourced(need.gap_mm, 'Imported', { reference }),
    ...(need.catalogId ? { catalog: { id: need.catalogId } } : {}),
  };
}

export function AiTimOffer({ needs, materials }: { needs: AiThermalTimNeed[]; materials: MaterialDefaults }) {
  const readOnly = useProjectStore((s) => s.isReadOnly());
  const patchMaterials = useProjectStore((s) => s.patchMaterials);
  const [unticked, setUnticked] = useState<string[]>([]);
  if (needs.length === 0) return null;
  const picked = needs.filter((need) => !unticked.includes(need.model));

  const apply = () => {
    if (picked.length === 0) return;
    const taken = new Set(materials.tim.map((material) => material.id));
    patchMaterials({ tim: [...materials.tim, ...picked.map((need) => timMaterialFromAiThermal(need, taken))] });
    toast.success(`已把 AI-Thermal 的 ${picked.length} 個 TIM 型號加入 01。`);
  };

  return (
    <section className="rounded-md border border-warn-500/40 bg-warn-100/40 p-3 text-[12px]" aria-labelledby="ait-tim-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="ait-tim-title" className="font-semibold text-ink-700">
          AI-Thermal 的 TIM 型號 → 01 材料與製程
        </p>
        <p className="text-warn-600">{needs.length} 個型號 01 沒有，用到的元件匯入後會沒有 TIM</p>
      </div>
      <table className="tabular mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11.5px] text-ink-500">
            <th className="w-7 py-1 font-normal" aria-label="加入" />
            <th className="py-1 font-normal">型號（類型）</th>
            <th className="py-1 text-right font-normal">k</th>
            <th className="py-1 text-right font-normal">填縫厚度</th>
            <th className="py-1 pl-3 font-normal">用到的元件</th>
          </tr>
        </thead>
        <tbody>
          {needs.map((need) => (
            <tr key={need.model} className="border-b border-line/60 last:border-0">
              <td className="py-1">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent-600)]"
                  aria-label={`加入 ${need.model}`}
                  checked={!unticked.includes(need.model)}
                  disabled={readOnly}
                  onChange={(event) =>
                    setUnticked((list) =>
                      event.target.checked ? list.filter((m) => m !== need.model) : [...list, need.model],
                    )
                  }
                />
              </td>
              <td className="py-1 text-ink-900">
                <span className="font-semibold">{need.model}</span>
                {need.type && need.type !== need.model && <span className="text-ink-400">（{need.type}）</span>}
                {need.catalogId && <span className="ml-1 text-[11px] text-accent-700">TIM 管理工具</span>}
              </td>
              <td className="py-1 text-right">{fmt(need.k, 'W/m·K')}</td>
              <td className="py-1 text-right">{fmt(need.gap_mm, 'mm')}</td>
              <td className="py-1 pl-3 text-ink-500" title={need.components.join('、')}>
                {need.components.length} 顆
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={readOnly || picked.length === 0} onClick={apply}>
          加入 01（{picked.length} 個）
        </Button>
        <span className="text-ink-400">
          {readOnly
            ? '專案唯讀，不能加入。'
            : 'k 與填縫厚度取自 AI-Thermal 的 TIM 型號庫；沒有值的欄位加入後請在 01 補上。'}
        </span>
      </div>
    </section>
  );
}
