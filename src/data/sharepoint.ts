/**
 * SharePoint client — Microsoft sign-in (MSAL.js) and Microsoft Graph requests.
 *
 * Same Azure app registration, tenant and SharePoint site as the Project TIM
 * Manager (which took them from the AI Thermal tool), so one Microsoft sign-in
 * serves all of them. Projects live in the site's 文件 (Shared Documents)
 * library, laid out exactly like a local project folder:
 *
 *   RRU_Thermal_Network/Database/<project id>.tnv.json        one per project
 *   RRU_Thermal_Network/Database/component-library.tnv.json   the shared library
 *
 * Missing folders are created by the first write. There is no Backup folder:
 * SharePoint keeps every version of a file (Version History), and a deleted
 * file goes to the site's Recycle Bin.
 *
 * This module is sign-in, tokens and the raw request. The folder itself —
 * listing, reading, conditional writes — is `SharePointDirectory`
 * (`sharepointFolder.ts`), which implements the same `DirectoryHandle` as a
 * local folder so the whole save pipeline is shared.
 *
 * Redirect URI: `<site>/auth.html` (see `public/auth.html`) must be registered
 * on the Azure app as a Single-page application redirect URI, next to the TIM
 * Manager's.
 */

export const SHAREPOINT_CONFIG = {
  clientId: '17fc1ab4-0ab0-4520-9315-6faa86d9e8ec',
  authority: 'https://login.microsoftonline.com/19f25823-17ff-421f-ad4e-8fed035aedda',
  scopes: ['Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All'],
  siteHostname: 'deltao365.sharepoint.com',
  sitePath: '/sites/Thermal-Spec-DB',
  siteName: 'Thermal-Spec-DB',
  /** How the site's default document library (Shared Documents) is labelled in SharePoint. */
  libraryLabel: '文件',
  /** Inside that library. */
  dataFolder: 'RRU_Thermal_Network/Database',
} as const;

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GET_MS = 30_000;
const PUT_MS = 120_000;

// --- errors ----------------------------------------------------------------

export interface SharePointErrorProps {
  status?: number;
  /** Signed out, or the sign-in expired: a click on "Sign in" fixes it. */
  auth?: boolean;
  /** 412 / 409 — the file changed (or appeared) on SharePoint since it was read. */
  conflict?: boolean;
  /** Never reached SharePoint: offline, blocked, or timed out. */
  network?: boolean;
  /** A write that may still have reached SharePoint (timed out, 5xx). */
  uncertain?: boolean;
}

export class SharePointError extends Error implements SharePointErrorProps {
  status?: number;
  auth?: boolean;
  conflict?: boolean;
  network?: boolean;
  uncertain?: boolean;

  constructor(message: string, props: SharePointErrorProps = {}) {
    super(message);
    this.name = 'SharePointError';
    Object.assign(this, props);
  }
}

export function isSharePointError(error: unknown): error is SharePointError {
  return error instanceof SharePointError;
}

export const SP_MESSAGES = {
  notSignedIn: 'Not signed in to Microsoft / 尚未登入 Microsoft 帳號',
  expired: 'Microsoft sign-in expired — sign in again / Microsoft 登入已過期，請重新登入',
};

function siteLabel(): string {
  return `${SHAREPOINT_CONFIG.siteHostname}${SHAREPOINT_CONFIG.sitePath}`;
}

async function httpError(res: Response): Promise<SharePointError> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    detail = body?.error?.message || body?.error?.code || '';
  } catch {
    // Not JSON.
  }
  const s = res.status;
  const message =
    s === 401
      ? SP_MESSAGES.expired
      : s === 403
        ? `No permission for SharePoint site ${SHAREPOINT_CONFIG.siteName} — the account needs edit access / 沒有權限存取 SharePoint 網站 ${SHAREPOINT_CONFIG.siteName}（請確認帳號有該網站的編輯權限）`
        : s === 404
          ? 'Not found on SharePoint / 在 SharePoint 上找不到'
          : s === 409
            ? 'A file with this name was just created on SharePoint / SharePoint 上剛建立了同名檔案'
            : s === 412
              ? 'Changed on SharePoint by someone else / 檔案剛被其他人更新'
              : s === 423
                ? 'The file is locked on SharePoint (open in another program?) / SharePoint 檔案被鎖定（可能正被其他程式開啟）'
                : s === 429
                  ? 'SharePoint asked to slow down (429) / SharePoint 要求放慢速度（429）'
                  : s === 507
                    ? 'SharePoint storage is full / SharePoint 空間不足'
                    : `SharePoint error ${s} / SharePoint 錯誤 ${s}`;
  const showDetail = detail && s !== 404 && s !== 409 && s !== 412;
  return new SharePointError(showDetail ? `${message}: ${detail}` : message, {
    status: s,
    auth: s === 401,
    conflict: s === 409 || s === 412,
  });
}

// --- MSAL --------------------------------------------------------------------

/** The slice of an MSAL account this tool reads. */
export interface MsalAccount {
  name?: string;
  username: string;
}

interface TokenResult {
  accessToken: string;
  account?: MsalAccount | null;
}

/** The slice of `PublicClientApplication` (msal-browser 2.x) this tool calls. */
interface MsalApp {
  initialize?: () => Promise<void>;
  handleRedirectPromise: () => Promise<{ account?: MsalAccount | null } | null>;
  getAllAccounts: () => MsalAccount[];
  acquireTokenSilent: (request: { scopes: string[]; account: MsalAccount }) => Promise<TokenResult>;
  acquireTokenPopup: (request: { scopes: string[]; account: MsalAccount }) => Promise<TokenResult>;
  loginPopup: (request: { scopes: string[]; prompt?: string }) => Promise<{ account?: MsalAccount | null }>;
}

interface MsalModule {
  PublicClientApplication: new (configuration: unknown) => MsalApp;
}

/**
 * msal-browser, loaded on first use so it stays out of the main bundle.
 *
 * A `window.msal` defined before the page loads wins — the same seam the TIM
 * Manager's tests use to stand in for Microsoft sign-in.
 */
async function loadMsal(): Promise<MsalModule> {
  const injected = (globalThis as { msal?: MsalModule }).msal;
  if (injected && typeof injected.PublicClientApplication === 'function') return injected;
  return (await import('@azure/msal-browser')) as unknown as MsalModule;
}

/**
 * `auth.html` at the app's base — not next to the current route, which in this
 * single-page app can be `/project/<id>/info`. A blank page, so neither the
 * sign-in popup nor MSAL's hidden renewal iframe boots a second copy of the tool.
 */
function redirectUri(): string {
  const base = import.meta.env?.BASE_URL || '/';
  const origin = typeof location === 'undefined' ? '' : location.origin;
  return `${origin}${base.endsWith('/') ? base : `${base}/`}auth.html`;
}

let pca: MsalApp | null = null;
let initPromise: Promise<MsalApp> | null = null;
let account: MsalAccount | null = null;
let needsLogin = false;
let siteId: string | null = null;

function scopes(): string[] {
  return [...SHAREPOINT_CONFIG.scopes];
}

function init(): Promise<MsalApp> {
  if (pca) return Promise.resolve(pca);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const msal = await loadMsal();
    const app = new msal.PublicClientApplication({
      auth: {
        clientId: SHAREPOINT_CONFIG.clientId,
        authority: SHAREPOINT_CONFIG.authority,
        redirectUri: redirectUri(),
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    });
    if (typeof app.initialize === 'function') await app.initialize();
    try {
      const result = await app.handleRedirectPromise();
      if (result?.account) account = result.account;
    } catch {
      // No redirect in progress.
    }
    if (!account) {
      const all = app.getAllAccounts();
      if (all.length > 0) account = all[0];
    }
    pca = app;
    return app;
  })();
  initPromise.catch(() => {
    initPromise = null;
  });
  return initPromise;
}

/** An access token. `interactive` may open a popup, so only from a click. */
async function token(interactive: boolean): Promise<string> {
  const app = await init();
  if (!account) {
    needsLogin = true;
    throw new SharePointError(SP_MESSAGES.notSignedIn, { auth: true });
  }
  try {
    const result = await app.acquireTokenSilent({ scopes: scopes(), account });
    needsLogin = false;
    return result.accessToken;
  } catch {
    if (!interactive) {
      needsLogin = true;
      throw new SharePointError(SP_MESSAGES.expired, { auth: true });
    }
    const result = await app.acquireTokenPopup({ scopes: scopes(), account });
    if (result.account) account = result.account;
    needsLogin = false;
    return result.accessToken;
  }
}

// --- Graph -------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function timed(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new SharePointError(
      aborted
        ? `SharePoint did not answer within ${Math.round(ms / 1000)} s / SharePoint 連線逾時（${Math.round(ms / 1000)} 秒沒有回應）`
        : `Cannot reach SharePoint (${error instanceof Error ? error.message : String(error)}) / 無法連線到 SharePoint`,
      { network: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface GraphOptions {
  method?: 'GET' | 'PUT' | 'DELETE' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  /** May open the sign-in popup — only from a click. */
  interactive?: boolean;
  /** Statuses that are answers, not errors (e.g. 404 for "does it exist?"). */
  ok?: (status: number) => boolean;
  timeout?: number;
}

/**
 * One Graph request, with a timeout. A GET is retried once on a network error,
 * 429 or 5xx. A PUT / DELETE that may still have reached the server is marked
 * `uncertain`, so the caller can tell "failed" from "don't know".
 */
export async function graph(path: string, options: GraphOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET';
  const url = /^https:/.test(path) ? path : `${GRAPH}${path}`;
  const tries = method === 'GET' ? 2 : 1;
  let last: SharePointError | null = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (attempt > 0) await sleep(700);
    const headers = {
      Authorization: `Bearer ${await token(Boolean(options.interactive))}`,
      ...(options.headers ?? {}),
    };
    let res: Response;
    try {
      res = await timed(
        url,
        { method, headers, body: options.body, cache: 'no-store' },
        options.timeout ?? (method === 'GET' ? GET_MS : PUT_MS),
      );
    } catch (error) {
      last = error as SharePointError;
      if (method !== 'GET') last.uncertain = true;
      continue;
    }
    if (res.ok || options.ok?.(res.status)) return res;
    last = await httpError(res);
    if (res.status === 401) needsLogin = true;
    if (method !== 'GET' && res.status >= 500) last.uncertain = true;
    if (!(res.status === 429 || res.status >= 500)) break;
  }
  throw last ?? new SharePointError('SharePoint request failed / SharePoint 要求失敗');
}

/** The site's id, looked up once per session. */
export async function resolveSite(interactive = false): Promise<string> {
  if (siteId) return siteId;
  const res = await graph(
    `/sites/${SHAREPOINT_CONFIG.siteHostname}:${SHAREPOINT_CONFIG.sitePath}?$select=id`,
    { interactive, ok: (status) => status === 404 },
  );
  if (res.status === 404) {
    throw new SharePointError(
      `SharePoint site ${siteLabel()} was not found / 找不到 SharePoint 網站 ${siteLabel()}`,
      { status: 404 },
    );
  }
  siteId = ((await res.json()) as { id: string }).id;
  return siteId;
}

/** `/sites/<id>/drive` — the site's default document library. Needs `resolveSite` first. */
export function drivePath(): string {
  if (!siteId) throw new SharePointError('SharePoint site not resolved yet');
  return `/sites/${siteId}/drive`;
}

/** Graph path of a file or folder by its path inside the library. */
export function itemByPath(path: string): string {
  const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${drivePath()}/root:/${encoded}`;
}

// --- session -----------------------------------------------------------------

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'popup' | 'error'; error?: string };

export type RestoreResult =
  | { ok: true; name: string }
  | { ok: false; needsLogin?: boolean; name?: string; error?: string };

export const sharePoint = {
  config: SHAREPOINT_CONFIG,

  /** "Thermal-Spec-DB / 文件 / RRU_Thermal_Network / Database" — where the projects are. */
  location(): string {
    return [
      SHAREPOINT_CONFIG.siteName,
      SHAREPOINT_CONFIG.libraryLabel,
      ...SHAREPOINT_CONFIG.dataFolder.split('/'),
    ].join(' / ');
  },

  account(): { name: string; email: string } | null {
    return account ? { name: account.name || account.username || '', email: account.username || '' } : null;
  },

  needsLogin(): boolean {
    return needsLogin;
  },

  /** Loads MSAL in the background, so a later click can open the popup at once. */
  preload(): Promise<boolean> {
    return init().then(
      () => true,
      () => false,
    );
  },

  /** A token without any popup: true when SharePoint can be used right now. */
  async canUseSilently(): Promise<boolean> {
    try {
      await token(false);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Sign in with a popup — from a click handler only, or the browser blocks it.
   * `select` always lets the user pick the account ("switch account").
   */
  async signIn(options: { select?: boolean } = {}): Promise<SignInResult> {
    let app: MsalApp;
    try {
      app = await init();
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        error: `Could not load Microsoft sign-in (${error instanceof Error ? error.message : String(error)}) / 無法載入 Microsoft 登入元件`,
      };
    }
    if (account && !options.select) {
      try {
        await token(true);
        return { ok: true };
      } catch {
        // Fall through to a full sign-in.
      }
    }
    try {
      const result = await app.loginPopup({ scopes: scopes(), prompt: 'select_account' });
      account = result.account ?? null;
      needsLogin = !account;
      siteId = null;
      return account ? { ok: true } : { ok: false, reason: 'cancelled' };
    } catch (error) {
      const code = (error as { errorCode?: string } | null)?.errorCode ?? '';
      if (code === 'user_cancelled' || code === 'interaction_in_progress') {
        return { ok: false, reason: 'cancelled' };
      }
      if (code === 'popup_window_error') return { ok: false, reason: 'popup' };
      return {
        ok: false,
        reason: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** After a sign-in: can the site be reached? May show a consent popup. */
  async probe(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await resolveSite(true);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  /** Silent restore on page load: signed in, a token, and the site answers. */
  async tryRestore(): Promise<RestoreResult> {
    try {
      await init();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (!account) return { ok: false, needsLogin: true };
    const name = sharePoint.account()?.name ?? '';
    try {
      await resolveSite(false);
      return { ok: true, name };
    } catch (error) {
      if (isSharePointError(error) && error.auth) return { ok: false, needsLogin: true, name };
      return { ok: false, name, error: error instanceof Error ? error.message : String(error) };
    }
  },

  /** Test seam: forget the session. */
  __reset(): void {
    pca = null;
    initPromise = null;
    account = null;
    needsLogin = false;
    siteId = null;
  },
};
