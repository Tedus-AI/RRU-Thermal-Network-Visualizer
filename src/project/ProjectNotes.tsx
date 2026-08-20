/** Section E — Project Notes / Thermal Assumptions (01 §9). Plain text in V1. */

import { SectionCard, TextArea } from '@/ui/primitives';
import { useProjectStore } from '@/data/projectStore';

export function ProjectNotes({ readOnly }: { readOnly: boolean }) {
  const draft = useProjectStore((s) => s.draft);
  const patchContext = useProjectStore((s) => s.patchContext);
  if (!draft) return null;
  const notes = draft.project_context.notes;

  return (
    <SectionCard
      step={5}
      title="Project Notes / Thermal Assumptions"
      subtitle="專案備註與熱設計假設"
      collapsible
      summary={
        notes.trim()
          ? `${notes.trim().length} characters / ${notes.trim().length} 個字`
          : 'Empty / 尚未填寫'
      }
    >
      <TextArea
        aria-label="Project notes and thermal assumptions"
        rows={5}
        value={notes}
        disabled={readOnly}
        placeholder={
          'Customer thermal requirement, GR-487 assumptions, solar condition, ' +
          'known hardware restrictions, special test conditions…'
        }
        onChange={(event) => patchContext({ notes: event.target.value })}
      />
    </SectionCard>
  );
}
