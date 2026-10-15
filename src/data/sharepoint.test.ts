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
import { mirrorFilename } from './folderBinding';
import { useFolderStore } from './folderStore';
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

// --- harness --------------------------------------------------------------------

let graph: ReturnType<typeof fakeGraph>;
let auth: { expired: boolean; logins: number; popups: number };

const DEMO_FILE = mirrorFilename(DEMO_PROJECT_ID);

/** The demo project as a file on SharePoint, and an empty browser cache. */
async function demoOnSharePoint(): Promise<string> {
  await seedDemoProject();
  const text = serializeProjectFile(collectProject(DEMO_PROJECT_ID, BUILD_ID)!);
  graph.drive.put(`${FOLDER}/${DEMO_FILE}`, text);
  clearWorkingCache();
  return text;
}

async function openSharePoint(): Promise<void> {
  expect(await useFolderStore.getState().connectSharePoint()).toBe(true);
}

function rename(name: string) {
  saveProject({ ...loadProject(DEMO_PROJECT_ID)!, project_name: name });
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
    backend: null,
    handle: null,
    folderName: null,
    account: null,
    lastSyncAt: null,
    lastSyncedProjectId: null,
    lastError: null,
    syncing: false,
    projectFilenames: {},
    hydrated: false,
    conflict: null,
    remoteChange: null,
    notice: null,
  });
});

afterEach(() => {
  useProjectStore.getState().clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// --- tests ------------------------------------------------------------------------

describe('opening SharePoint', () => {
  it('signs in once, remembers the choice, and reads the projects from the shared folder', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    const state = useFolderStore.getState();
    expect(auth.logins).toBe(1);
    expect(state.backend).toBe('sharepoint');
    expect(state.status).toBe('connected');
    expect(state.hydrated).toBe(true);
    expect(state.account?.email).toBe('tester.a@example.test');
    expect(localStorage.getItem('tnv-storage-backend')).toBe('sharepoint');
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

describe('saving', () => {
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
    expect(JSON.parse(graph.drive.text(DEMO_FILE)!).project_name).toBe('Second edit');
    expect(loadUnsyncedMarkers()).toEqual({});
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
    expect(JSON.parse(graph.drive.text(DEMO_FILE)!).project_name).toBe('B');
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
    expect(JSON.parse(graph.drive.text(DEMO_FILE)!).project_name).toBe('Their edit');
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Their edit');
    // …and nothing of ours was lost.
    const conflict = useFolderStore.getState().conflict!;
    expect(conflict.projectId).toBe(DEMO_PROJECT_ID);
    expect(conflict.copyId).toBe(`${DEMO_PROJECT_ID}_conflict`);
    expect(conflict.remoteBy).toBe('Colleague B');
    expect(loadProject(conflict.copyId)?.project_name).toMatch(/^My edit \(conflict copy /);
    await vi.waitFor(() => expect(graph.drive.text(mirrorFilename(conflict.copyId))).not.toBeNull());
    expect(JSON.parse(graph.drive.text(mirrorFilename(conflict.copyId))!).project_name).toMatch(
      /^My edit \(conflict copy /,
    );

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
    expect(JSON.parse(graph.drive.text(DEMO_FILE)!).project_name).toBe('My edit');
    expect(loadProjects()).toHaveLength(1);
  });

  it('recognises its own write whose reply was lost, instead of calling it a conflict', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    graph.drive.lostReply = 504;
    rename('Landed, reply lost');
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(false);
    expect(useFolderStore.getState().status).toBe('error');

    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(true);
    expect(useFolderStore.getState().conflict).toBeNull();
    expect(useFolderStore.getState().status).toBe('connected');
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

  it('merges a colleague’s parts in when both saved the library', async () => {
    graph.drive.put(`${FOLDER}/${LIBRARY_FILENAME}`, serializeLibrary([entry('LIB_A', '2026-01-01')]));
    await openSharePoint();
    await useComponentLibraryStore.getState().loadWithFolder();

    // A colleague adds a part after this session read the library.
    graph.drive.put(
      `${FOLDER}/${LIBRARY_FILENAME}`,
      serializeLibrary([entry('LIB_A', '2026-01-01'), entry('LIB_THEIRS', '2026-02-01')]),
    );
    useComponentLibraryStore.getState().importFile(
      serializeLibrary([entry('LIB_MINE', '2026-03-01')]),
    );

    await vi.waitFor(() => {
      const ids = JSON.parse(graph.drive.text(LIBRARY_FILENAME)!).entries.map((e: LibraryEntry) => e.id);
      expect(ids.sort()).toEqual(['LIB_A', 'LIB_MINE', 'LIB_THEIRS']);
    });
    expect(useComponentLibraryStore.getState().entries.map((e) => e.id).sort()).toEqual([
      'LIB_A',
      'LIB_MINE',
      'LIB_THEIRS',
    ]);
  });
});

describe('an expired sign-in', () => {
  it('stops writing, asks for a click, and writes the edits made meanwhile after it', async () => {
    await demoOnSharePoint();
    await openSharePoint();

    auth.expired = true;
    rename('Edited while signed out');
    markProjectUnsynced(DEMO_PROJECT_ID);
    expect(await useFolderStore.getState().mirror(DEMO_PROJECT_ID)).toBe(false);
    expect(useFolderStore.getState().status).toBe('needs_permission');

    expect(await useFolderStore.getState().reconnect()).toBe(true);
    expect(auth.popups).toBe(1);
    expect(JSON.parse(graph.drive.text(DEMO_FILE)!).project_name).toBe('Edited while signed out');
    expect(loadProject(DEMO_PROJECT_ID)?.project_name).toBe('Edited while signed out');
    expect(loadUnsyncedMarkers()).toEqual({});
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
    markProjectUnsynced(DEMO_PROJECT_ID);

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

describe('moving a local folder to SharePoint', () => {
  /** A local folder in memory. */
  function localFolder(files: Record<string, string>) {
    const map = new Map(Object.entries(files));
    const fileHandle = (name: string) => ({
      name,
      kind: 'file' as const,
      async getFile() {
        const text = map.get(name);
        if (text == null) throw new Error('missing');
        return { text: async () => text, lastModified: 1, size: text.length };
      },
      async createWritable() {
        let buffer = '';
        return {
          async write(data: string | Blob) {
            buffer += String(data);
          },
          async close() {
            map.set(name, buffer);
          },
        };
      },
    });
    return {
      name: 'ThermalProjects',
      kind: 'directory' as const,
      map,
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!map.has(name) && !options?.create) throw new Error('missing');
        return fileHandle(name);
      },
      async *values() {
        for (const name of [...map.keys()]) yield fileHandle(name);
      },
      async queryPermission() {
        return 'granted' as const;
      },
      async requestPermission() {
        return 'granted' as const;
      },
    };
  }

  it('uploads what SharePoint lacks, leaves what it has, merges the library, and continues there', async () => {
    await seedDemoProject();
    const demo = serializeProjectFile(collectProject(DEMO_PROJECT_ID, BUILD_ID)!);
    const other = JSON.parse(demo);
    other.project_id = 'OTHER';
    other.project_name = 'Other';
    other.data.project.project_id = 'OTHER';
    other.data.project.project_name = 'Other';
    clearWorkingCache();
    const local = localFolder({
      // A timestamped export goes up under the project's own name.
      [`${DEMO_PROJECT_ID}_20260101000000.tnv.json`]: demo,
      'OTHER.tnv.json': JSON.stringify(other),
      [LIBRARY_FILENAME]: serializeLibrary([
        {
          id: 'LIB_LOCAL',
          name: 'LIB_LOCAL',
          source_project_id: 'P',
          source_project_name: 'P',
          category: 'Digital',
          default_power_W: 1,
          thermal_spec: {} as LibraryEntry['thermal_spec'],
          template_preference: null as unknown as LibraryEntry['template_preference'],
          saved_at: '2026-01-01',
        },
      ]),
    });
    // OTHER is already on SharePoint: it must not be replaced.
    graph.drive.put(`${FOLDER}/OTHER.tnv.json`, '{"format":"tnv.project","keep":"me"}');
    useFolderStore.setState({ backend: 'folder', handle: local, folderName: local.name, status: 'connected' });
    await useFolderStore.getState().hydrate();

    const report = await useFolderStore.getState().uploadToSharePoint();

    expect(report.ok).toBe(true);
    expect(report.uploaded).toEqual([DEMO_FILE]);
    expect(report.skipped).toEqual(['OTHER.tnv.json']);
    expect(report.library).toBe(true);
    expect(graph.drive.text('OTHER.tnv.json')).toBe('{"format":"tnv.project","keep":"me"}');
    expect(JSON.parse(graph.drive.text(DEMO_FILE)!).project_id).toBe(DEMO_PROJECT_ID);
    expect(JSON.parse(graph.drive.text(LIBRARY_FILENAME)!).entries[0].id).toBe('LIB_LOCAL');
    // The local files are untouched, and the tool now works on SharePoint.
    expect(local.map.get('OTHER.tnv.json')).toBe(JSON.stringify(other));
    expect(useFolderStore.getState().backend).toBe('sharepoint');
    expect(localStorage.getItem('tnv-storage-backend')).toBe('sharepoint');
    expect(loadProject(DEMO_PROJECT_ID)).not.toBeNull();
  });
});
