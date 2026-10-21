/** Step 2 — column mapping (02 §11, §12, §13). */

import { useMemo } from 'react';
import { ArrowRight, Eraser, Wand2 } from 'lucide-react';
import { Badge, Button, SectionCard } from '@/ui/primitives';
import { useComponentImportStore } from '@/data/componentImportStore';
import {
  CANONICAL_FIELDS,
  IGNORE_COLUMN,
  RECOMMENDED_FIELDS,
  REQUIRED_FIELDS,
  type MappingTarget,
} from '@/importers/component/types';

/** The target fields by their Chinese names — what the dropdown shows. */
export const FIELD_ZH: Record<string, string> = {
  Component: '元件名稱',
  Qty: '數量',
  'Power(W)': '單顆功耗（W）',
  Category: '分類',
  'Limit(C)': '限溫（°C）',
  R_jc: 'Rjc（°C/W）',
  Package: '封裝型式',
  Package_L: '本體長（mm）',
  Package_W: '本體寬（mm）',
  Package_H: '本體高（mm）',
  Heat_Path: '散熱路徑',
  TIM_Type: 'TIM 材料',
  TIM_BLT: 'TIM 壓合厚度（mm）',
  Source_L: '熱源面長（mm）',
  Source_W: '熱源面寬（mm）',
  'Thick(mm)': '板厚／銅塊厚（mm）',
  [IGNORE_COLUMN]: '略過此欄',
};

/** This tool's own bookkeeping columns (`_ref_origin_*`, `_ref_spec`) — never something to map. */
const isInternal = (header: string) => header.startsWith('_ref_');

export function ColumnMappingPanel() {
  const table = useComponentImportStore((s) => s.table);
  const mapping = useComponentImportStore((s) => s.mapping);
  const mappingAuto = useComponentImportStore((s) => s.mappingAuto);
  const setMappingFor = useComponentImportStore((s) => s.setMappingFor);
  const autoMap = useComponentImportStore((s) => s.autoMap);
  const clearMapping = useComponentImportStore((s) => s.clearMapping);
  // Derive locally: a selector returning a fresh array every render would make
  // useSyncExternalStore see a new snapshot each time and loop forever.
  const unmappedRequired = useMemo(
    () => REQUIRED_FIELDS.filter((field) => !mapping.includes(field)),
    [mapping],
  );

  if (!table) return null;

  // A source whose columns are this tool's own maps completely; its remaining
  // columns are values kept on the component's 來源 tab, not choices to make.
  const shown = table.headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => !isInternal(header) && !(mappingAuto && mapping[index] === IGNORE_COLUMN));
  const kept = table.headers.filter(
    (header, index) => !isInternal(header) && mapping[index] === IGNORE_COLUMN,
  ).length;
  const missingRecommended = RECOMMENDED_FIELDS.filter((field) => !mapping.includes(field));

  return (
    <SectionCard
      title="對應欄位"
      actions={
        <div className="flex gap-2">
          <Button icon={<Wand2 size={14} />} onClick={autoMap}>
            自動對應
          </Button>
          <Button variant="danger" icon={<Eraser size={14} />} onClick={clearMapping}>
            清除
          </Button>
        </div>
      }
    >
      {unmappedRequired.length === 0 ? (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-ok-600">
          <span aria-hidden>✓</span>
          {mappingAuto ? '全部欄位已自動對應' : '必要欄位都已對應'}
        </p>
      ) : (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-danger-600">
          <span aria-hidden>⚠</span>
          必要欄位還沒對應：{unmappedRequired.map((field) => FIELD_ZH[field] ?? field).join('、')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 lg:grid-cols-2">
        {shown.map(({ header, index }) => {
          const target = mapping[index];
          const id = `map-${index}`;
          return (
            <div key={`${header}-${index}`} className="flex items-center gap-2">
              <span
                className="tabular w-40 shrink-0 truncate rounded border border-line bg-surface-muted px-2 py-1.5 text-[12px] text-ink-700"
                title={header}
              >
                {header || <em className="text-ink-400">（空白）</em>}
              </span>
              <ArrowRight size={14} className="shrink-0 text-ink-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <label htmlFor={id} className="sr-only">
                  欄位「{header}」對應到
                </label>
                <select
                  id={id}
                  value={target}
                  onChange={(event) => setMappingFor(index, event.target.value as MappingTarget)}
                  className={`h-8 w-full rounded-md border bg-surface px-2 text-[12px] ${
                    target === IGNORE_COLUMN
                      ? 'border-line text-ink-400'
                      : 'border-accent-600/40 font-medium text-ink-900'
                  }`}
                >
                  <option value={IGNORE_COLUMN}>{FIELD_ZH[IGNORE_COLUMN]}</option>
                  {CANONICAL_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {FIELD_ZH[field] ?? field}
                      {REQUIRED_FIELDS.includes(field) ? '＊' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[12px] text-ink-500">
        {kept > 0 && <span>另有 {kept} 欄不對應，保留在元件的「來源」分頁。</span>}
        {missingRecommended.length > 0 && (
          <Badge tone="warn">
            建議補齊：{missingRecommended.map((field) => FIELD_ZH[field] ?? field).join('、')}
          </Badge>
        )}
      </div>
    </SectionCard>
  );
}
