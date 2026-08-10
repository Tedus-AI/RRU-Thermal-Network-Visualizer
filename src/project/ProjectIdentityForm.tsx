/** Section A — Project Identity (01 §6). */

import { Lock } from 'lucide-react';
import { Field, SectionCard, Select, TextArea, TextInput } from '@/ui/primitives';
import { PROJECT_STAGES, suggestProjectId } from '@/domain/project';
import { useProjectStore } from '@/data/projectStore';
import { useFormTouch, useVisibleError } from './formTouch';
import type { ProjectStage } from '@/domain/project';

export function ProjectIdentityForm({
  errors,
  readOnly,
}: {
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const draft = useProjectStore((s) => s.draft);
  const isNew = useProjectStore((s) => s.isNew);
  const patchProject = useProjectStore((s) => s.patchProject);
  const patchContext = useProjectStore((s) => s.patchContext);
  const touch = useFormTouch((s) => s.touch);
  const visibleError = useVisibleError(errors);

  if (!draft) return null;

  // 01 §6.2: after the first save the Project ID is the primary key and is no
  // longer editable through the ordinary form — renaming needs a clone workflow.
  const idLocked = readOnly || !isNew;

  const handleNameChange = (value: string) => {
    touch('project_name');
    if (isNew) touch('project_id');
    if (isNew) {
      const previousSuggestion = suggestProjectId(draft.project_name);
      // Keep auto-deriving the ID until the user types their own.
      if (!draft.project_id || draft.project_id === previousSuggestion) {
        patchProject({ project_name: value, project_id: suggestProjectId(value) });
        return;
      }
    }
    patchProject({ project_name: value });
  };

  return (
    <SectionCard step={1} title="Project Identity">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
        <Field
          label="Project Name"
          htmlFor="project_name"
          required
          error={visibleError('project_name')}
        >
          <TextInput
            id="project_name"
            value={draft.project_name}
            maxLength={80}
            disabled={readOnly}
            onBlur={() => touch('project_name')}
            invalid={Boolean(visibleError('project_name'))}
            placeholder="CBNG FR1 RRU EVT2"
            onChange={(event) => handleNameChange(event.target.value)}
          />
        </Field>

        <Field label="Project Owner" htmlFor="owner">
          <TextInput
            id="owner"
            value={draft.project_context.owner}
            disabled={readOnly}
            placeholder="Thermal engineer or project owner"
            onChange={(event) => patchContext({ owner: event.target.value })}
          />
        </Field>

        <Field
          label="Project ID"
          htmlFor="project_id"
          required
          error={visibleError('project_id')}
          hint={
            idLocked && !readOnly
              ? 'Locked after the first save. Use Duplicate Project to create a new ID.'
              : 'Database key: letters, digits, underscore or hyphen, 3–64 characters.'
          }
        >
          <div className="relative">
            <TextInput
              id="project_id"
              value={draft.project_id}
              disabled={idLocked}
              invalid={Boolean(visibleError('project_id'))}
              placeholder="CBNG_FR1_RRU_EVT2"
              className={`font-mono ${idLocked ? 'pr-9' : ''}`}
              onBlur={() => touch('project_id')}
              onChange={(event) => {
                touch('project_id');
                patchProject({ project_id: event.target.value });
              }}
            />
            {idLocked && (
              <Lock
                size={14}
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-400"
              />
            )}
          </div>
        </Field>

        <Field label="Project Stage" htmlFor="project_stage">
          <Select
            id="project_stage"
            options={PROJECT_STAGES}
            value={draft.project_context.project_stage}
            disabled={readOnly}
            onChange={(event) =>
              patchContext({ project_stage: event.target.value as ProjectStage })
            }
          />
        </Field>

        <Field label="Customer / Program" htmlFor="customer">
          <TextInput
            id="customer"
            value={draft.project_context.customer}
            disabled={readOnly}
            placeholder="CBNG / Verizon"
            onChange={(event) => patchContext({ customer: event.target.value })}
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <TextArea
            id="description"
            rows={3}
            value={draft.project_context.description}
            disabled={readOnly}
            placeholder="FR1 outdoor RRU thermal network development"
            onChange={(event) => patchContext({ description: event.target.value })}
          />
        </Field>
      </div>
    </SectionCard>
  );
}
