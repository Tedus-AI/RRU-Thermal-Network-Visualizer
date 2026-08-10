/** Section D — Project Notes / Thermal Assumptions (01 §9). Plain text in V1. */

import { SectionCard, TextArea } from '@/ui/primitives';
import { useProjectStore } from '@/data/projectStore';

export function ProjectNotes({ readOnly }: { readOnly: boolean }) {
  const draft = useProjectStore((s) => s.draft);
  const patchContext = useProjectStore((s) => s.patchContext);
  if (!draft) return null;

  return (
    <SectionCard step={4} title="Project Notes / Thermal Assumptions">
      <TextArea
        aria-label="Project notes and thermal assumptions"
        rows={5}
        value={draft.project_context.notes}
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
