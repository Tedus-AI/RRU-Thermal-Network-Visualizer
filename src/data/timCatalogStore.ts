/**
 * The TIM Management Tool's TIM 型號目錄, read once per session (`domain/timCatalog.ts`).
 *
 * Read only, and only when SharePoint can be used without a popup: a project opened from a local
 * folder still works — its linked materials keep the name and k they were saved with.
 */

import { create } from 'zustand';

import { parseTimCatalog, type TimCatalog } from '@/domain/timCatalog';
import { readTimCatalog, sharePoint } from './sharepoint';

export type TimCatalogState = 'idle' | 'loading' | 'ok' | 'missing' | 'login' | 'error';

interface TimCatalogStore {
  catalog: TimCatalog | null;
  state: TimCatalogState;
  error: string;
  /** Reads the file; `force` reads it again even when it was read this session. */
  load: (force?: boolean) => Promise<void>;
}

export const useTimCatalogStore = create<TimCatalogStore>((set, get) => ({
  catalog: null,
  state: 'idle',
  error: '',
  load: async (force = false) => {
    const current = get().state;
    if (current === 'loading' || (!force && current !== 'idle')) return;
    set({ state: 'loading', error: '' });
    try {
      if (!(await sharePoint.canUseSilently())) {
        set({ catalog: null, state: 'login' });
        return;
      }
      const raw = await readTimCatalog();
      if (raw == null) {
        set({ catalog: null, state: 'missing' });
        return;
      }
      const catalog = parseTimCatalog(raw);
      set(catalog ? { catalog, state: 'ok' } : { catalog: null, state: 'error', error: '檔案格式不符' });
    } catch (error) {
      set({ catalog: null, state: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },
}));

/** What to tell the engineer when there is no catalog to show. */
export function timCatalogStateText(state: TimCatalogState, error: string): string {
  switch (state) {
    case 'login':
      return '需要登入 Microsoft（SharePoint）才讀得到 TIM 管理工具的材料庫；已連結的材料照用存下來的名稱與 k。';
    case 'missing':
      return 'SharePoint 上還沒有 TIM 型號目錄：請先用 TIM 管理工具以 SharePoint 開啟一次（會自動產生）。';
    case 'error':
      return `讀不到 TIM 管理工具的型號目錄（${error}）；已連結的材料照用存下來的值。`;
    case 'loading':
      return '讀取中…';
    default:
      return '';
  }
}
