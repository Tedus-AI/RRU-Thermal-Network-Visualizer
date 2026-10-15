/**
 * SharePoint storage against an in-memory Microsoft Graph and a stand-in for
 * MSAL — no Microsoft service is contacted.
 *
 * What matters most here is that a save can never overwrite someone else's:
 * every write is conditional, and a refused write keeps both versions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedDemoProject } from '@/mock/seed';
import { DEMO_PROJECT_ID } from '@/mock/demoProject';
import { BUILD_ID } from './bootstrapStorage';
import { mirrorFilename, type DirectoryHandle } from './folderBinding';
import { hasUnsyncedProjects, useFolderStore } from './folderStore';
import {
  clearWorkingCache,
  loadProject,
  loadProjects,
  loadUnsyncedMarkers,
  markProjectUnsynced,
  saveProject,
} from './persistence';
import { collectProject, serializeProjectFile } from './projectFile';
import { SHAREPOINT_CONFIG, sharePoint } from './sharepoint';
import { SharePointDirectory } from './sharepointFolder';
import { useComponentLibraryStore, type LibraryEntry } from './componentLibraryStore';
import { LIBRARY_FILENAME, serializeLibrary } from './componentLibraryFile';
import { useProjectStore } from './projectStore';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

// --- a document library in memory, answering like Microsoft Graph -----------

const FOLDER = SHAREPOINT_CONFIG.dataFolder;
const SITE_PATH = `/sites/${SHAREPOINT_CONFIG.siteHostname}:${SHAREPOINT_CONFIG.sitePath}`;

interface DriveFile {
  id: string;
  path: string;
  text: string;
  etag: string;
  modified: string;
  by: string;
}

function fakeGraph() {
  const files = new Map<string, DriveFile>();
  const log: Array<{ method: string; path: string; ifMatch: string | null; query: string }> = [];
  let seq = 0;
  let version = 0;
  let clock = Date.parse('2026-10-15T00:00:00Z');
  const drive = {
    files,
    log,
    /** Runs once, just before the next conditional PUT is checked. */
    beforePut: null as ((file: DriveFile) => void) | null,
    /** Fails the next PUT with this status AFTER applying it (a reply lost on the way). */
    lostReply: null as number | null,
    /** SharePoint cannot be reached at all (offline, VPN down). */
    down: false,
    put(path: string, text: string, by = 'Colleague B'): DriveFile {
      let file = files.get(path);
      if (!file) {
        file = { id: `item-${++seq}`, path, text: '', etag: '', modified: '', by };
        files.set(path, file);
      }
      file.text = text;
      file.etag = `"{${file.id}},${++version}"`;
      file.modified = new Date((clock += 1000)).toISOString();
      file.by = by;
      return file;
    },
    text(name: string): string | null {
      return files.get(`${FOLDER}/${name}`)?.text ?? null;
    },
  };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const meta = (file: DriveFile) => ({
    id: file.id,
    name: file.path.split('/').pop(),
    eTag: file.etag,
    size: file.text.length,
    lastModifiedDateTime: file.modified,
    lastModifiedBy: { user: { displayName: file.by } },
    webUrl: `https://sharepoint.test/${encodeURI(file.path)}`,
    file: {},
  });
  const notFound = () => json(404, { error: { code: 'itemNotFound', message: 'not found' } });

  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}) => {
    if (drive.down) throw new TypeError('Failed to fetch');
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const path = decodeURIComponent(url.pathname).replace(/^\/v1\.0/, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    log.push({ method, path, ifMatch: headers['If-Match'] ?? null, query: decodeURIComponent(url.search) });
    if (!/^Bearer tok-/.test(headers.Authorization ?? '')) return json(401, { error: { code: 'unauthenticated' } });
    if (path === SITE_PATH) return json(200, { id: 'site-1' });

    let match = /^\/sites\/site-1\/drive\/root:\/(.+?)(?::\/(content|children))?$/.exec(path);
    if (match) {
      const [, target, what] = match;
      if (what === 'children') {
        const kids = [...files.values()].filter(
          (f) => f.path.startsWith(`${target}/`) && !f.path.slice(target.length + 1).includes('/'),
        );
        return kids.length > 0 ? json(200, { value: kids.map(meta) }) : notFound();
      }
      const file = files.get(target);
      if (method === 'GET') return file ? json(200, meta(file)) : notFound();
      if (method === 'PUT') {
        if (file && /conflictBehavior=fail/.test(url.search)) {
          return json(409, { error: { code: 'nameAlreadyExists', message: 'exists' } });
        }
        const created = !file;
        return json(created ? 201 : 200, meta(drive.put(target, String(init.body ?? ''), 'Tester A')));
      }
      if (method === 'DELETE') {
        files.delete(target);
        return new Response(null, { status: 204 });
      }
    }
    match = /^\/sites\/site-1\/drive\/items\/([^/]+)(\/content)?$/.exec(path);
    if (match) {
      const file = [...files.values()].find((f) => f.id === match![1]);
      if (!file) return notFound();
      if (method === 'GET') return match[2] ? new Response(file.text, { status: 200 }) : json(200, meta(file));
      if (method === 'PUT') {
        if (drive.beforePut) {
          const hook = drive.beforePut;
          drive.beforePut = null;
          hook(file);
        }
        if (headers['If-Match'] && headers['If-Match'] !== file.etag) {
          return json(412, { error: { code: 'resourceModified', message: 'ETag mismatch' } });
        }
        const written = drive.put(file.path, String(init.body ?? ''), 'Tester A');
        if (drive.lostReply) {
          const status = drive.lostReply;
          drive.lostReply = null;
          return json(status, { error: { code: 'gatewayTimeout', message: 'lost' } });
        }
        return json(200, meta(written));
      }
    }
    return json(400, { error: { code: 'badRequest', message: `unhandled ${method} ${path}` } });
  };
  return { drive, fetchImpl };
}

/** MSAL stand-in: the account lives in localStorage like the real cache. */
function fakeMsal(state: { expired: boolean; logins: number; popups: number }) {
  const key = '__fake_msal_account';
  return {
    PublicClientApplication: class {
      async initialize() {}
      async handleRedirectPromise() {
        return null;
      }
      getAllAccounts() {
        const raw = localStorage.getItem(key);
        return raw ? [JSON.parse(raw)] : [];
      }
      async loginPopup() {
        state.logins += 1;
        const account = { name: 'Tester A', username: 'tester.a@example.test' };
        localStorage.setItem(key, JSON.stringify(account));
        return { account };
      }
      async acquireTokenSilent(request: { account: { username: string } }) {
        if (state.expired) throw Object.assign(new Error('interaction required'), { errorCode: 'interaction_required' });
        return { accessToken: `tok-${request.account.username}` };
      }
      async acquireTokenPopup(request: { account: { username: string } }) {
        state.popups += 1;
        state.expired = false;
        return { accessToken: `tok-${request.account.username}`, account: request.account };
      }
    },
  };
}

// --- a local folder in memory ----------------------------------------------------

interface MemoryFolder extends DirectoryHandle {
  files: Map<string, { text: string; modified: number }>;
  /** `Replaced/`, created on first use. */
  sub: Map<string, MemoryFolder>;
  /** Someone else changes a file: new content, newer timestamp. */
  touch: (name: string, text: string) => void;
}

function memoryFolder(name = 'ThermalProjects', files: Record<string, string> = {}): MemoryFolder {
  let clock = 1000;
  const map = new Map(Object.entries(files).map(([k, v]) => [k, { text: v, modified: (clock += 10) }]));
  const sub = new Map<string, MemoryFolder>();
  const fileHandle = (file: string) => ({
    name: file,
    kind: 'file' as const,
    async getFile() {
      const entry = map.get(file);
      if (!entry) throw new Error('missing');
      return { text: async () => entry.text, lastModified: entry.modified, size: entry.text.length };
    },
    async createWritable() {
      let buffer = '';
      return {
        async write(data: string | Blob) {
          buffer += String(data);
        },
        async close() {
          map.set(file, { text: buffer, modified: (clock += 10) });
        },
      };
    },
  });
  const folder: MemoryFolder = {
    name,
    kind: 'directory',
    files: map,
    sub,
    touch(file, text) {
      map.set(file, { text, modified: (clock += 10) });
    },
    async getFileHandle(file: string, options?: { create?: boolean }) {
      if (!map.has(file) && !options?.create) throw new Error('missing');
      return fileHandle(file);
    },
    async getDirectoryHandle(dir: string) {
      if (!sub.has(dir)) sub.set(dir, memoryFolder(dir));
      return sub.get(dir)!;
    },
    async removeEntry(file: string) {
      map.delete(file);
    },
    async *values() {
      for (const file of [...map.keys()]) yield fileHandle(file);
    },
    async queryPermission() {
      return 'granted' as const;
    },
    async requestPermission() {
      return 'granted' as const;
    },
  };
  return folder;
}

// --- harness --------------------------------------------------------------------

let graph: ReturnType<typeof fakeGraph>;
let auth: { expired: boolean; logins: number; popups: number };

const DEMO_FILE = mirrorFilename(DEMO_PROJECT_ID);

/** The demo project as a file, and an empty browser cache. */
async function demoFile(): Promise<string> {
  await seedDemoProject();
  const text = serializeProjectFile(collectProject(DEMO_PROJECT_ID, BUILD_ID)!);
  clearWorkingCache();
  return text;
}

async function demoOnSharePoint(): Promise<string> {
  const text = await demoFile();
  graph.drive.put(`${FOLDER}/${DEMO_FILE}`, text);
  return text;
}

async function openSharePoint(): Promise<void> {
  expect(await useFolderStore.getState().connectSharePoint()).toBe(true);
}

/** A local folder, open as the only storage (as before SharePoint). */
async function openLocal(folder: MemoryFolder): Promise<void> {
  useFolderStore.setState({ handle: folder, folderName: folder.name, status: 'connected', source: 'local' });
  await useFolderStore.getState().hydrate();
  expect(useFolderStore.getState().hydrated).toBe(true);
}

/** Lets the background catch-up of the local copy finish. */
async function settle(): Promise<void> {
  await vi.waitFor(() => expect(useFolderStore.getState().syncing).toBe(false));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await vi.waitFor(() => expect(useFolderStore.getState().syncing).toBe(false));
}

function rename(name: string, projectId = DEMO_PROJECT_ID) {
  saveProject({ ...loadProject(projectId)!, project_name: name });
}

function nameIn(text: string | null | undefined): string | undefined {
  return text ? JSON.parse(text).project_name : undefined;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  vi.stubGlobal('location', { origin: 'https://tool.test' });
  graph = fakeGraph();
  vi.stubGlobal('fetch', graph.fetchImpl);
  auth = { expired: false, logins: 0, popups: 0 };
  vi.stubGlobal('msal', fakeMsal(auth));
  sharePoint.__reset();
  useFolderStore.setState({
    status: 'unbound',
    handle: null,
    folderName: null,
    lastSyncAt: null,
    lastSyncedProjectId: null,
    lastError: null,
    syncing: false,
    projectFilenames: {},
    sharepoint: {
      status: 'unbound',
      syncing: false,
      lastSyncAt: null,
      lastSyncedProjectId: null,
      lastError: null,
      projectFilenames: {},
      enabled: false,
      handle: null,
      account: null,
    },
    source: null,
    pendingCount: { local: 0, sharepoint: 0 },
    hydrated: false,
    busy: null,
    conflict: null,
    remoteChange: null,
    notice: null,
  });
});

afterEach(async () => {
  await settle().catch(() => undefined);
  useProjectStore.getState().clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// --- SharePoint alone ---------------------------------------------------------------

describe('opening SharePoint', () => {
  it('signs in once, remembers the choice, and reads the projects from the shared folder', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    const state = useFolderStore.getState();
    expect(auth.logins).toBe(1);
    expect(state.source).toBe('sharepoint');
    expect(state.sharepoint.enabled).toBe(true);
    expect(state.sharepoint.status).toBe('connected');
    expect(state.hydrated).toBe(true);
    expect(state.sharepoint.account?.email).toBe('tester.a@example.test');
    expect(localStorage.getItem('tnv-storage-sharepoint')).toBe('on');
    expect(loadProjects().map((p) => p.project_id)).toEqual([DEMO_PROJECT_ID]);
    // The same site and folder the TIM Manager's connection points at.
    expect(graph.drive.log.some((entry) => entry.path === SITE_PATH)).toBe(true);
    expect(sharePoint.location()).toBe('Thermal-Spec-DB / 文件 / RRU_Thermal_Network / Database');
  });

  it('treats a folder that does not exist yet as an empty project list', async () => {
    await openSharePoint();
    expect(useFolderStore.getState().hydrated).toBe(true);
    expect(loadProjects()).toEqual([]);
  });
});

describe('saving to SharePoint', () => {
  it('writes with If-Match, and each save carries the eTag of the one before', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    rename('First edit');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);
    rename('Second edit');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);

    const puts = graph.drive.log.filter((entry) => entry.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts.every((entry) => entry.ifMatch)).toBe(true);
    expect(puts[0].ifMatch).not.toBe(puts[1].ifMatch);
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Second edit');
    expect(loadUnsyncedMarkers('sharepoint')).toEqual({});
  });

  it('creates a new project file without overwriting one that appeared meanwhile', async () => {
    await openSharePoint();
    await seedDemoProject();
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);

    const put = graph.drive.log.find((entry) => entry.method === 'PUT')!;
    expect(put.query).toContain('conflictBehavior=fail');
    expect(put.ifMatch).toBeNull();
  });

  it('runs one write per project at a time, so two quick saves never race each other', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    rename('A');
    const first = useFolderStore.getState().mirror(DEMO_PROJECT_ID);
    rename('B');
    const second = useFolderStore.getState().mirror(DEMO_PROJECT_ID);
    expect(await Promise.all([first, second])).toEqual([true, true]);

    expect(graph.drive.log.some((entry) => entry.method === 'PUT' && !entry.ifMatch)).toBe(false);
    expect(useFolderStore.getState().conflict).toBeNull();
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('B');
  });
});

describe('when someone else saved the project meanwhile', () => {
  it('keeps this session’s version as a conflict copy and shows theirs under the original', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    graph.drive.beforePut = (file) => {
      const theirs = JSON.parse(file.text);
      theirs.project_name = 'Their edit';
      theirs.data.project.project_name = 'Their edit';
      graph.drive.put(file.path, JSON.stringify(theirs), 'Colleague B');
    };
    rename('My edit');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);

    // Nothing of theirs was overwritten…
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Their edit');
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Their edit');
    // …and nothing of ours was lost.
    const conflict = useFolderStore.getState().conflict!;
    expect(conflict.projectId).toBe(DEMO_PROJECT_ID);
    expect(conflict.copyId).toBe(`${DEMO_PROJECT_ID}_conflict`);
    expect(conflict.remoteBy).toBe('Colleague B');
    expect(loadProject(conflict.copyId)?.project_name).toMatch(/^My edit \(conflict copy /);
    await vi.waitFor(() => expect(graph.drive.text(mirrorFilename(conflict.copyId))).not.toBeNull());
    expect(nameIn(graph.drive.text(mirrorFilename(conflict.copyId)))).toMatch(/^My edit \(conflict copy /);

    // The original takes the next edit without another conflict.
    rename('Edited after the conflict');
    useFolderStore.setState({ conflict: null });
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);
    expect(useFolderStore.getState().conflict).toBeNull();
  });

  it('just writes when their save changed nothing in the project', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    graph.drive.beforePut = (file) => {
      const resaved = JSON.parse(file.text);
      resaved.exported_at = '2030-01-01T00:00:00.000Z';
      graph.drive.put(file.path, JSON.stringify(resaved, null, 2), 'Colleague B');
    };
    rename('My edit');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);

    expect(useFolderStore.getState().conflict).toBeNull();
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('My edit');
    expect(loadProjects()).toHaveLength(1);
  });

  it('recognises its own write whose reply was lost, instead of calling it a conflict', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    graph.drive.lostReply = 504;
    rename('Landed, reply lost');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(false);
    expect(useFolderStore.getState().sharepoint.status).toBe('error');

    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);
    expect(useFolderStore.getState().conflict).toBeNull();
    expect(useFolderStore.getState().sharepoint.status).toBe('connected');
    expect(loadProjects()).toHaveLength(1);
  });
});

describe('the component library', () => {
  function entry(id: string, savedAt: string): LibraryEntry {
    return {
      id,
      name: id,
      source_project_id: 'P',
      source_project_name: 'P',
      category: 'Digital',
      default_power_W: 1,
      thermal_spec: {} as LibraryEntry['thermal_spec'],
      template_preference: null as unknown as LibraryEntry['template_preference'],
      saved_at: savedAt,
    };
  }

  it('merges a colleague’s parts in when both saved the library, and keeps the local copy in step', async () => {
    graph.drive.put(`${FOLDER}/${LIBRARY_FILENAME}`, serializeLibrary([entry('LIB_A', '2026-01-01')]));
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();
    await useComponentLibraryStore.getState().loadWithFolder();

    // A colleague adds a part after this session read the library.
    graph.drive.put(
      `${FOLDER}/${LIBRARY_FILENAME}`,
      serializeLibrary([entry('LIB_A', '2026-01-01'), entry('LIB_THEIRS', '2026-02-01')]),
    );
    useComponentLibraryStore.getState().importFile(serializeLibrary([entry('LIB_MINE', '2026-03-01')]));

    const ids = (text: string | null | undefined) =>
      (JSON.parse(text ?? '{"entries":[]}').entries as LibraryEntry[]).map((e) => e.id).sort();
    await vi.waitFor(() => {
      expect(ids(graph.drive.text(LIBRARY_FILENAME))).toEqual(['LIB_A', 'LIB_MINE', 'LIB_THEIRS']);
      expect(ids(local.files.get(LIBRARY_FILENAME)?.text)).toContain('LIB_MINE');
    });
    expect(useComponentLibraryStore.getState().entries.map((e) => e.id).sort()).toEqual([
      'LIB_A',
      'LIB_MINE',
      'LIB_THEIRS',
    ]);
  });
});

describe('an expired sign-in', () => {
  it('stops writing to SharePoint, asks for a click, and writes the edits made meanwhile after it', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    auth.expired = true;
    rename('Edited while signed out');
    markProjectUnsynced(DEMO_PROJECT_ID, 'sharepoint');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(false);
    expect(useFolderStore.getState().sharepoint.status).toBe('needs_permission');

    expect(await useFolderStore.getState().reconnect('sharepoint')).toBe(true);
    expect(auth.popups).toBe(1);
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Edited while signed out');
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Edited while signed out');
    expect(loadUnsyncedMarkers('sharepoint')).toEqual({});
  });
});

describe('a newer version on SharePoint', () => {
  it('is read in before the project opens, when this browser has no edits to it', async () => {
    const text = await demoOnSharePoint();
    await openSharePoint();

    const theirs = JSON.parse(text);
    theirs.project_name = 'Newer on SharePoint';
    theirs.data.project.project_name = 'Newer on SharePoint';
    graph.drive.put(`${FOLDER}/${DEMO_FILE}`, JSON.stringify(theirs));

    await useFolderStore.getState().checkRemote(DEMO_PROJECT_ID);
    expect(useFolderStore.getState().remoteChange?.by).toBe('Colleague B');

    await useFolderStore.getState().refreshProject(DEMO_PROJECT_ID);
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Newer on SharePoint');
    expect(useFolderStore.getState().remoteChange).toBeNull();

    // And the next save is checked against that version, not the old one.
    rename('Built on the newer version');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);
    expect(useFolderStore.getState().conflict).toBeNull();
  });

  it('is left alone while this browser still has unsaved edits to the project', async () => {
    const text = await demoOnSharePoint();
    await openSharePoint();

    const theirs = JSON.parse(text);
    theirs.data.project.project_name = 'Theirs';
    graph.drive.put(`${FOLDER}/${DEMO_FILE}`, JSON.stringify(theirs));
    rename('Mine, not yet written');
    markProjectUnsynced(DEMO_PROJECT_ID, 'sharepoint');

    await useFolderStore.getState().refreshProject(DEMO_PROJECT_ID);
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Mine, not yet written');
  });
});

describe('SharePointDirectory', () => {
  it('ignores the pre-write copy SharePoint may still list right after our own write', async () => {
    await openSharePoint();
    const dir = new SharePointDirectory();
    const file = await dir.getFileHandle('x.tnv.json', { create: true });
    const writable = await file.createWritable();
    await writable.write('{"v":2}');
    await writable.close();
    const ours = dir.cached('x.tnv.json')!;

    // SharePoint answers with an older timestamp for a moment.
    const stored = graph.drive.files.get(`${FOLDER}/x.tnv.json`)!;
    stored.modified = new Date(ours.modified - 60_000).toISOString();
    stored.etag = '"stale"';
    await dir.list();
    expect(dir.cached('x.tnv.json')?.etag).toBe(ours.etag);
  });
});

// --- SharePoint and the local folder together ------------------------------------

describe('SharePoint and a local folder together', () => {
  it('writes every save to both, and keeps a local copy of what SharePoint has', async () => {
    await demoOnSharePoint();
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();

    // Read from SharePoint; the local folder now holds the same project.
    expect(useFolderStore.getState().source).toBe('sharepoint');
    expect(nameIn(local.files.get(DEMO_FILE)?.text)).toBe(nameIn(graph.drive.text(DEMO_FILE)));

    rename('Saved to both');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Saved to both');
    expect(nameIn(local.files.get(DEMO_FILE)?.text)).toBe('Saved to both');
    const state = useFolderStore.getState();
    expect(state.lastSyncAt).not.toBeNull();
    expect(state.sharepoint.lastSyncAt).not.toBeNull();
    expect(state.pendingCount).toEqual({ local: 0, sharepoint: 0 });
  });

  it('keeps saving to the local folder while SharePoint is signed out, and catches SharePoint up after', async () => {
    await demoOnSharePoint();
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();

    auth.expired = true;
    rename('Written locally first');
    markProjectUnsynced(DEMO_PROJECT_ID, 'sharepoint');
    markProjectUnsynced(DEMO_PROJECT_ID, 'local');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(false);

    // Safe on this computer, owed to SharePoint.
    expect(nameIn(local.files.get(DEMO_FILE)?.text)).toBe('Written locally first');
    expect(useFolderStore.getState().sharepoint.status).toBe('needs_permission');
    expect(useFolderStore.getState().pendingCount).toEqual({ local: 0, sharepoint: 1 });
    expect(hasUnsyncedProjects()).toBe(false);

    expect(await useFolderStore.getState().reconnect('sharepoint')).toBe(true);
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Written locally first');
    expect(useFolderStore.getState().pendingCount).toEqual({ local: 0, sharepoint: 0 });
  });

  it('opens from the local copy when SharePoint cannot be reached, and reads SharePoint again once it can', async () => {
    await demoOnSharePoint();
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();

    // A day offline: SharePoint answers nothing.
    graph.drive.down = true;
    await useFolderStore.getState().hydrate();
    expect(useFolderStore.getState().source).toBe('local');
    expect(useFolderStore.getState().hydrated).toBe(true);
    expect(useFolderStore.getState().sharepoint.status).toBe('error');
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();

    // Work goes on, into the local folder; SharePoint is owed it.
    rename('Offline edit');
    markProjectUnsynced(DEMO_PROJECT_ID, 'sharepoint');
    markProjectUnsynced(DEMO_PROJECT_ID, 'local');
    await useFolderStore.getState().mirror(DEMO_PROJECT_ID);
    expect(nameIn(local.files.get(DEMO_FILE)?.text)).toBe('Offline edit');

    // Back online.
    graph.drive.down = false;
    expect(await useFolderStore.getState().reconnect('sharepoint')).toBe(true);
    await settle();
    expect(useFolderStore.getState().source).toBe('sharepoint');
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Offline edit');
    expect(loadUnsyncedMarkers('sharepoint')).toEqual({});
  });

  it('pairs a local folder with SharePoint without overwriting either side', async () => {
    const demo = await demoFile();
    const other = JSON.parse(demo);
    other.project_id = 'OTHER';
    other.project_name = 'Other (local)';
    other.data.project.project_id = 'OTHER';
    other.data.project.project_name = 'Other (local)';
    const theirs = JSON.parse(JSON.stringify(other));
    theirs.project_name = 'Other (SharePoint)';
    theirs.data.project.project_name = 'Other (SharePoint)';
    graph.drive.put(`${FOLDER}/OTHER.tnv.json`, JSON.stringify(theirs));

    // The local folder is the whole workspace so far.
    const local = memoryFolder('ThermalProjects', {
      [DEMO_FILE]: demo,
      'OTHER.tnv.json': JSON.stringify(other),
    });
    await openLocal(local);

    await openSharePoint();
    await settle();

    // What only the folder had went up…
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe(nameIn(demo));
    // …SharePoint's version of OTHER stayed, and the local one became its own project.
    expect(nameIn(graph.drive.text('OTHER.tnv.json'))).toBe('Other (SharePoint)');
    expect(loadProject('OTHER')?.project_name).toBe('Other (SharePoint)');
    const copy = loadProjects().find((p) => p.project_id.startsWith('OTHER_local_copy'))!;
    expect(copy.project_name).toMatch(/^Other \(local\) \(local copy /);
    await vi.waitFor(() => expect(graph.drive.text(mirrorFilename(copy.project_id))).not.toBeNull());
    // The local folder now mirrors SharePoint, the copy included.
    expect(nameIn(local.files.get('OTHER.tnv.json')?.text)).toBe('Other (SharePoint)');
    expect(local.files.has(mirrorFilename(copy.project_id))).toBe(true);
    expect(useFolderStore.getState().notice).toContain('local copy');
  });

  it('keeps a local file changed outside the tool as its own project instead of overwriting it', async () => {
    await demoOnSharePoint();
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();

    // Someone edits the local copy by hand.
    const edited = JSON.parse(local.files.get(DEMO_FILE)!.text);
    edited.project_name = 'Edited by hand';
    edited.data.project.project_name = 'Edited by hand';
    local.touch(DEMO_FILE, JSON.stringify(edited));

    await useFolderStore.getState().hydrate();
    await settle();

    expect(loadProjects().some((p) => /^Edited by hand \(local copy /.test(p.project_name))).toBe(true);
    expect(nameIn(local.files.get(DEMO_FILE)?.text)).toBe(nameIn(graph.drive.text(DEMO_FILE)));
  });

  it('moves the local file of a project deleted on SharePoint into Replaced/, never deleting it', async () => {
    await demoOnSharePoint();
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();
    expect(local.files.has(DEMO_FILE)).toBe(true);

    // A colleague deletes the project on SharePoint.
    graph.drive.files.delete(`${FOLDER}/${DEMO_FILE}`);
    await useFolderStore.getState().hydrate();
    await settle();

    expect(loadProject(DEMO_PROJECT_ID)).toBeNull();
    expect(local.files.has(DEMO_FILE)).toBe(false);
    const replaced = local.sub.get('Replaced')!;
    expect([...replaced.files.keys()].some((name) => name.startsWith('FR1_RRU_GOLDEN_DEMO_'))).toBe(true);
  });

  it('will not delete a project while SharePoint is signed out', async () => {
    await demoOnSharePoint();
    await openSharePoint();
    useFolderStore.setState((state) => ({ sharepoint: { ...state.sharepoint, status: 'needs_permission' } }));
    expect(useFolderStore.getState().deleteBlocker()).toMatch(/SharePoint/);
  });

  it('stops using SharePoint without touching its files, and goes on from the local copy', async () => {
    await demoOnSharePoint();
    const local = memoryFolder();
    useFolderStore.setState({ handle: local, folderName: local.name, status: 'connected' });
    await openSharePoint();
    await settle();

    await useFolderStore.getState().disconnect('sharepoint');

    expect(useFolderStore.getState().source).toBe('local');
    expect(useFolderStore.getState().sharepoint.enabled).toBe(false);
    expect(localStorage.getItem('tnv-storage-sharepoint')).toBeNull();
    expect(graph.drive.text(DEMO_FILE)).not.toBeNull();
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();
  });
});

describe('a session that opened while SharePoint was unreachable', () => {
  it('writes over the file it last synced, instead of calling it a conflict', async () => {
    await demoOnSharePoint();
    await openSharePoint();
    rename('Synced before going offline');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);

    // A new session that never read the folder: it does not know the eTag.
    useFolderStore.setState((state) => ({
      sharepoint: { ...state.sharepoint, handle: new SharePointDirectory(), projectFilenames: {} },
    }));
    rename('Written after coming back');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);

    expect(useFolderStore.getState().conflict).toBeNull();
    expect(nameIn(graph.drive.text(DEMO_FILE))).toBe('Written after coming back');
    expect(loadProjects()).toHaveLength(1);
  });
});

describe('closing the tab', () => {
  it('warns while an edit has reached neither place, with only SharePoint set up', async () => {
    const { hasWorkNotOnDisk } = await import('./unloadGuard');
    await demoOnSharePoint();
    await openSharePoint();
    expect(hasWorkNotOnDisk()).toBe(false);

    rename('Not yet written');
    markProjectUnsynced(DEMO_PROJECT_ID, 'sharepoint');
    expect(hasWorkNotOnDisk()).toBe(true);
  });
});
