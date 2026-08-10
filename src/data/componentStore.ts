/**
 * Shared component store.
 *
 * Screen 01 reads it for KPIs; Screen 02 writes it at Apply; Screen 04 edits it.
 */

import { create } from 'zustand';
import { useSolverStore } from './solverStore';
import { loadComponents, saveComponents } from './persistence';
import { isHeatSource, totalPowerW, type Component } from '@/domain/component';

interface ComponentStoreState {
  components: Component[];
  loadFor: (projectId: string) => void;
  setComponents: (projectId: string, components: Component[]) => void;
  clear: () => void;

  /** Total unit count, i.e. Σ qty — not the number of distinct part types. */
  componentCount: () => number;
  /** Distinct part types, used by the category breakdown. */
  typeCount: () => number;
  heatSourceCount: () => number;
  totalPowerW: () => number;
}

export const useComponentStore = create<ComponentStoreState>((set, get) => ({
  components: [],

  loadFor: (projectId) => set({ components: loadComponents(projectId) }),

  setComponents: (projectId, components) => {
    set({ components });
    saveComponents(projectId, components);
    useSolverStore.getState().invalidate('component_power_changed');
  },

  clear: () => set({ components: [] }),

  componentCount: () => get().components.reduce((sum, c) => sum + (c.qty || 0), 0),
  typeCount: () => get().components.length,
  heatSourceCount: () =>
    get()
      .components.filter(isHeatSource)
      .reduce((sum, c) => sum + (c.qty || 0), 0),
  totalPowerW: () => totalPowerW(get().components),
}));
