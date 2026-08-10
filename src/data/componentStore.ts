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
import { loadComponents, saveComponents } from './persistence';
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
  if (effect.solverDirty) useSolverStore.getState().invalidate('component_power_changed');
  if (effect.networkReview) useNetworkStore.getState().setRequiresReview(true);
}

function touch(component: Component): Component {
  return {
    ...component,
    provenance: { ...component.provenance, last_modified_at: new Date().toISOString() },
  };
}

export const useComponentStore = create<ComponentStoreState>((set, get) => ({
  components: [],
  dirty: false,
  loaded_project_id: null,

  loadFor: (projectId) =>
    set({ components: loadComponents(projectId), dirty: false, loaded_project_id: projectId }),

  setComponents: (projectId, components) => {
    set({ components, dirty: false, loaded_project_id: projectId });
    saveComponents(projectId, components);
    useSolverStore.getState().invalidate('component_power_changed');
  },

  clear: () => set({ components: [], dirty: false, loaded_project_id: null }),

  patchComponent: (id, patch, fields) => {
    const components = get().components;
    applyEffects(components, [id], fields);
    set({
      components: components.map((component) =>
        component.id === id ? touch({ ...component, ...patch }) : component,
      ),
      dirty: true,
    });
  },

  addComponent: (input) => {
    const component = createComponent(input);
    set({ components: [...get().components, component], dirty: true });
    // A new component is not in the graph yet.
    useNetworkStore.getState().setRequiresReview(true);
    useSolverStore.getState().invalidate('component_power_changed');
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

    set({ components: [...get().components, copy], dirty: true });
    useNetworkStore.getState().setRequiresReview(true);
    useSolverStore.getState().invalidate('component_power_changed');
    return copy;
  },

  deleteComponent: (id) => {
    const component = get().components.find((c) => c.id === id);
    set({ components: get().components.filter((c) => c.id !== id), dirty: true });
    // 04 §25 — a deleted component leaves its graph mapping orphaned. Screen 04
    // never rewrites topology; it flags the graph for review.
    if (component && isMappedToNetwork(component)) {
      useNetworkStore.getState().setRequiresReview(true);
    }
    useSolverStore.getState().invalidate('component_power_changed');
  },

  setEnabled: (id, enabled) => get().patchComponent(id, { enabled }, ['enabled']),

  bulkPatch: (ids, patch, fields) => {
    const components = get().components;
    applyEffects(components, ids, fields);
    const idSet = new Set(ids);
    set({
      components: components.map((component) =>
        idSet.has(component.id) ? touch({ ...component, ...patch(component) }) : component,
      ),
      dirty: true,
    });
  },

  save: (projectId) => {
    saveComponents(projectId, get().components);
    set({ dirty: false });
  },

  revert: () => {
    const projectId = get().loaded_project_id;
    if (!projectId) return;
    set({ components: loadComponents(projectId), dirty: false });
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
