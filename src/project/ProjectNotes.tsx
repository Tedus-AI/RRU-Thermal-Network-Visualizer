/** Section D — 備註 (01 §9 Project Notes / Thermal Assumptions). Plain text in V1. */

import { SectionCard, TextArea } from '@/ui/primitives';
import { useProjectStore } from '@/data/projectStore';

export function ProjectNotes({ readOnly }: { readOnly: boolean }) {
  const draft = useProjectStore((s) => s.draft);
  const patchContext = useProjectStore((s) => s.patchContext);
  if (!draft) return null;
  const notes = draft.project_context.notes;
  const length = notes.trim().length;

  return (
    <SectionCard
      title="備註"
      collapsible
      summary={length > 0 ? `${length} 字` : '尚未填寫'}
    >
      <TextArea
        aria-label="備註與熱設計假設"
        rows={5}
        value={notes}
        disabled={readOnly}
        placeholder="客戶熱需求、GR-487 假設、日照條件、已知硬體限制、特殊測試條件…"
        onChange={(event) => patchContext({ notes: event.target.value })}
      />
    </SectionCard>
  );
}
