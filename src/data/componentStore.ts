/**
 * Shared component store.
 *
 * Screen 01 reads KPIs, Screen 02 writes at Apply, Screen 04 manages and edits.
 * Every thermal-relevant edit routes through `patchComponent` so the invalidation
 * matrix (04 §32) is applied in exactly one place.
 */

import { create } from 'zustand';
import { useSolverStore } from './solverStore';
import { useNetworkStore } from './networkStore';
import {
  loadComponentRevisions,
  loadComponents,
  saveComponentRevisions,
  saveComponents,
} from './persistence';
import {
  createComponentRevisionSet,
  createRevision,
  type ComponentRevisionSet,
} from '@/domain/revision';
import {
  createComponent,
  isHeatSource,
  totalPowerW,
  type Component,
  type ComponentCategory,
} from '@/domain/component';
import {
  combineEffects,
  effectOfChange,
  isMappedToNetwork,
} from '@/domain/componentInvalidation';

interface ComponentStoreState {
  components: Component[];
  /** Unsaved edits exist (04 §12). */
  dirty: boolean;
  loaded_project_id: string | null;
  revisions: ComponentRevisionSet;

  loadFor: (projectId: string) => void;
  setComponents: (projectId: string, components: Component[]) => void;
  clear: () => void;

  /**
   * Applies a patch and the 04 §32 invalidation effects for the fields touched.
   * `fields` names the logical fields changed, so callers stay explicit.
   */
  patchComponent: (id: string, patch: Partial<Component>, fields: string[]) => void;
  addComponent: (input: Parameters<typeof createComponent>[0]) => Component;
  duplicateComponent: (id: string) => Component | null;
  deleteComponent: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  bulkPatch: (ids: string[], patch: (component: Component) => Partial<Component>, fields: string[]) => void;

  save: (projectId: string) => void;
  revert: () => void;

  byId: (id: string) => Component | undefined;
  /** Total unit count over enabled components, i.e. Σ qty. */
  componentCount: () => number;
  typeCount: () => number;
  heatSourceCount: () => number;
  totalPowerW: () => number;
}

function applyEffects(components: Component[], ids: string[], fields: string[]) {
  const effect = combineEffects(
    ids.flatMap((id) => {
      const component = components.find((c) => c.id === id);
      const mapped = component ? isMappedToNetwork(component) : false;
      return fields.map((field) => effectOfChange(field, mapped));
    }),
  );
  for (const reason of effect.dirtyReasons) useSolverStore.getState().invalidate(reason);
  if (effect.networkReview) useNetworkStore.getState().setRequiresReview(true, fields.join(','));
  return effect;
}

function advanceRevisions(
  current: ComponentRevisionSet,
  options: { solverInput: boolean; limits: boolean },
): ComponentRevisionSet {
  return {
    component_revision: createRevision('component'),
    solver_input_revision: options.solverInput
      ? createRevision('solver_input')
      : current.solver_input_revision,
    limit_revision: options.limits
      ? createRevision('limit')
      : current.limit_revision,
  };
}

function touch(component: Component): Component {
  return {
    ...component,
    provenance: { ...component.provenance, last_modified_at: new Date().toISOString() },
  };
}

function changesLimitDefinition(fields: string[]): boolean {
  return fields.some(
    (field) =>
      field === 'limit_C' || field === 'limit_type' || field === 'limit_reference_note',
  );
}

export const useComponentStore = create<ComponentStoreState>((set, get) => ({
  components: [],
  dirty: false,
  loaded_project_id: null,
  revisions: createComponentRevisionSet(),

  loadFor: (projectId) => {
    const components = loadComponents(projectId);
    set({
      components,
      revisions: loadComponentRevisions(projectId, components),
      dirty: false,
      loaded_project_id: projectId,
    });
  },

  setComponents: (projectId, components) => {
    const current =
      get().loaded_project_id === projectId
        ? get().revisions
        : loadComponentRevisions(projectId);
    const revisions = advanceRevisions(current, { solverInput: true, limits: true });
    set({ components, revisions, dirty: false, loaded_project_id: projectId });
    saveComponents(projectId, components);
    saveComponentRevisions(projectId, revisions);
    useSolverStore.getState().invalidate('component_power_changed');
  },

  clear: () =>
    set({
      components: [],
      dirty: false,
      loaded_project_id: null,
      revisions: createComponentRevisionSet(),
    }),

  patchComponent: (id, patch, fields) => {
    const components = get().components;
    const effect = applyEffects(components, [id], fields);
    const revisions = advanceRevisions(get().revisions, {
      solverInput: effect.solverDirty,
      limits: changesLimitDefinition(fields),
    });
    set({
      components: components.map((component) =>
        component.id === id ? touch({ ...component, ...patch }) : component,
      ),
      revisions,
      dirty: true,
    });
  },

  addComponent: (input) => {
    const component = createComponent(input);
    set({
      components: [...get().components, component],
      revisions: advanceRevisions(get().revisions, { solverInput: true, limits: true }),
      dirty: true,
    });
    // A new component is not in the graph yet.
    useNetworkStore.getState().setRequiresReview(true, 'component_added');
    useSolverStore.getState().invalidate('component_architecture_changed');
    return component;
  },

  duplicateComponent: (id) => {
    const source = get().components.find((component) => component.id === id);
    if (!source) return null;

    const taken = new Set(get().components.map((component) => component.id));
    let copyId = `${source.id}_COPY`;
    let suffix = 2;
    while (taken.has(copyId)) copyId = `${source.id}_COPY_${suffix++}`;

    // 04 §25 — thermal spec and geometry are copied; graph mapping, external
    // mapping and any solver result are deliberately NOT.
    const copy: Component = {
      ...source,
      id: copyId,
      name: `${source.name} (Copy)`,
      architecture_prep: { ...source.architecture_prep, thermal_profile_status: 'Not Assigned' },
      external_mappings: { flotherm: { mapping_status: 'unmapped' }, measurement: { mapping_status: 'unmapped' } },
      provenance: {
        ...source.provenance,
        source_type: 'Manual',
        imported_at: new Date().toISOString(),
        last_modified_at: new Date().toISOString(),
      },
    };

    set({
      components: [...get().components, copy],
      revisions: advanceRevisions(get().revisions, { solverInput: true, limits: true }),
      dirty: true,
    });
    useNetworkStore.getState().setRequiresReview(true, 'component_duplicated');
    useSolverStore.getState().invalidate('component_architecture_changed');
    return copy;
  },

  deleteComponent: (id) => {
    const component = get().components.find((c) => c.id === id);
    set({
      components: get().components.filter((c) => c.id !== id),
      revisions: advanceRevisions(get().revisions, { solverInput: true, limits: true }),
      dirty: true,
    });
    // 04 §25 — a deleted component leaves its graph mapping orphaned. Screen 04
    // never rewrites topology; it flags the graph for review.
    if (component && isMappedToNetwork(component)) {
      useNetworkStore.getState().setRequiresReview(true, 'component_deleted');
    }
    useSolverStore.getState().invalidate('component_architecture_changed');
  },

  setEnabled: (id, enabled) => get().patchComponent(id, { enabled }, ['enabled']),

  bulkPatch: (ids, patch, fields) => {
    const components = get().components;
    const effect = applyEffects(components, ids, fields);
    const idSet = new Set(ids);
    set({
      components: components.map((component) =>
        idSet.has(component.id) ? touch({ ...component, ...patch(component) }) : component,
      ),
      revisions: advanceRevisions(get().revisions, {
        solverInput: effect.solverDirty,
        limits: changesLimitDefinition(fields),
      }),
      dirty: true,
    });
  },

  save: (projectId) => {
    saveComponents(projectId, get().components);
    saveComponentRevisions(projectId, get().revisions);
    set({ dirty: false });
  },

  revert: () => {
    const projectId = get().loaded_project_id;
    if (!projectId) return;
    const components = loadComponents(projectId);
    set({
      components,
      revisions: loadComponentRevisions(projectId, components),
      dirty: false,
    });
  },

  byId: (id) => get().components.find((component) => component.id === id),

  componentCount: () =>
    get()
      .components.filter((c) => c.enabled)
      .reduce((sum, c) => sum + (c.qty || 0), 0),
  typeCount: () => get().components.filter((c) => c.enabled).length,
  heatSourceCount: () =>
    get()
      .components.filter((c) => c.enabled && isHeatSource(c))
      .reduce((sum, c) => sum + (c.qty || 0), 0),
  totalPowerW: () => totalPowerW(get().components),
}));

/** Categories present in the current dataset, for the tab row. */
export function categoriesInUse(components: Component[]): ComponentCategory[] {
  const set = new Set(components.map((component) => component.category));
  return [...set];
}
