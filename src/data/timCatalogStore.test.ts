import { beforeEach, describe, expect, it, vi } from 'vitest';

const sp = vi.hoisted(() => ({ silent: true, raw: null as unknown, fail: null as Error | null, reads: 0 }));
vi.mock('./sharepoint', () => ({
  sharePoint: { canUseSilently: async () => sp.silent },
  readTimCatalog: async () => {
    sp.reads += 1;
    if (sp.fail) throw sp.fail;
    return sp.raw;
  },
}));

import { useTimCatalogStore } from './timCatalogStore';

const reset = () => useTimCatalogStore.setState({ catalog: null, state: 'idle', error: '' });

describe('timCatalogStore', () => {
  beforeEach(() => {
    reset();
    Object.assign(sp, { silent: true, raw: null, fail: null, reads: 0 });
  });

  it('reads once per session; force reads again', async () => {
    sp.raw = { format: 'tim-catalog', materials: [{ id: 'mat_gf', vendor: 'Vendor-B', model: 'GF-750', family: 'Pad', k: 7.8 }] };
    await useTimCatalogStore.getState().load();
    await useTimCatalogStore.getState().load();
    expect(sp.reads).toBe(1);
    expect(useTimCatalogStore.getState()).toMatchObject({ state: 'ok' });
    expect(useTimCatalogStore.getState().catalog?.materials[0].model).toBe('GF-750');
    await useTimCatalogStore.getState().load(true);
    expect(sp.reads).toBe(2);
  });

  it('not signed in → no request; missing file; not a catalog; an error', async () => {
    sp.silent = false;
    await useTimCatalogStore.getState().load();
    expect(useTimCatalogStore.getState().state).toBe('login');
    expect(sp.reads).toBe(0);
    reset(); sp.silent = true; sp.raw = null;
    await useTimCatalogStore.getState().load();
    expect(useTimCatalogStore.getState().state).toBe('missing');
    reset(); sp.raw = { schema: 'tim-db' };
    await useTimCatalogStore.getState().load();
    expect(useTimCatalogStore.getState()).toMatchObject({ state: 'error', error: '檔案格式不符' });
    reset(); sp.fail = new Error('SharePoint 連線逾時');
    await useTimCatalogStore.getState().load();
    expect(useTimCatalogStore.getState()).toMatchObject({ state: 'error', error: 'SharePoint 連線逾時', catalog: null });
  });
});
