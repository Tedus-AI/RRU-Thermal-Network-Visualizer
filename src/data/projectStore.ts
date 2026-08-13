/**
 * Shared project store — 01 §27, 00 §53 forbidden item 2.
 *
 * The single owner of project identity and project context for every screen.
 * Holds the working draft, the saved baseline, dirty state and load status.
 */

import { create } from 'zustand';
import {
  createEmptyProject,
  type Project,
  type ProjectContext,
  type ProjectStatus,
} from '@/domain/project';
import { createRevision } from '@/domain/revision';
import {
  loadProject,
  loadProjects,
  projectIdExists,
  saveProject,
} from './persistence';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface ProjectStoreState {
  /** The editable draft bound to the form. */
  draft: Project | null;
  /** Last persisted snapshot, used to diff for dirty state and to Cancel. */
  saved: Project | null;
  /** A project that has never been saved keeps its Project ID editable (01 §6.2). */
  isNew: boolean;
  dirty: boolean;
  status: LoadStatus;
  error: string | null;
  projects: Project[];

  refreshProjects: () => Project[];
  startNewProject: () => void;
  openProject: (projectId: string) => void;
  setLoadError: (message: string) => void;

  patchProject: (patch: Partial<Pick<Project, 'project_id' | 'project_name'>>) => void;
  patchContext: (patch: Partial<ProjectContext>) => void;
  setActiveScenarioId: (scenarioId: string | null) => void;
  setStatus: (status: ProjectStatus) => void;

  /** Marks the form dirty from an edit owned by another store (e.g. the scenario form). */
  markDirty: () => void;

  commit: () => Project | null;
  revert: () => void;
  clear: () => void;

  isReadOnly: () => boolean;
  isProjectIdTaken: (projectId: string) => boolean;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  draft: null,
  saved: null,
  isNew: false,
  dirty: false,
  status: 'idle',
  error: null,
  projects: [],

  refreshProjects: () => {
    const projects = loadProjects();
    set({ projects });
    return projects;
  },

  startNewProject: () => {
    set({
      draft: createEmptyProject(),
      saved: null,
      isNew: true,
      dirty: false,
      status: 'loaded',
      error: null,
    });
  },

  openProject: (projectId) => {
    set({ status: 'loading', error: null, draft: null, saved: null });
    const project = loadProject(projectId);
    if (!project) {
      set({ status: 'error', error: `Project "${projectId}" was not found.` });
      return;
    }
    set({
      draft: project,
      saved: project,
      isNew: false,
      dirty: false,
      status: 'loaded',
      error: null,
    });
  },

  setLoadError: (message) => set({ status: 'error', error: message }),

  patchProject: (patch) => {
    const draft = get().draft;
    if (!draft || get().isReadOnly()) return;
    const next = { ...draft, ...patch };
    if (next.project_id === draft.project_id && next.project_name === draft.project_name) return;
    set({ draft: { ...next, revision: createRevision('project') }, dirty: true });
  },

  patchContext: (patch) => {
    const draft = get().draft;
    if (!draft || get().isReadOnly()) return;
    const changed = Object.entries(patch).some(
      ([key, value]) => !Object.is(draft.project_context[key as keyof ProjectContext], value),
    );
    if (!changed) return;
    set({
      draft: {
        ...draft,
        revision: createRevision('project'),
        project_context: { ...draft.project_context, ...patch },
      },
      dirty: true,
    });
  },

  setActiveScenarioId: (scenarioId) => {
    const draft = get().draft;
    if (!draft) return;
    if (draft.active_scenario_id === scenarioId) return;
    set({
      draft: {
        ...draft,
        active_scenario_id: scenarioId,
        revision: createRevision('project'),
      },
      dirty: true,
    });
  },

  setStatus: (status) => {
    const draft = get().draft;
    if (!draft || draft.status === status) return;
    const next = { ...draft, status, revision: createRevision('project') };
    const persisted = saveProject(next);
    set({ draft: persisted, saved: persisted, dirty: false });
    get().refreshProjects();
  },

  markDirty: () => {
    if (get().draft && !get().isReadOnly()) set({ dirty: true });
  },

  commit: () => {
    const draft = get().draft;
    if (!draft) return null;
    const persisted = saveProject(draft);
    set({ draft: persisted, saved: persisted, isNew: false, dirty: false });
    get().refreshProjects();
    return persisted;
  },

  revert: () => {
    const saved = get().saved;
    if (!saved) {
      set({ draft: createEmptyProject(), dirty: false });
      return;
    }
    set({ draft: saved, dirty: false });
  },

  clear: () =>
    set({ draft: null, saved: null, isNew: false, dirty: false, status: 'idle', error: null }),

  isReadOnly: () => get().draft?.status === 'archived',

  isProjectIdTaken: (projectId) => {
    const { saved } = get();
    if (saved && saved.project_id === projectId) return false;
    return projectIdExists(projectId);
  },
}));
