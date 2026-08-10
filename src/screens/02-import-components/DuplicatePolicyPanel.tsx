/** Section E — Duplicate Handling (02 §17). */

import { SectionCard } from '@/ui/primitives';
import { useComponentImportStore } from '@/data/componentImportStore';
import { DUPLICATE_POLICIES, type DuplicatePolicy } from '@/importers/component/types';

const POLICY_COPY: Record<DuplicatePolicy, { label: string; zh: string; detail: string }> = {
  SKIP: {
    label: 'Skip Duplicates',
    zh: '跳過重複（保留現有）',
    detail: 'Keep the existing component untouched and drop the incoming row.',
  },
  REPLACE: {
    label: 'Replace Existing',
    zh: '取代現有資料',
    detail:
      'Overwrite component-owned fields with the imported values. Unknown metadata is preserved.',
  },
  MERGE_NON_EMPTY: {
    label: 'Merge Non-empty Fields',
    zh: '合併非空欄位',
    detail:
      'Imported non-empty values replace the target field; imported empty values keep what exists.',
  },
  NEW_VARIANT: {
    label: 'New Variant',
    zh: '建立新版本',
    detail: 'Import as a separate component, suffixed "(Imported)".',
  },
};

export function DuplicatePolicyPanel() {
  const sessionPolicy = useComponentImportStore((s) => s.sessionPolicy);
  const setSessionPolicy = useComponentImportStore((s) => s.setSessionPolicy);
  const rows = useComponentImportStore((s) => s.rows);

  const duplicates = rows.filter((row) => row.duplicate_of != null).length;
  const overrides = rows.filter((row) => row.duplicate_action != null).length;

  return (
    <SectionCard step={4} title="Duplicate Handling" subtitle="重複項處理">
      <p className="mb-3 text-[12px] text-ink-500">
        Matched by <strong className="text-ink-700">Component name + Category</strong>.{' '}
        {duplicates} duplicate row{duplicates === 1 ? '' : 's'} detected.
        <span className="block text-ink-400">
          以「元件名稱 + 類別」比對，偵測到 {duplicates} 筆重複；可於表格逐列覆寫。
        </span>
      </p>

      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="sr-only">Duplicate policy</legend>
        {DUPLICATE_POLICIES.map((policy) => {
          const copy = POLICY_COPY[policy];
          const selected = sessionPolicy === policy;
          return (
            <label
              key={policy}
              className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors ${
                selected
                  ? 'border-accent-600 bg-accent-50'
                  : 'border-line bg-surface hover:border-ink-400'
              }`}
            >
              <input
                type="radio"
                name="duplicate-policy"
                value={policy}
                checked={selected}
                onChange={() => setSessionPolicy(policy)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-600)]"
              />
              <span className="leading-snug">
                <span className="block text-[13px] font-semibold text-ink-900">
                  {copy.label}
                  <span className="ml-1.5 font-normal text-ink-400">/ {copy.zh}</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-500">{copy.detail}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {overrides > 0 && (
        <p className="mt-3 text-[12px] text-accent-700">
          {overrides} row{overrides === 1 ? '' : 's'} override the session policy. / 有{' '}
          {overrides} 筆使用逐列覆寫設定。
        </p>
      )}
    </SectionCard>
  );
}
