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
import type { MaterialDefaults } from '@/domain/materials';
import { createRevision } from '@/domain/revision';
import { markSavePending } from './saveStatus';
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
  patchMaterials: (patch: Partial<MaterialDefaults>) => void;
  setActiveScenarioId: (scenarioId: string | null) => void;
  setStatus: (status: ProjectStatus) => void;

  /** Marks the form dirty from an edit owned by another store (e.g. the scenario form). */
  markDirty: () => void;

  commit: () => Project | null;
  /** Persists shortly after an edit, so nothing lives only in the draft. */
  scheduleAutoCommit: () => void;
  revert: () => void;
  clear: () => void;

  isReadOnly: () => boolean;
  isProjectIdTaken: (projectId: string) => boolean;
}

/**
 * Auto-commit.
 *
 * The folder is where projects live, so an edit that only sits in the draft is
 * an edit that is not anywhere. Every mutation therefore schedules a commit,
 * which persists and — through the storage write listener — reaches disk.
 *
 * Only for a project that already exists. A new project is still created
 * explicitly: its id is editable until the first save, and committing on each
 * keystroke would litter the folder with `F.tnv.json`, `FR.tnv.json`, and so on.
 *
 * The window is shorter than the folder's own coalescing window, so a burst of
 * typing produces one commit and then one file write, in that order.
 */
const AUTO_COMMIT_MS = 400;
let autoCommitTimer: ReturnType<typeof setTimeout> | null = null;

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
    get().scheduleAutoCommit();
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
    get().scheduleAutoCommit();
  },

  /**
   * Material and process constants. They are inputs to the resistance
   * calculators, so a change here changes the answer — the solver-invalidation
   * that follows from the project revision is exactly what should happen.
   */
  patchMaterials: (patch) => {
    const draft = get().draft;
    if (!draft || get().isReadOnly()) return;
    const changed = Object.entries(patch).some(
      ([key, value]) => !Object.is(draft.materials[key as keyof MaterialDefaults], value),
    );
    if (!changed) return;
    set({
      draft: {
        ...draft,
        revision: createRevision('project'),
        materials: { ...draft.materials, ...patch },
      },
      dirty: true,
    });
    get().scheduleAutoCommit();
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
    get().scheduleAutoCommit();
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
    if (get().draft && !get().isReadOnly()) {
      set({ dirty: true });
      get().scheduleAutoCommit();
    }
  },

  scheduleAutoCommit: () => {
    // A project that has never been saved is created deliberately, not by typing.
    if (get().isNew || get().isReadOnly() || !get().draft) return;
    // Light the indicator now, not when the write eventually starts: until then
    // it would still be claiming the previous state was saved.
    markSavePending();
    if (autoCommitTimer) clearTimeout(autoCommitTimer);
    autoCommitTimer = setTimeout(() => {
      autoCommitTimer = null;
      const state = useProjectStore.getState();
      if (state.dirty && !state.isNew && !state.isReadOnly()) state.commit();
    }, AUTO_COMMIT_MS);
  },

  commit: () => {
    const draft = get().draft;
    if (!draft) return null;
    if (autoCommitTimer) {
      clearTimeout(autoCommitTimer);
      autoCommitTimer = null;
    }
    const persisted = saveProject(draft);
    set({ draft: persisted, saved: persisted, isNew: false, dirty: false });
    get().refreshProjects();
    return persisted;
  },

  revert: () => {
    if (autoCommitTimer) {
      clearTimeout(autoCommitTimer);
      autoCommitTimer = null;
    }
    const saved = get().saved;
    if (!saved) {
      set({ draft: createEmptyProject(), dirty: false });
      return;
    }
    set({ draft: saved, dirty: false });
  },

  clear: () => {
    if (autoCommitTimer) {
      clearTimeout(autoCommitTimer);
      autoCommitTimer = null;
    }
    set({ draft: null, saved: null, isNew: false, dirty: false, status: 'idle', error: null });
  },

  isReadOnly: () => get().draft?.status === 'archived',

  isProjectIdTaken: (projectId) => {
    const { saved } = get();
    if (saved && saved.project_id === projectId) return false;
    return projectIdExists(projectId);
  },
}));
