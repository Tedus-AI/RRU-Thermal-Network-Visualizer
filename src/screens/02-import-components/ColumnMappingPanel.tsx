/** Section D — Column Mapping (02 §11, §12, §13). */

import { useMemo } from 'react';
import { ArrowRight, Eraser, Wand2 } from 'lucide-react';
import { Badge, Button, SectionCard } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import { useComponentImportStore } from '@/data/componentImportStore';
import {
  CANONICAL_FIELDS,
  IGNORE_COLUMN,
  RECOMMENDED_FIELDS,
  REQUIRED_FIELDS,
  type MappingTarget,
} from '@/importers/component/types';
import { tip } from '@/i18n/componentImportCopy';

const FIELD_ZH: Record<string, string> = {
  Component: '元件名稱',
  Qty: '數量',
  'Power(W)': '功耗',
  Category: '類別',
  'Limit(C)': '限制溫度',
  R_jc: '熱阻',
  Board_Type: '板材類型',
  TIM_Type: '導熱介質',
  Pad_L: 'Pad 長',
  Pad_W: 'Pad 寬',
  'Thick(mm)': '厚度',
  [IGNORE_COLUMN]: '略過此欄',
};

export function ColumnMappingPanel() {
  const table = useComponentImportStore((s) => s.table);
  const mapping = useComponentImportStore((s) => s.mapping);
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

  const unmappedColumns = mapping.filter((target) => target === IGNORE_COLUMN).length;
  const missingRecommended = RECOMMENDED_FIELDS.filter((field) => !mapping.includes(field));

  return (
    <SectionCard
      step={2}
      title="Column Mapping"
      subtitle="欄位對應"
      actions={
        <div className="flex gap-2">
          <Button icon={<Wand2 size={14} />} onClick={autoMap}>
            Auto Map / 自動對應
          </Button>
          <Button variant="danger" icon={<Eraser size={14} />} onClick={clearMapping}>
            Clear / 清除
          </Button>
        </div>
      }
    >
      {unmappedRequired.length === 0 ? (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-ok-600">
          <span aria-hidden>✓</span>
          All required columns mapped automatically / 必要欄位皆已自動對應
        </p>
      ) : (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-danger-600">
          <span aria-hidden>⚠</span>
          Required column{unmappedRequired.length > 1 ? 's' : ''} not mapped:{' '}
          {unmappedRequired.join(', ')} / 尚有必要欄位未對應
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 lg:grid-cols-2">
        {table.headers.map((header, index) => {
          const target = mapping[index];
          const id = `map-${index}`;
          return (
            <div key={`${header}-${index}`} className="flex items-center gap-2">
              <span
                className="tabular w-40 shrink-0 truncate rounded border border-line bg-surface-muted px-2 py-1.5 text-[12px] text-ink-700"
                title={header}
              >
                {header || <em className="text-ink-400">(blank)</em>}
              </span>
              <ArrowRight size={14} className="shrink-0 text-ink-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <label htmlFor={id} className="sr-only">
                  Target field for column {header}
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
                  <option value={IGNORE_COLUMN}>
                    {IGNORE_COLUMN} / {FIELD_ZH[IGNORE_COLUMN]}
                  </option>
                  {CANONICAL_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {field} / {FIELD_ZH[field]}
                      {REQUIRED_FIELDS.includes(field) ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[12px] text-ink-500">
        <FieldLabel label="Column Mapping" zh="欄位對應" tooltip={tip('Column Mapping')} />
        <span className="tabular">Unmapped columns / 未對應欄位: {unmappedColumns}</span>
        {missingRecommended.length > 0 && (
          <Badge tone="warn">Missing recommended: {missingRecommended.join(', ')} / 建議補齊</Badge>
        )}
      </div>
    </SectionCard>
  );
}
