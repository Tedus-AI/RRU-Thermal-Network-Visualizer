/**
 * 「清空瀏覽器暫存」 may only ever drop a copy that exists somewhere else.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserCacheClearBlocker, browserCacheUsage, formatCacheSize } from './browserCache';
import { BUILD_STAMP_KEY, type StorageLike } from './buildStamp';
import { useFolderStore } from './folderStore';
import { saveProject } from './persistence';
import { useSaveStatus } from './saveStatus';
import { createEmptyProject } from '@/domain/project';
import type { DirectoryHandle } from './folderBinding';

function memoryStorage(entries: Record<string, string>): StorageLike {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const folder = { name: 'DB3' } as unknown as DirectoryHandle;
const initial = useFolderStore.getState();

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage({}) as unknown as Storage);
  useSaveStatus.setState({ pending: false, error: null });
});
afterEach(() => {
  useFolderStore.setState(initial, true);
  vi.unstubAllGlobals();
});

describe('browser cache usage', () => {
  it('splits this tool from the rest of the site, keys included', () => {
    const usage = browserCacheUsage(
      memoryStorage({
        'tnv.projects': '12345',
        [BUILD_STAMP_KEY]: 'abc',
        'tnvui.flag.x': 'true',
        'sgThermal.tcpSide': 'left',
      }),
    );
    expect(usage.own).toBe('tnv.projects'.length + 5);
    // The build stamp is never cleared, so it counts with the rest.
    expect(usage.other).toBe(
      BUILD_STAMP_KEY.length + 3 + 'tnvui.flag.x'.length + 4 + 'sgThermal.tcpSide'.length + 4,
    );
  });

  it('reads sizes in bytes (two per character)', () => {
    expect(formatCacheSize(512)).toBe('1 KB');
    expect(formatCacheSize(3 * 1024 * 1024)).toBe('6.0 MB');
  });
});

describe('when clearing is refused', () => {
  it('nothing set up: the browser holds the only copy', () => {
    useFolderStore.setState({ handle: null, status: 'unbound' });
    expect(browserCacheClearBlocker()).toMatch(/沒有設定 SharePoint 或本機資料夾/);
  });

  it('set up but not connected', () => {
    useFolderStore.setState({ handle: folder, status: 'needs_permission' });
    expect(browserCacheClearBlocker()).toMatch(/沒有連上/);
  });

  it('an edit on its way', () => {
    useFolderStore.setState({ handle: folder, status: 'connected', projectFilenames: {} });
    useSaveStatus.setState({ pending: true });
    expect(browserCacheClearBlocker()).toMatch(/還有修改沒寫入/);
  });

  it('a project that never reached the folder', () => {
    saveProject({ ...createEmptyProject(), project_id: 'ONLY_HERE', project_name: '只在瀏覽器' });
    useFolderStore.setState({ handle: folder, status: 'connected', projectFilenames: {} });
    expect(browserCacheClearBlocker()).toMatch(/「只在瀏覽器」只在瀏覽器裡/);
  });

  it('allows it once every project is in a connected place', () => {
    saveProject({ ...createEmptyProject(), project_id: 'P1', project_name: 'P1' });
    useFolderStore.setState({
      handle: folder,
      status: 'connected',
      projectFilenames: { P1: 'P1.tnv.json' },
    });
    expect(browserCacheClearBlocker()).toBeNull();
  });
});
