/**
 * Save pipeline for Screen 01 — 01 §14.
 *
 * 1. validate required fields;
 * 2. create/update the project (merge-save preserves foreign fields, AC-09);
 * 3. auto-create the Baseline scenario on first save (AC-03);
 * 4. persist scenarios;
 * 5. toast.
 */

import { useCallback, useMemo } from 'react';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { validateProjectForm } from './projectValidation';
import { toast } from '@/ui/toast';

export function useProjectSave() {
  const draft = useProjectStore((s) => s.draft);
  const isProjectIdTaken = useProjectStore((s) => s.isProjectIdTaken);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);

  const scenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0] ?? null,
    [scenarios, activeScenarioId],
  );

  const errors = useMemo<Record<string, string>>(() => {
    if (!draft) return {};
    return validateProjectForm({ project: draft, scenario, isProjectIdTaken }).errors;
  }, [draft, scenario, isProjectIdTaken]);

  const canSave = !readOnly && Object.keys(errors).length === 0;

  const save = useCallback((): boolean => {
    const store = useProjectStore.getState();
    const current = store.draft;
    if (!current || store.isReadOnly()) return false;

    if (Object.keys(errors).length > 0) {
      toast.error('無法建立：請先修正標示的欄位。');
      return false;
    }

    const projectId = current.project_id.trim();
    const scenarioStore = useScenarioStore.getState();

    // 01 §14.3 — a project always has at least a Baseline scenario after first save.
    const baseline = scenarioStore.createDefaultScenario(projectId);

    // Scenarios created before the project ID existed must adopt it.
    scenarioStore.replaceAll(
      useScenarioStore.getState().scenarios.map((s) => ({ ...s, project_id: projectId })),
    );

    store.patchProject({ project_id: projectId });
    store.setActiveScenarioId(current.active_scenario_id ?? baseline.id);

    const persisted = store.commit();
    if (!persisted) {
      toast.error('建立失敗。');
      return false;
    }

    scenarioStore.persist(projectId);
    const boundaryStore = useBoundaryStore.getState();
    if (boundaryStore.dirty && boundaryStore.current()?.project_id === projectId) {
      boundaryStore.save(projectId);
    }
    toast.success('專案已建立');
    return true;
  }, [errors]);

  return { save, canSave, errors, scenario };
}
