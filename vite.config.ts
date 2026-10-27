import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Identifies the build that produced a bundle, so persisted `tnv.*` data can be
 * detected as belonging to an older one (see `src/data/buildStamp.ts`).
 *
 * Dev keeps a constant: the id must not change on every dev-server restart, or
 * a project would be wiped mid-session. A build takes the commit sha where CI
 * provides one, and falls back to the build time for a local `npm run build`.
 */
function buildId(command: 'build' | 'serve'): string {
  if (command === 'serve') return 'dev';
  const sha = process.env.GITHUB_SHA;
  return sha ? sha.slice(0, 12) : new Date().toISOString();
}

/**
 * The version a person reads — the build time in Taipei and the short commit
 * sha, the same shape AI-Thermal and 5G-RRU stamp (`2026.10.27.1402-0cae7fc`).
 * `dev` under `vite dev`, which turns the update check off.
 */
function appVersion(command: 'build' | 'serve'): string {
  if (command === 'serve') return 'dev';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const stamp = `${parts.year}.${parts.month}.${parts.day}.${parts.hour}${parts.minute}`;
  const sha = process.env.GITHUB_SHA;
  return sha ? `${stamp}-${sha.slice(0, 7)}` : stamp;
}

/**
 * Publishes `version.json` beside the bundle. A running tab fetches it to find
 * out a newer build was deployed (`src/app/updateCheck.ts`).
 */
function versionFile(version: string): Plugin {
  return {
    name: 'tnv-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const version = appVersion(command);
  return {
    // GitHub Pages serves the app from /<repo>/, so the CI build sets this.
    // Local dev and any root-hosted deployment keep '/'.
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), versionFile(version)],
    define: {
      __BUILD_ID__: JSON.stringify(buildId(command)),
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
  };
});
