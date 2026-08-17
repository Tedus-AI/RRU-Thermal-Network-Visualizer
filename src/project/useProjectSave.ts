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
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { validateProjectForm } from './projectValidation';
import { toast } from '@/ui/toast';

export function useProjectSave() {
  const draft = useProjectStore((s) => s.draft);
  const isProjectIdTaken = useProjectStore((s) => s.isProjectIdTaken);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const componentCount = useComponentStore((s) => s.componentCount());
  const flothermMappingCount = useNetworkStore((s) => s.flothermMappingCount());

  const scenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0] ?? null,
    [scenarios, activeScenarioId],
  );

  const { errors, warnings } = useMemo(() => {
    if (!draft) return { errors: {}, warnings: [] as string[] };
    return validateProjectForm({
      project: draft,
      scenario,
      isProjectIdTaken,
      componentCount,
      flothermMappingCount,
    });
  }, [draft, scenario, isProjectIdTaken, componentCount, flothermMappingCount]);

  const canSave = !readOnly && Object.keys(errors).length === 0;

  const save = useCallback((): boolean => {
    const store = useProjectStore.getState();
    const current = store.draft;
    if (!current || store.isReadOnly()) return false;

    if (Object.keys(errors).length > 0) {
      toast.error('Cannot save: please fix the highlighted fields.');
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
      toast.error('Save failed.');
      return false;
    }

    scenarioStore.persist(projectId);
    const boundaryStore = useBoundaryStore.getState();
    if (boundaryStore.dirty && boundaryStore.current()?.project_id === projectId) {
      boundaryStore.save(projectId);
    }
    toast.success('Project saved successfully');
    return true;
  }, [errors]);

  return { save, canSave, errors, warnings, scenario };
}
