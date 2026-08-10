/**
 * Duplicate Project (01 §16).
 *
 * FloTHERM mapping and solver results default to OFF because both are tied to a
 * specific geometry/scenario version — copying them would carry provenance that
 * no longer describes the new project (00 §16, Rule 3).
 */

import { useState } from 'react';
import { Button, Field, Modal, TextInput } from '@/ui/primitives';
import {
  PROJECT_ID_PATTERN,
  createBaselineScenario,
  type Project,
  type Scenario,
} from '@/domain/project';
import { projectIdExists, saveProject, saveScenarios } from '@/data/persistence';
import { toast } from '@/ui/toast';

export interface DuplicateOptions {
  components: boolean;
  network: boolean;
  scenarios: boolean;
  flothermMapping: boolean;
  solverResults: boolean;
}

const COPY_ITEMS: Array<{ key: keyof DuplicateOptions; label: string; note?: string }> = [
  { key: 'components', label: 'Components' },
  { key: 'network', label: 'Thermal Network' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'flothermMapping', label: 'FloTHERM Mapping', note: 'tied to a CFD run' },
  { key: 'solverResults', label: 'Solver Results', note: 'tied to a geometry version' },
];

export function DuplicateProjectModal({
  source,
  scenarios,
  onClose,
  onDuplicated,
}: {
  source: Project;
  scenarios: Scenario[];
  onClose: () => void;
  onDuplicated: (projectId: string) => void;
}) {
  const [name, setName] = useState(`${source.project_name} (Copy)`);
  const [id, setId] = useState(`${source.project_id}_COPY`.slice(0, 64));
  const [options, setOptions] = useState<DuplicateOptions>({
    components: true,
    network: true,
    scenarios: true,
    flothermMapping: false,
    solverResults: false,
  });

  const error = !name.trim()
    ? 'New Project Name is required.'
    : !PROJECT_ID_PATTERN.test(id.trim())
      ? 'Project ID must be 3–64 characters using letters, digits, underscore or hyphen.'
      : projectIdExists(id.trim())
        ? `Project ID "${id.trim()}" is already in use.`
        : null;

  const handleDuplicate = () => {
    if (error) return;
    const now = new Date().toISOString();
    const copy: Project = {
      ...source,
      project_id: id.trim(),
      project_name: name.trim(),
      status: 'active',
      meta: { ...source.meta, created_at: now, updated_at: now },
    };
    saveProject(copy);

    if (options.scenarios && scenarios.length > 0) {
      saveScenarios(
        copy.project_id,
        scenarios.map((s) => ({ ...s, project_id: copy.project_id })),
      );
    } else {
      saveScenarios(copy.project_id, [createBaselineScenario(copy.project_id)]);
    }

    toast.success(`Project duplicated as "${copy.project_name}"`);
    onDuplicated(copy.project_id);
  };

  return (
    <Modal
      title="Duplicate Project"
      description="Creates an independent copy. The source project is left untouched."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={Boolean(error)} onClick={handleDuplicate}>
            Duplicate Project
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="New Project Name" htmlFor="dup_name" required>
          <TextInput id="dup_name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="New Project ID" htmlFor="dup_id" required error={error ?? undefined}>
          <TextInput
            id="dup_id"
            value={id}
            className="font-mono"
            invalid={Boolean(error)}
            onChange={(e) => setId(e.target.value)}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-700">Copy</legend>
          <div className="flex flex-col gap-1.5">
            {COPY_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2.5 text-[13px] text-ink-700"
              >
                <input
                  type="checkbox"
                  checked={options[item.key]}
                  className="size-4 accent-[var(--color-accent-600)]"
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                />
                {item.label}
                {item.note && <span className="text-[12px] text-ink-400">— {item.note}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
