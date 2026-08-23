/**
 * Section D — Materials & Process Defaults (01 §4).
 *
 * The constants every component inherits from. It lives here, in Screen 01,
 * because it is project data and Screen 01 is where project data is edited —
 * but Screen 02 renders the same component, since importing is the first moment
 * anyone needs these numbers, and walking back to another screen mid-import is
 * the kind of friction that gets a tool abandoned. One store, two doors.
 *
 * 01 §45 / 00 §53 still hold: nothing here creates a node or an edge. These are
 * inputs the Screen 05 templates read when they resolve an edge.
 */

import { useState } from 'react';

import { Plus, Trash2 } from 'lucide-react';

import { Button, NumberInput, SectionCard, Select, TextInput } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import {
  PROCESS_FIELDS,
  HSK_BASE_MATERIAL_OPTIONS,
  assumedCount,
  coinAreaMm2,
  hskBaseAreaMm2,
  hskMaterialDefaultK,
  nextTimId,
  timUsageCount,
  type MaterialDefaults,
  type HskBaseMaterial,
  type ProcessField,
  type TimMaterial,
} from '@/domain/materials';
import { sourced, withValue, type SourcedValue } from '@/domain/sourcedValue';
import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';

const PROCESS_TOOLTIPS: Partial<Record<ProcessField, string>> = {
  contact_conductance_W_m2K:
    '硬接觸熱傳係數 h（W/m²·K）參考值：\n1000（一般螺絲鎖付、無平整度要求）\n3000（整面 CNC + PCB 平整度 + 70 mm 一顆螺絲）\n10000（研磨面 + 高壓）',
};

/**
 * A number whose provenance is visible: a value still carrying the shipped
 * constant reads as muted, a stated one as normal weight. An engineer reviewing
 * a report needs to see at a glance which numbers anybody actually chose.
 *
 * The box holds its own text while it is being edited and commits on BLUR, for
 * two reasons that both bite when a value is retyped rather than typed:
 *
 *  - A controlled numeric input driven straight from the stored value cannot
 *    pass THROUGH empty. Delete the last digit and the parent has nothing to
 *    store, re-renders the old number, and the field looks like it refuses to
 *    be cleared.
 *  - Committing every keystroke stores the half-deleted numbers on the way.
 *    Backspacing 425 would write 42, then 4, so abandoning the edit left 4
 *    behind rather than 425 — and each of those wrote a project revision to
 *    disk for a number nobody meant.
 *
 * `allowEmpty` decides what an empty box means on blur. The coin size is
 * genuinely optional, so empty stores null. Every other constant is required —
 * Screen 04 inherits from them — so an empty box reverts to the value that was
 * there, not to the shipped default: putting back a number the engineer never
 * chose would be a silent edit.
 */
function MaterialNumber({
  id,
  label,
  zh,
  unit,
  tooltip,
  value,
  readOnly,
  placeholder = '—',
  allowEmpty = false,
  onChange,
}: {
  id: string;
  label: string;
  zh: string;
  unit?: string;
  tooltip?: string;
  value: SourcedValue<number> | null;
  readOnly: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  onChange: (next: SourcedValue<number> | null) => void;
}) {
  /** Text being edited. null means "show whatever is stored". */
  const [text, setText] = useState<string | null>(null);
  const isAssumed = value?.source === 'Assumed';

  const commit = () => {
    if (text == null) return;
    const raw = text.trim();
    setText(null);
    if (raw === '') {
      if (allowEmpty) onChange(null);
      return;
    }
    const parsed = Number(raw);
    // Typing a value is what turns a shipped constant into a decision.
    if (Number.isFinite(parsed) && parsed !== value?.value) {
      onChange(withValue(value, parsed, 'Manual'));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} unit={unit} tooltip={tooltip} htmlFor={id} />
      <NumberInput
        id={id}
        step="any"
        className={isAssumed && text == null ? 'text-ink-500' : undefined}
        value={text ?? value?.value ?? ''}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          // Escape abandons the edit and puts the stored value back.
          if (event.key === 'Escape') setText(null);
        }}
      />
    </div>
  );
}

export function MaterialDefaultsForm({
  readOnly,
  step,
  defaultOpen = true,
}: {
  readOnly: boolean;
  step?: number;
  defaultOpen?: boolean;
}) {
  const draft = useProjectStore((s) => s.draft);
  const patchMaterials = useProjectStore((s) => s.patchMaterials);
  // Deleting a material has to know who is using it, so the components are read
  // here rather than the guard being left to the caller.
  const components = useComponentStore((s) => s.components);

  if (!draft) return null;
  const materials = draft.materials;
  const coinArea = coinAreaMm2(materials);
  const hskArea = hskBaseAreaMm2(materials);
  const hskConfigured =
    (materials.hsk_base_thickness_mm?.value ?? 0) > 0 &&
    (materials.hsk_base_k_W_mK.value ?? 0) > 0;
  const assumed = assumedCount(materials);

  const patchLibrary = (next: TimMaterial[]) => patchMaterials({ tim: next });

  // Required constants: the field only ever hands back a real number, so there
  // is no null case to drop here — dropping one was what stopped the box being
  // cleared in the first place.
  const setTim = (id: string, key: 'k_W_mK' | 'blt_mm') => (next: SourcedValue<number> | null) => {
    if (next == null) return;
    patchLibrary(
      materials.tim.map((material) =>
        material.id === id ? { ...material, [key]: next } : material,
      ),
    );
  };

  /** Renaming is safe: components reference the id, not the name. */
  const renameTim = (id: string, name: string) =>
    patchLibrary(materials.tim.map((m) => (m.id === id ? { ...m, name } : m)));

  const addTim = () =>
    patchLibrary([
      ...materials.tim,
      {
        id: nextTimId(materials),
        name: 'New material',
        k_W_mK: sourced(3, 'Assumed', { confidence: 'low' }),
        blt_mm: sourced(0.1, 'Assumed', { confidence: 'low' }),
      },
    ]);

  const removeTim = (id: string) => {
    // Belt and braces: the button is disabled while a material is in use, but
    // the guard lives here too so no caller can orphan a component.
    if (timUsageCount(components, id) > 0) return;
    patchLibrary(materials.tim.filter((material) => material.id !== id));
  };

  const setProcess = (field: ProcessField) => (next: SourcedValue<number> | null) => {
    if (next == null) return;
    patchMaterials({ [field]: next } as Partial<MaterialDefaults>);
  };

  return (
    <SectionCard
      step={step}
      title="Materials & Process Defaults"
      subtitle="材料與製程預設"
      collapsible
      defaultOpen={defaultOpen}
      // Folded, this still has to show the one thing that needs a decision.
      summary={
        <>
          {materials.tim.length} TIM materials · {assumed} shipped defaults in use
          {coinArea == null ? ' · ⚠ coin size not set / 銅塊尺寸未設定' : ''}
          {!hskConfigured ? ' · ⚠ HSK thickness not set / HSK 厚度未設定' : ''}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[12px] leading-relaxed text-ink-500">
          Shared by every component. A component inherits these unless it overrides them, and
          nothing here creates a thermal node or edge.
          <span className="block">
            所有元件共用。元件層可個別覆寫；本區不建立任何 Node/Edge。
          </span>
        </p>

        {/* --- TIM library --- */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">
            Thermal Interface Materials / 熱介面材料
          </legend>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-500">
                  <th className="py-1.5 pr-3 font-semibold">Material / 材料</th>
                  <th className="py-1.5 pr-3 font-semibold">k (W/m·K)</th>
                  <th className="py-1.5 pr-3 font-semibold">BLT (mm)</th>
                  <th className="py-1.5 font-semibold">Used / 使用中</th>
                  <th className="w-8 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {materials.tim.map((material) => {
                  const used = timUsageCount(components, material.id);
                  return (
                    <tr key={material.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-3">
                        <TextInput
                          aria-label={`Name for ${material.name}`}
                          className="h-9"
                          value={material.name}
                          disabled={readOnly}
                          onChange={(event) => renameTim(material.id, event.target.value)}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <MaterialNumber
                          id={`tim-${material.id}-k`}
                          label={`${material.name} k`}
                          zh="導熱係數"
                          value={material.k_W_mK}
                          readOnly={readOnly}
                          onChange={setTim(material.id, 'k_W_mK')}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <MaterialNumber
                          id={`tim-${material.id}-blt`}
                          label={`${material.name} BLT`}
                          zh="壓合厚度"
                          value={material.blt_mm}
                          readOnly={readOnly}
                          onChange={setTim(material.id, 'blt_mm')}
                        />
                      </td>
                      <td className="tabular py-1.5 text-[12px] text-ink-500">
                        {used === 0 ? '—' : used}
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          aria-label={`Delete ${material.name}`}
                          className="rounded p-1 text-ink-400 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={readOnly || used > 0}
                          // A material in use is never deletable: the components
                          // pointing at it would be left with a dangling
                          // reference and their TIM edges would go unresolved
                          // without anybody being told.
                          title={
                            used > 0
                              ? `${used} 顆元件正在使用，請先改指定到其他材料`
                              : 'Delete / 刪除'
                          }
                          onClick={() => removeTim(material.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {materials.tim.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-[12px] text-ink-400">
                      No materials yet — add the ones this project uses.
                      <span className="block">尚未建立材料，請新增本專案會用到的項目。</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Button icon={<Plus size={14} />} disabled={readOnly} onClick={addTim}>
              Add material / 新增材料
            </Button>
            <p className="text-[11px] text-ink-400">
              BLT is what the material compresses to in the build, not its as-supplied thickness. A
              component may override it; k always comes from here.
              <span className="block">
                BLT 為鎖附壓合後的實際厚度，非供應狀態厚度。元件可覆寫 BLT，k 一律取自本表。
              </span>
            </p>
          </div>
        </fieldset>

        {/* --- Shared HSK base ------------------------------------------------ */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">
            HSK Base / 散熱器底座
          </legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                label="Base Material"
                zh="底座材料"
                htmlFor="mat-hsk-material"
                tooltip="選擇共用 HSK Base 的材料；k 會帶入建議值，但仍可依材料證明或實測值修改。"
              />
              <Select
                id="mat-hsk-material"
                value={materials.hsk_base_material}
                disabled={readOnly}
                items={HSK_BASE_MATERIAL_OPTIONS.map((option) => ({
                  value: option.value,
                  label: `${option.label} / ${option.zh}`,
                }))}
                onChange={(event) => {
                  const material = event.target.value as HskBaseMaterial;
                  patchMaterials({
                    hsk_base_material: material,
                    hsk_base_k_W_mK: sourced(hskMaterialDefaultK(material), 'Assumed', {
                      confidence: 'medium',
                    }),
                  });
                }}
              />
            </div>
            <MaterialNumber
              id="mat-hsk-k"
              label="Base k"
              zh="底座導熱係數"
              unit="W/m·K"
              value={materials.hsk_base_k_W_mK}
              readOnly={readOnly}
              onChange={(next) => {
                if (next) patchMaterials({ hsk_base_k_W_mK: next });
              }}
            />
            <MaterialNumber
              id="mat-hsk-thickness"
              label="Base Thickness"
              zh="底座厚度"
              unit="mm"
              value={materials.hsk_base_thickness_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="e.g. 5"
              onChange={(next) => patchMaterials({ hsk_base_thickness_mm: next })}
            />
            <MaterialNumber
              id="mat-hsk-l"
              label="Base L"
              zh="底座長"
              unit="mm"
              value={materials.hsk_base_L_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="e.g. 300"
              onChange={(next) => patchMaterials({ hsk_base_L_mm: next })}
            />
            <MaterialNumber
              id="mat-hsk-w"
              label="Base W"
              zh="底座寬"
              unit="mm"
              value={materials.hsk_base_W_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="e.g. 220"
              onChange={(next) => patchMaterials({ hsk_base_W_mm: next })}
            />
            <div className="flex flex-col justify-end">
              <span className="text-[12px] text-ink-500">Base area / 底座面積</span>
              <span className="tabular text-[13px] font-bold">
                {hskArea == null ? '—' : `${hskArea.toFixed(0)} mm²`}
              </span>
            </div>
          </div>
          <p
            className={`mt-2 text-[11px] leading-relaxed ${
              hskConfigured ? 'text-ink-400' : 'text-warn-600'
            }`}
          >
            {hskConfigured
              ? 'Screen 05 uses this thickness and k with each component’s TIM exit area to resolve TIM HEAT_OUT → HSK Base.'
              : 'Base thickness is required before Screen 05 can resolve TIM HEAT_OUT → HSK Base.'}
            <span className="block">
              {hskConfigured
                ? 'Screen 05 會以此厚度與 k，搭配各元件的 TIM 出口面積，自動計算至 HSK Base 的熱阻。'
                : '必須先設定底座厚度，Screen 05 才能解析 TIM HEAT_OUT → HSK Base。'}
            </span>
          </p>
        </fieldset>

        {/* --- Process constants --- */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">
            Conduction & Process / 導熱與製程
          </legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {PROCESS_FIELDS.map(([field, label, zh, unit]) => (
              <MaterialNumber
                key={field}
                id={`mat-${field}`}
                label={label}
                zh={zh}
                unit={unit === '—' ? undefined : unit}
                tooltip={PROCESS_TOOLTIPS[field]}
                value={materials[field]}
                readOnly={readOnly}
                onChange={setProcess(field)}
              />
            ))}
          </div>
        </fieldset>

        {/* --- Copper coin --- */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">
            Copper Coin / 銅塊
          </legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MaterialNumber
              id="mat-coin-l"
              label="Coin L"
              zh="銅塊長"
              unit="mm"
              value={materials.coin_L_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="e.g. 55"
              onChange={(next) => patchMaterials({ coin_L_mm: next })}
            />
            <MaterialNumber
              id="mat-coin-w"
              label="Coin W"
              zh="銅塊寬"
              unit="mm"
              value={materials.coin_W_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="e.g. 35"
              onChange={(next) => patchMaterials({ coin_W_mm: next })}
            />
            <MaterialNumber
              id="mat-coin-t"
              label="Coin Thickness"
              zh="銅塊厚度"
              unit="mm"
              value={materials.coin_thickness_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="e.g. 2.0"
              onChange={(next) => patchMaterials({ coin_thickness_mm: next })}
            />
            <div className="flex flex-col justify-end">
              <span className="text-[12px] text-ink-500">Coin area / 銅塊面積</span>
              <span className="tabular text-[13px] font-bold">
                {coinArea == null ? '—' : `${coinArea.toFixed(0)} mm²`}
              </span>
            </div>
          </div>
          <p
            className={`mt-2 text-[11px] leading-relaxed ${
              coinArea == null ? 'text-warn-600' : 'text-ink-400'
            }`}
          >
            {coinArea == null
              ? 'Not set — copper-coin components cannot resolve their spreading area until this is stated. It is a mechanical decision with no safe default: a guessed size would move every PA’s margin without saying so.'
              : 'The coin face that meets the heatsink, and how thick it is. One coin serves the whole design, so components read these rather than restating them; the face soldered to the part is that part’s own package outline.'}
            <span className="block">
              {coinArea == null
                ? '未設定 — 銅塊類元件的擴散面積將無法解出。此為機構決策，沒有安全的預設值：亂猜會無聲改變每顆 PA 的溫度餘裕。'
                : '銅塊貼合散熱器那一面的尺寸與厚度。整個設計共用同一種銅塊，因此元件直接讀取此處；與元件焊接的那一面即該元件的封裝外形。'}
            </span>
          </p>
        </fieldset>
      </div>
    </SectionCard>
  );
}
