/**
 * Reading AI-Thermal's shared database (`thermal_db.json`) — for Screen 02's
 * AI-Thermal source and Screen 04's 「從 AI-Thermal 更新」.
 *
 * Read only, always: the file belongs to AI-Thermal and 5G-RRU, which share an
 * edit lock this tool does not take part in.
 */

import { readAiThermalDb, sharePoint } from './sharepoint';
import { AI_THERMAL_DB_PATH, parseAiThermalDb, type AiThermalDb } from '@/importers/component/parseAiThermal';

export type AiDbRead =
  | { ok: true; db: AiThermalDb; label: string }
  | { ok: false; reason: 'signin' | 'cancelled' | 'missing' | 'invalid' | 'error'; message: string };

function adopt(raw: unknown, label: string): AiDbRead {
  const db = parseAiThermalDb(raw);
  return db
    ? { ok: true, db, label }
    : { ok: false, reason: 'invalid', message: '這不是 AI-Thermal 的資料庫檔（找不到 projects）。' };
}

/**
 * From SharePoint. `interactive` may open the Microsoft sign-in popup, so it is
 * only ever true from a click; without it a missing sign-in is `signin`.
 */
export async function readAiThermalFromSharePoint(interactive: boolean): Promise<AiDbRead> {
  try {
    if (!(await sharePoint.canUseSilently())) {
      if (!interactive) return { ok: false, reason: 'signin', message: '尚未登入 Microsoft。' };
      const signed = await sharePoint.signIn();
      if (!signed.ok) {
        return {
          ok: false,
          reason: signed.reason === 'cancelled' ? 'cancelled' : 'error',
          message:
            signed.reason === 'cancelled'
              ? '已取消登入。'
              : signed.reason === 'popup'
                ? '瀏覽器擋下了登入視窗，請允許此網站的彈出視窗後再試一次。'
                : `無法登入 Microsoft：${signed.error ?? ''}`,
        };
      }
    }
    const raw = await readAiThermalDb(AI_THERMAL_DB_PATH);
    if (raw == null) {
      return { ok: false, reason: 'missing', message: `SharePoint 上找不到 AI-Thermal 的資料庫（${AI_THERMAL_DB_PATH}）。` };
    }
    return adopt(raw, `SharePoint：${AI_THERMAL_DB_PATH}`);
  } catch (error) {
    return { ok: false, reason: 'error', message: `讀不到 AI-Thermal 的資料庫：${(error as Error).message}` };
  }
}

/** From a local copy: AI-Thermal's offline database or a 「💾 備份資料庫」 download. */
export async function readAiThermalFromFile(file: File): Promise<AiDbRead> {
  try {
    return adopt(JSON.parse(await file.text()) as unknown, `本機檔案：${file.name}`);
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid',
      message: error instanceof SyntaxError ? `「${file.name}」不是有效的 JSON 檔。` : (error as Error).message,
    };
  }
}
