/**
 * Export store — 12 §33, §36, §53, AC-12-33, AC-12-35.
 *
 * Store contracts (12 §54): every other store is READ. Only this one is written,
 * and what it writes is deliberately small.
 *
 * §36 is the constraint that shapes it: "File generation must not mutate shared
 * thermal DB" and "Never store file bytes in shared DB". So the queue, the
 * results, the generated blobs and the session history live in MEMORY only, and
 * the sole thing that reaches storage is a namespaced metadata stamp —
 * lastExportAt / lastExportPackageId / lastExportArtifactTypes — written under
 * its own key so it cannot overwrite an unknown sibling field.
 *
 * §33 says history may be session-only, and it is. The object URLs behind
 * "Download Again" are alive for as long as the tab is, and the UI says so
 * rather than implying a persistence the implementation does not have.
 */

import { create } from 'zustand';

import {
  loadExportPreferences,
  loadExportStamp,
  saveExportPreferences,
  saveExportStamp,
  type ExportStamp,
} from './persistence';

import {
  defaultConfiguration,
  type ArtifactType,
  type ExportConfiguration,
  type ExportHistoryEntry,
  type ExportManifest,
  type ExportPreset,
  type ExportSession,
  type ExportArtifactResult,
} from '@/export/exportTypes';

export interface QueueEntry {
  type: ArtifactType;
  filename: string;
  status: 'READY' | 'EXPORTING' | 'EXPORTED' | 'FAILED' | 'SKIPPED';
  size_bytes?: number;
  error?: string;
  object_url?: string;
  mime_type?: string;
}

interface ExportStoreState {
  config: ExportConfiguration;
  preset: ExportPreset;
  selected: ArtifactType[];

  session: ExportSession | null;
  queue: QueueEntry[];
  results: ExportArtifactResult[];
  history: ExportHistoryEntry[];
  lastManifest: ExportManifest | null;

  exporting: boolean;
  cancelRequested: boolean;
  progress: { index: number; total: number; label: string; label_zh: string } | null;

  /** Per-project export stamp (12 §36), read from storage. */
  stamp: ExportStamp | null;
  /** Whose preferences the settings below belong to, so a change can be saved. */
  projectId: string | null;
  scenarioId: string | null;

  loadFor: (projectId: string, scenarioId: string | null, base: string) => void;
  clear: () => void;

  setConfig: (patch: Partial<ExportConfiguration>) => void;
  setPreset: (preset: ExportPreset, artifacts: ArtifactType[]) => void;
  setSelected: (selected: ArtifactType[]) => void;
  toggle: (type: ArtifactType) => void;

  beginSession: (session: ExportSession, queue: QueueEntry[]) => void;
  setProgress: (progress: ExportStoreState['progress']) => void;
  requestCancel: () => void;
  finishSession: (input: {
    project_id: string;
    results: ExportArtifactResult[];
    queue: QueueEntry[];
    history?: ExportHistoryEntry;
    manifest?: ExportManifest | null;
    status: ExportSession['status'];
  }) => void;

  clearQueue: () => void;
}

/**
 * Write the Export Center's settings back as they change.
 *
 * On change rather than on leave: there is no reliable "leaving the screen"
 * moment in a single-page app, and the same rule is what makes Screen 11's
 * layout survive a navigation.
 */
function rememberSettings(
  projectId: string | null,
  config: ExportConfiguration,
  preset: ExportPreset,
  selected: ArtifactType[],
): void {
  if (!projectId) return;
  saveExportPreferences(projectId, {
    config: config as unknown as Record<string, unknown>,
    preset,
    selected,
  });
}

export const useExportStore = create<ExportStoreState>((set, get) => ({
  config: defaultConfiguration(''),
  preset: 'engineering_package',
  selected: [],

  session: null,
  queue: [],
  results: [],
  history: [],
  lastManifest: null,

  exporting: false,
  cancelRequested: false,
  progress: null,

  stamp: null,
  projectId: null,
  scenarioId: null,

  loadFor: (projectId, scenarioId, base) => {
    const previous = get();
    // 12 §52 — "no previous-project state retained". Switching scenario resets
    // the queue and the results; only the session history is allowed to persist
    // across a scenario switch, because it is a log of what this tab did.
    const changed = previous.scenarioId !== scenarioId;

    // Settings are not results. The queue and the session belong to one run and
    // are cleared with it; what the engineer chose -- the filename pattern, the
    // encodings, the precision, which artifacts are ticked -- is a preference,
    // and every other screen in this tool remembers its own. Reloaded rather
    // than kept from `previous`, so it is right after a browser reload too.
    const stored = loadExportPreferences(projectId);
    const remembered = stored
      ? { ...defaultConfiguration(base), ...(stored.config as Partial<ExportConfiguration>) }
      : null;

    set({
      projectId,
      scenarioId,
      stamp: loadExportStamp(projectId),
      config: remembered
        ? { ...remembered, base_filename: remembered.base_filename || base }
        : changed
          ? defaultConfiguration(base)
          : { ...previous.config, base_filename: previous.config.base_filename || base },
      ...(stored
        ? {
            preset: stored.preset as ExportPreset,
            selected: stored.selected as ArtifactType[],
          }
        : {}),
      ...(changed
        ? {
            session: null,
            queue: [],
            results: [],
            lastManifest: null,
            exporting: false,
            cancelRequested: false,
            progress: null,
          }
        : {}),
    });
  },

  clear: () =>
    set({
      config: defaultConfiguration(''),
      preset: 'engineering_package',
      selected: [],
      session: null,
      queue: [],
      results: [],
      history: [],
      lastManifest: null,
      exporting: false,
      cancelRequested: false,
      progress: null,
      stamp: null,
      projectId: null,
      scenarioId: null,
    }),

  setConfig: (patch) =>
    set((state) => {
      const config = { ...state.config, ...patch };
      rememberSettings(state.projectId, config, state.preset, state.selected);
      return { config };
    }),

  setPreset: (preset, artifacts) =>
    set((state) => {
      rememberSettings(state.projectId, state.config, preset, artifacts);
      return { preset, selected: artifacts };
    }),

  setSelected: (selected) =>
    set((state) => {
      rememberSettings(state.projectId, state.config, state.preset, selected);
      return { selected };
    }),

  toggle: (type) =>
    set((state) => {
      const selected = state.selected.includes(type)
        ? state.selected.filter((entry) => entry !== type)
        : [...state.selected, type];
      // Touching the selection by hand means the preset no longer describes it.
      rememberSettings(state.projectId, state.config, 'custom', selected);
      return { preset: 'custom' as ExportPreset, selected };
    }),

  beginSession: (session, queue) =>
    set({
      session,
      queue,
      results: [],
      lastManifest: null,
      exporting: true,
      cancelRequested: false,
      progress: null,
    }),

  setProgress: (progress) => set({ progress }),

  requestCancel: () => set({ cancelRequested: true }),

  finishSession: (input) => {
    const state = get();
    // 12 §36 — metadata only, under its own namespaced key. No file bytes, and
    // no other stored collection is touched by an export.
    if (state.session) {
      const stamp: ExportStamp = {
        lastExportAt: new Date().toISOString(),
        lastExportPackageId: state.session.id,
        lastExportArtifactTypes: Array.from(new Set(input.results.map((result) => result.type))),
      };
      saveExportStamp(input.project_id, stamp);
      set({ stamp });
    }

    set({
      results: input.results,
      queue: input.queue,
      exporting: false,
      cancelRequested: false,
      progress: null,
      lastManifest: input.manifest ?? null,
      session: state.session ? { ...state.session, status: input.status } : null,
      history: input.history ? [input.history, ...state.history].slice(0, 20) : state.history,
    });
  },

  clearQueue: () =>
    set((state) => {
      // Release the blobs this tab was holding; a revoked URL that is still
      // listed would fail silently when "Download Again" is pressed.
      for (const entry of state.queue) {
        if (entry.object_url) URL.revokeObjectURL(entry.object_url);
      }
      return { queue: [], results: [], lastManifest: null, session: null, progress: null };
    }),
}));
