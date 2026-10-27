import { describe, expect, it } from 'vitest';

import { displayVersion, fetchLiveVersion, isLatest } from './updateCheck';

const respond = (status: number, body: unknown) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as typeof fetch;

describe('update check', () => {
  it('shows the version without the commit', () => {
    expect(displayVersion('2026.10.27.1402-0cae7fc')).toBe('v2026.10.27.1402');
    expect(displayVersion('2026.10.27.1402')).toBe('v2026.10.27.1402');
    expect(displayVersion('dev')).toBe('開發版');
  });

  it('compares only when both versions are known', () => {
    expect(isLatest('2026.10.27.1402-0cae7fc', '2026.10.27.1402-0cae7fc')).toBe(true);
    expect(isLatest('2026.10.27.1500-1234567', '2026.10.27.1402-0cae7fc')).toBe(false);
    expect(isLatest(null, '2026.10.27.1402-0cae7fc')).toBeNull();
    // A dev server has nothing deployed to compare with.
    expect(isLatest('2026.10.27.1402-0cae7fc', 'dev')).toBeNull();
  });

  it('reads version.json and asks past the cache', async () => {
    let asked: { url: string; init?: RequestInit } | null = null;
    const fetcher = (async (url: string, init?: RequestInit) => {
      asked = { url, init };
      return new Response(JSON.stringify({ version: '2026.10.27.1500-1234567' }));
    }) as typeof fetch;
    await expect(fetchLiveVersion('/RRU-Thermal-Network-Visualizer/', fetcher)).resolves.toBe(
      '2026.10.27.1500-1234567',
    );
    expect(asked!.url).toMatch(/^\/RRU-Thermal-Network-Visualizer\/version\.json\?t=\d+$/);
    expect(asked!.init?.cache).toBe('no-store');
  });

  it('treats anything unreadable as unknown, never as a new version', async () => {
    await expect(fetchLiveVersion('/', respond(404, 'Not Found'))).resolves.toBeNull();
    await expect(fetchLiveVersion('/', respond(200, '<html>'))).resolves.toBeNull();
    await expect(fetchLiveVersion('/', respond(200, { version: '' }))).resolves.toBeNull();
    await expect(fetchLiveVersion('/', respond(200, { other: 1 }))).resolves.toBeNull();
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(fetchLiveVersion('/', offline)).resolves.toBeNull();
  });
});
