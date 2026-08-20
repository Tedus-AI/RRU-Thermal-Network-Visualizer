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

import { NumberInput, SectionCard } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import {
  PROCESS_FIELDS,
  TIM_MATERIAL_TYPES,
  assumedCount,
  coinAreaMm2,
  type MaterialDefaults,
  type ProcessField,
  type TimMaterialType,
} from '@/domain/materials';
import { withValue, type SourcedValue } from '@/domain/sourcedValue';
import { useProjectStore } from '@/data/projectStore';

/**
 * A number whose provenance is visible: a value still carrying the shipped
 * constant reads as muted, a stated one as normal weight. An engineer reviewing
 * a report needs to see at a glance which numbers anybody actually chose.
 */
function MaterialNumber({
  id,
  label,
  zh,
  unit,
  value,
  readOnly,
  placeholder = '—',
  onChange,
}: {
  id: string;
  label: string;
  zh: string;
  unit?: string;
  value: SourcedValue<number> | null;
  readOnly: boolean;
  placeholder?: string;
  onChange: (next: SourcedValue<number> | null) => void;
}) {
  const isAssumed = value?.source === 'Assumed';
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} unit={unit} htmlFor={id} />
      <NumberInput
        id={id}
        step="any"
        className={isAssumed ? 'text-ink-500' : undefined}
        value={value?.value ?? ''}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(event) =>
          onChange(
            event.target.value === ''
              ? null
              : // Typing a value is what turns a shipped constant into a decision.
                withValue(value, Number(event.target.value), 'Manual'),
          )
        }
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

  if (!draft) return null;
  const materials = draft.materials;
  const coinArea = coinAreaMm2(materials);
  const assumed = assumedCount(materials);

  const setTim = (type: TimMaterialType, key: 'k_W_mK' | 'blt_mm') => (next: SourcedValue<number> | null) => {
    if (next == null) return;
    patchMaterials({ tim: { ...materials.tim, [type]: { ...materials.tim[type], [key]: next } } });
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
          {assumed} shipped defaults in use
          {coinArea == null ? ' · ⚠ coin size not set / 銅塊尺寸未設定' : ''}
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

        {/* --- TIM materials --- */}
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">
            Thermal Interface Materials / 熱介面材料
          </legend>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-500">
                  <th className="py-1.5 pr-3 font-semibold">Material / 材料</th>
                  <th className="py-1.5 pr-3 font-semibold">k (W/m·K)</th>
                  <th className="py-1.5 font-semibold">BLT (mm)</th>
                </tr>
              </thead>
              <tbody>
                {TIM_MATERIAL_TYPES.map((type) => (
                  <tr key={type} className="border-b border-line/60">
                    <td className="py-1.5 pr-3 font-medium text-ink-700">{type}</td>
                    <td className="py-1.5 pr-3">
                      <MaterialNumber
                        id={`tim-${type}-k`}
                        label={`${type} k`}
                        zh="導熱係數"
                        value={materials.tim[type].k_W_mK}
                        readOnly={readOnly}
                        onChange={setTim(type, 'k_W_mK')}
                      />
                    </td>
                    <td className="py-1.5">
                      <MaterialNumber
                        id={`tim-${type}-blt`}
                        label={`${type} BLT`}
                        zh="壓合厚度"
                        value={materials.tim[type].blt_mm}
                        readOnly={readOnly}
                        onChange={setTim(type, 'blt_mm')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            BLT is what the material compresses to in the build, not its as-supplied thickness.
            <span className="block">BLT 為鎖附壓合後的實際厚度，非供應狀態的厚度。</span>
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
            Copper Coin Size / 銅塊尺寸
          </legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MaterialNumber
              id="mat-coin-l"
              label="Coin L"
              zh="銅塊長"
              unit="mm"
              value={materials.coin_L_mm}
              readOnly={readOnly}
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
              placeholder="e.g. 35"
              onChange={(next) => patchMaterials({ coin_W_mm: next })}
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
              : 'The coin face that meets the heatsink. The face soldered to the part is the component’s own Source L × W.'}
            <span className="block">
              {coinArea == null
                ? '未設定 — 銅塊類元件的擴散面積將無法解出。此為機構決策，沒有安全的預設值：亂猜會無聲改變每顆 PA 的溫度餘裕。'
                : '銅塊貼合散熱器那一面的尺寸。與元件焊接的那一面請填在元件的 Source L × W。'}
            </span>
          </p>
        </fieldset>
      </div>
    </SectionCard>
  );
}
