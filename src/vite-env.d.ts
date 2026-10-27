/// <reference types="vite/client" />

/**
 * Identifier of the build that produced this bundle, injected by `vite.config.ts`.
 * `dev` under `vite dev`; the short commit sha (or build timestamp) for a build.
 */
declare const __BUILD_ID__: string;

/**
 * The version shown in the header and published as `version.json`, injected by
 * `vite.config.ts`: Taipei build time plus the short sha, or `dev`.
 */
declare const __APP_VERSION__: string;

interface Window {
  /**
   * Clears every `tnv.*` collection, re-seeds the demo project and reloads.
   * Console escape hatch for local development — see `src/data/bootstrapStorage.ts`.
   */
  tnvResetStorage?: () => void;
}
