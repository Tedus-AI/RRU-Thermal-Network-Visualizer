/**
 * Shared component store.
 *
 * Screen 01 reads it for KPIs only; import happens in Screen 02.
 */

import { create } from 'zustand';
import { useSolverStore } from './solverStore';
import { loadComponents, saveComponents } from './persistence';
import type { ComponentRecord } from '@/domain/component';

export type { BoardType, ComponentRecord, ThermalProfile } from '@/domain/component';

interface ComponentStoreState {
  components: ComponentRecord[];
  loadFor: (projectId: string) => void;
  setComponents: (projectId: string, components: ComponentRecord[]) => void;
  clear: () => void;

  componentCount: () => number;
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

  componentCount: () => get().components.reduce((sum, c) => sum + (c.qty || 1), 0),
  heatSourceCount: () =>
    get().components.filter((c) => (c.power_W ?? 0) > 0).reduce((sum, c) => sum + (c.qty || 1), 0),
  totalPowerW: () => get().components.reduce((sum, c) => sum + (c.power_W ?? 0) * (c.qty || 1), 0),
}));
