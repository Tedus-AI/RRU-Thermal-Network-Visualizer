/**
 * The bar above the header when a newer build is deployed (`updateCheck.ts`).
 *
 * Across the full width and in the accent colour, like AI-Thermal's: a reminder
 * tucked into the header is the one nobody notices, and a tab left open for a
 * week is exactly the one running old code. Not red — nothing is wrong yet.
 */

import { RefreshCw } from 'lucide-react';

import { APP_VERSION, applyUpdate, displayVersion, snoozeUpdate, useUpdateStore } from './updateCheck';

export function UpdateBanner() {
  const prompted = useUpdateStore((s) => s.prompted);
  const live = useUpdateStore((s) => s.live);
  const updating = useUpdateStore((s) => s.updating);
  const blocked = useUpdateStore((s) => s.blocked);
  if (!prompted || !live) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-update-banner
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-accent-600 px-4 py-2 text-[12.5px] text-white"
    >
      <RefreshCw size={15} aria-hidden className="shrink-0" />
      <span className="font-semibold">熱網路工具有新版本 {displayVersion(live)}</span>
      <span className="text-white/90">
        目前開著的是 {displayVersion(APP_VERSION)}。更新前會先把還沒寫入的修改寫完，專案不會遺失。
      </span>
      {blocked && <span className="font-semibold text-warn-100">{blocked}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={updating}
          onClick={() => void applyUpdate()}
          className="rounded-md bg-white px-3 py-1 text-[12.5px] font-semibold text-accent-700 hover:bg-accent-50 disabled:cursor-wait disabled:opacity-70"
        >
          {updating ? '寫入中，完成後更新…' : '立即更新'}
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={snoozeUpdate}
          title="10 分鐘後再提醒"
          className="rounded-md px-2 py-1 text-[12.5px] text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          稍後
        </button>
      </span>
    </div>
  );
}
