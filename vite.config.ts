import { defineConfig } from 'vite';
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

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app from /<repo>/, so the CI build sets this.
  // Local dev and any root-hosted deployment keep '/'.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId(command)),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
}));
