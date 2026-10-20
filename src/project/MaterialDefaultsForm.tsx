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
 *
 * The section explains itself only where something is missing. It used to
 * carry four standing paragraphs (what the section is, what BLT means, how the
 * base spreading works, what the coin is), which read the same every visit; the
 * BLT definition is now the column's tooltip, and the base and coin say one
 * line each, in amber, while the numbers a calculation needs are not there.
 */

import { useEffect, useState } from 'react';

import { Info, Link2, Plus, Scissors, Trash2 } from 'lucide-react';

import { Button, NumberInput, SectionCard, Select, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
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
import { timCatalogStateText, useTimCatalogStore } from '@/data/timCatalogStore';
import {
  catalogReference,
  followCatalog,
  linkToCatalog,
  sameName,
  timFromCatalog,
  type CatalogChange,
  type TimCatalogMaterial,
} from '@/domain/timCatalog';
import { TimCatalogPicker } from './TimCatalogPicker';

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
  showLabel = true,
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
  /** false inside a table, where the column header already names the value. */
  showLabel?: boolean;
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
      {showLabel && <FieldLabel label={label} zh={zh} unit={unit} tooltip={tooltip} htmlFor={id} />}
      <NumberInput
        id={id}
        aria-label={showLabel ? undefined : `${label}：${zh}`}
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
  defaultOpen = true,
}: {
  readOnly: boolean;
  /** Open on Screen 01; Screen 02, where it is a side trip from the import, passes false. */
  defaultOpen?: boolean;
}) {
  const draft = useProjectStore((s) => s.draft);
  const patchMaterials = useProjectStore((s) => s.patchMaterials);
  // Deleting a material has to know who is using it, so the components are read
  // here rather than the guard being left to the caller.
  const components = useComponentStore((s) => s.components);
  // TIM 管理工具's catalog: linked materials take its name and k (read once per session).
  const catalog = useTimCatalogStore((s) => s.catalog);
  const catalogState = useTimCatalogStore((s) => s.state);
  const catalogError = useTimCatalogStore((s) => s.error);
  const loadCatalog = useTimCatalogStore((s) => s.load);
  const [picking, setPicking] = useState(false);
  const [followed, setFollowed] = useState<CatalogChange[]>([]);
  const linkedCount = draft?.materials.tim.filter((m) => m.catalog).length ?? 0;

  useEffect(() => {
    if (linkedCount > 0) void loadCatalog();
  }, [linkedCount, loadCatalog]);

  // Linked materials follow the TIM manager. A read-only project shows what would change instead.
  const library = draft?.materials.tim;
  useEffect(() => {
    if (!catalog || !library || readOnly) return;
    const result = followCatalog(library, catalog);
    if (result.tim !== library) {
      patchMaterials({ tim: result.tim });
      setFollowed(result.changed);
    }
  }, [catalog, library, readOnly, patchMaterials]);

  if (!draft) return null;
  const materials = draft.materials;
  const coinArea = coinAreaMm2(materials);
  const hskArea = hskBaseAreaMm2(materials);
  // L and W joined this list when the HSK-base edge became a spreading
  // calculation: the fan-out is set by how much base the heat has to spread
  // into, so without the envelope there is no answer to compute.
  const hskConfigured =
    (materials.hsk_base_thickness_mm?.value ?? 0) > 0 &&
    (materials.hsk_base_k_W_mK.value ?? 0) > 0 &&
    hskArea != null;
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
        name: '新材料',
        k_W_mK: sourced(3, 'Assumed', { confidence: 'low' }),
        blt_mm: sourced(0.1, 'Assumed', { confidence: 'low' }),
      },
    ]);

  /** Picked in 「從 TIM 管理工具帶入」: a same-name material is linked, the rest are added. */
  const addFromCatalog = (picked: TimCatalogMaterial[]) => {
    let next = materials.tim;
    for (const source of picked) {
      if (next.some((m) => m.catalog?.id === source.id)) continue;
      const same = next.find((m) => !m.catalog && sameName(m, source));
      if (same) {
        next = next.map((m) => (m.id === same.id ? linkToCatalog(m, source) : m));
        continue;
      }
      next = [...next, timFromCatalog(source, nextTimId({ ...materials, tim: next }))];
    }
    const result = catalog ? followCatalog(next, catalog) : { tim: next, changed: [] };
    patchLibrary(result.tim);
    setFollowed(result.changed);
    setPicking(false);
  };

  /** ✂ Back to a material this project defines; the name and k it has now stay. */
  const unlinkTim = (id: string) =>
    patchLibrary(
      materials.tim.map((m) => {
        if (m.id !== id) return m;
        const { catalog: _drop, ...rest } = m;
        void _drop;
        return rest;
      }),
    );

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

  const material = HSK_BASE_MATERIAL_OPTIONS.find(
    (option) => option.value === materials.hsk_base_material,
  );
  const dims = (...values: Array<SourcedValue<number> | null | undefined>) =>
    values.map((value) => (value?.value == null ? '?' : String(value.value))).join('×');

  return (
    <SectionCard
      title="材料與製程預設"
      collapsible
      defaultOpen={defaultOpen}
      // Folded, this still has to show what is set and the one thing that needs a decision.
      summary={
        <>
          {materials.tim.length} 種 TIM · 底座 {material?.zh ?? materials.hsk_base_material}{' '}
          {dims(materials.hsk_base_L_mm, materials.hsk_base_W_mm, materials.hsk_base_thickness_mm)}{' '}
          mm · 銅塊 {dims(materials.coin_L_mm, materials.coin_W_mm, materials.coin_thickness_mm)} mm
          {assumed > 0 ? ` · ${assumed} 項出廠預設` : ''}
          {coinArea == null ? ' · ⚠ 銅塊尺寸未填' : ''}
          {!hskConfigured ? ' · ⚠ 底座資料未齊' : ''}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[12px] text-ink-400">
          所有元件共用，元件可個別覆寫。<span className="text-ink-500">灰字</span>
          ＝出廠預設值，尚未確認。
        </p>

        {/* --- TIM library --- */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">熱介面材料（TIM）</legend>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-500">
                  <th className="py-1.5 pr-3 font-semibold">材料</th>
                  <th className="w-36 py-1.5 pr-3 font-semibold">
                    k <span className="font-normal text-ink-400">(W/m·K)</span>
                  </th>
                  <th className="w-36 py-1.5 pr-3 font-semibold">
                    <BilingualTooltip
                      align="left"
                      zh="壓合後的實際厚度，不是材料原始片厚。元件可個別覆寫 BLT，k 一律取自這張表。"
                    >
                      BLT <span className="font-normal text-ink-400">(mm)</span>
                      <Info size={12} className="text-ink-400" aria-hidden />
                    </BilingualTooltip>
                  </th>
                  <th className="w-20 py-1.5 pr-3 text-right font-semibold">使用中</th>
                  <th className="w-8 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {materials.tim.map((material) => {
                  const used = timUsageCount(components, material.id);
                  const source = material.catalog
                    ? catalog?.materials.find((m) => m.id === material.catalog?.id)
                    : undefined;
                  // A linked material whose catalog entry is gone keeps what it has (only said when the catalog was read).
                  const gone = Boolean(material.catalog && catalog && !source);
                  return (
                    <tr key={material.id} className="border-b border-line/60">
                      <td className="py-1 pr-3">
                        {material.catalog ? (
                          // Linked: the name comes from the TIM manager — plain text, not a box.
                          <div className="flex min-h-8 items-center gap-2">
                            <span className="truncate font-semibold text-ink-900" title={material.name}>
                              {material.name}
                            </span>
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded bg-accent-100 px-1.5 py-0.5 text-[11px] font-bold text-accent-600"
                              title={
                                source
                                  ? `${catalogReference(source)}\n名稱與 k 跟著 TIM 管理工具；BLT 在這裡填`
                                  : `連結 TIM 管理工具的材料（${material.catalog.id}）\n${timCatalogStateText(catalogState, catalogError) || '名稱與 k 跟著 TIM 管理工具'}`
                              }
                            >
                              <Link2 size={11} aria-hidden />
                              TIM 管理工具
                            </span>
                            {!readOnly && (
                              <button
                                type="button"
                                aria-label={`解除 ${material.name} 與 TIM 管理工具的連結`}
                                title="解除連結：改回本專案自行維護（保留目前的名稱與 k）"
                                className="shrink-0 rounded p-1 text-ink-400 hover:text-ink-900"
                                onClick={() => unlinkTim(material.id)}
                              >
                                <Scissors size={13} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <TextInput
                            aria-label={`${material.name} 名稱`}
                            className="h-8"
                            value={material.name}
                            disabled={readOnly}
                            onChange={(event) => renameTim(material.id, event.target.value)}
                          />
                        )}
                        {gone && (
                          <p className="mt-0.5 text-[11px] text-warn-600">TIM 管理工具已刪除這種材料，保留目前的值</p>
                        )}
                      </td>
                      <td className="py-1 pr-3">
                        {material.catalog ? (
                          <span
                            className="tabular inline-flex min-h-8 items-center px-1 text-[13px] text-ink-900"
                            title={material.k_W_mK.reference ?? '依 TIM 管理工具'}
                          >
                            {material.k_W_mK.value ?? '—'}
                          </span>
                        ) : (
                          <MaterialNumber
                            id={`tim-${material.id}-k`}
                            label={material.name}
                            zh="k"
                            showLabel={false}
                            value={material.k_W_mK}
                            readOnly={readOnly}
                            onChange={setTim(material.id, 'k_W_mK')}
                          />
                        )}
                      </td>
                      <td className="py-1 pr-3">
                        <MaterialNumber
                          id={`tim-${material.id}-blt`}
                          label={material.name}
                          zh="BLT"
                          showLabel={false}
                          value={material.blt_mm}
                          readOnly={readOnly}
                          onChange={setTim(material.id, 'blt_mm')}
                        />
                      </td>
                      <td className="tabular py-1 pr-3 text-right text-[12px] text-ink-500">
                        {used === 0 ? '—' : `${used} 顆`}
                      </td>
                      <td className="py-1">
                        <button
                          type="button"
                          aria-label={`刪除 ${material.name}`}
                          className="rounded p-1 text-ink-400 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={readOnly || used > 0}
                          // A material in use is never deletable: the components
                          // pointing at it would be left with a dangling
                          // reference and their TIM edges would go unresolved
                          // without anybody being told.
                          title={
                            used > 0 ? `${used} 顆元件正在使用，請先改用其他材料` : '刪除'
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
                      尚未建立材料，請新增本專案會用到的項目。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {followed.length > 0 && (
            <p className="mt-2 text-[12px] text-ok-600">
              已依 TIM 管理工具更新：
              {followed.map((change) => `${change.name}（${change.what.join('、')}）`).join('；')}
            </p>
          )}
          {readOnly && catalog && followCatalog(materials.tim, catalog).changed.length > 0 && (
            <p className="mt-2 text-[12px] text-warn-600">
              TIM 管理工具有更新的名稱或 k，取得編輯權後會自動套用。
            </p>
          )}
          <Button
            className="mt-2 mr-2 h-8"
            icon={<Link2 size={14} />}
            disabled={readOnly}
            title="從 TIM 管理工具的材料庫（TIM 型號目錄）選材料加入；名稱與 k 之後跟著 TIM 管理工具"
            onClick={() => {
              // Opening the picker is a reason to look again: someone may have just added the material.
              void loadCatalog(catalogState !== 'ok');
              setPicking(true);
            }}
          >
            從 TIM 管理工具帶入
          </Button>
          <Button className="mt-2 h-8" icon={<Plus size={14} />} disabled={readOnly} onClick={addTim}>
            新增材料
          </Button>
          {picking && (
            <TimCatalogPicker
              library={materials.tim}
              catalog={catalog}
              state={catalogState}
              error={catalogError}
              onPick={addFromCatalog}
              onClose={() => setPicking(false)}
            />
          )}
        </fieldset>

        {/* --- Shared HSK base ------------------------------------------------ */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">散熱器底座</legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                label="Base Material"
                zh="材料"
                htmlFor="mat-hsk-material"
                tooltip="選材料會帶入建議的 k；有材料證明或實測值時可再修改 k。"
              />
              <Select
                id="mat-hsk-material"
                value={materials.hsk_base_material}
                disabled={readOnly}
                items={HSK_BASE_MATERIAL_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.zh,
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
              zh="k"
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
              zh="厚度"
              unit="mm"
              value={materials.hsk_base_thickness_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="例：5"
              onChange={(next) => patchMaterials({ hsk_base_thickness_mm: next })}
            />
            <MaterialNumber
              id="mat-hsk-l"
              label="Base L"
              zh="長 L"
              unit="mm"
              value={materials.hsk_base_L_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="例：300"
              onChange={(next) => patchMaterials({ hsk_base_L_mm: next })}
            />
            <MaterialNumber
              id="mat-hsk-w"
              label="Base W"
              zh="寬 W"
              unit="mm"
              value={materials.hsk_base_W_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="例：220"
              onChange={(next) => patchMaterials({ hsk_base_W_mm: next })}
            />
            <div className="flex flex-col justify-end">
              <span className="text-[12px] text-ink-500">面積</span>
              <span className="tabular text-[13px] leading-9 font-bold">
                {hskArea == null ? '—' : `${hskArea.toFixed(0)} mm²`}
              </span>
            </div>
          </div>
          {!hskConfigured && (
            <p className="mt-2 text-[12px] text-warn-600">
              ⚠ 厚度、k、長 × 寬未填齊 → 05 無法算出到散熱器底座的擴散熱阻。
            </p>
          )}
        </fieldset>

        {/* --- Process constants --- */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">導熱與製程</legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            <span title="銅塊貼合散熱器那一面的尺寸與厚度；整個設計共用同一種銅塊。">銅塊</span>
          </legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MaterialNumber
              id="mat-coin-l"
              label="Coin L"
              zh="長 L"
              unit="mm"
              value={materials.coin_L_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="例：55"
              onChange={(next) => patchMaterials({ coin_L_mm: next })}
            />
            <MaterialNumber
              id="mat-coin-w"
              label="Coin W"
              zh="寬 W"
              unit="mm"
              value={materials.coin_W_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="例：35"
              onChange={(next) => patchMaterials({ coin_W_mm: next })}
            />
            <MaterialNumber
              id="mat-coin-t"
              label="Coin Thickness"
              zh="厚度"
              unit="mm"
              value={materials.coin_thickness_mm}
              readOnly={readOnly}
              allowEmpty
              placeholder="例：2.0"
              onChange={(next) => patchMaterials({ coin_thickness_mm: next })}
            />
            <div className="flex flex-col justify-end">
              <span className="text-[12px] text-ink-500">面積</span>
              <span className="tabular text-[13px] leading-9 font-bold">
                {coinArea == null ? '—' : `${coinArea.toFixed(0)} mm²`}
              </span>
            </div>
          </div>
          {coinArea == null && (
            <p className="mt-2 text-[12px] text-warn-600">
              ⚠ 銅塊尺寸未填 → 銅塊類元件無法計算擴散面積。這是機構決策，沒有安全的預設值。
            </p>
          )}
        </fieldset>
      </div>
    </SectionCard>
  );
}
