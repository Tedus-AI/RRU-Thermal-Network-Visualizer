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

import type { FileSystemDirectoryHandleLike } from '@/export/download';

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
  selected: ArtifactType[];
  /**
   * The folder the engineer chose, and its name.
   *
   * The handle lived in a `useRef` on the screen, and a ref is per mount: going
   * to another screen and back dropped it, so `Output Folder` read
   * "No folder chosen" again and the next export silently fell back to a
   * browser download. It belongs to the session, not to one mounting of a
   * component.
   *
   * The handle itself cannot be written to the project file -- a directory
   * handle is not JSON, and a browser will not hand one back without a fresh
   * user gesture. The NAME travels in the preferences, so a reloaded project
   * can say which folder it was pointed at and ask for it again rather than
   * pretending none was ever chosen.
   */
  directory: FileSystemDirectoryHandleLike | null;
  directoryName: string | null;

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
  /**
   * True once `loadFor` has put a remembered selection back.
   *
   * The screen seeds the Engineering Package preset when it first opens, and
   * that effect re-runs on every remount — so coming back from another screen
   * it overwrote the very selection that had just been restored. It asks this
   * first now.
   */
  preferencesRestored: boolean;
  scenarioId: string | null;

  loadFor: (projectId: string, scenarioId: string | null, base: string) => void;
  clear: () => void;
  setDirectory: (handle: FileSystemDirectoryHandleLike | null) => void;

  setConfig: (patch: Partial<ExportConfiguration>) => void;
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
  selected: ArtifactType[],
  outputFolderName?: string | null,
): void {
  if (!projectId) return;
  saveExportPreferences(projectId, {
    config: config as unknown as Record<string, unknown>,
    selected,
    output_folder_name:
      outputFolderName === undefined
        ? (loadExportPreferences(projectId)?.output_folder_name ?? null)
        : outputFolderName,
  });
}

export const useExportStore = create<ExportStoreState>((set, get) => ({
  config: defaultConfiguration(''),
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
  preferencesRestored: false,
  scenarioId: null,
  directory: null,
  directoryName: null,

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
      preferencesRestored: Boolean(stored),
      stamp: loadExportStamp(projectId),
      config: remembered
        ? { ...remembered, base_filename: remembered.base_filename || base }
        : changed
          ? defaultConfiguration(base)
          : { ...previous.config, base_filename: previous.config.base_filename || base },
      ...(stored
        ? {
            selected: stored.selected as ArtifactType[],
            // The name only; the handle has to be re-picked, because a browser
            // grants folder access to a gesture, never to a stored value.
            directoryName: stored.output_folder_name ?? null,
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

  setDirectory: (handle) =>
    set((state) => {
      rememberSettings(state.projectId, state.config, state.selected, handle?.name ?? null);
      return { directory: handle, directoryName: handle?.name ?? null };
    }),

  clear: () =>
    set({
      config: defaultConfiguration(''),
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
      preferencesRestored: false,
      scenarioId: null,
      directory: null,
      directoryName: null,
    }),

  setConfig: (patch) =>
    set((state) => {
      const config = { ...state.config, ...patch };
      rememberSettings(state.projectId, config, state.selected);
      return { config };
    }),


  setSelected: (selected) =>
    set((state) => {
      rememberSettings(state.projectId, state.config, selected);
      return { selected };
    }),

  toggle: (type) =>
    set((state) => {
      const selected = state.selected.includes(type)
        ? state.selected.filter((entry) => entry !== type)
        : [...state.selected, type];
      rememberSettings(state.projectId, state.config, selected);
      return { selected };
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
