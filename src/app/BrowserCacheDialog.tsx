/**
 * The confirmation for 「清空瀏覽器暫存」 (`data/browserCache.ts`): how much the
 * browser holds, what goes and what stays, and — when the browser copy could
 * be the only one — why it cannot be cleared now.
 */

import { useMemo, useState } from 'react';
import { Eraser } from 'lucide-react';

import { Button, Modal } from '@/ui/primitives';
import {
  browserCacheClearBlocker,
  browserCacheUsage,
  clearBrowserCache,
  formatCacheSize,
} from '@/data/browserCache';
import { useSaveStatus } from '@/data/saveStatus';

export function BrowserCacheDialog({ onClose }: { onClose: () => void }) {
  const cacheFull = useSaveStatus((s) => Boolean(s.cacheFailure));
  const usage = useMemo(() => {
    try {
      return typeof localStorage === 'undefined' ? null : browserCacheUsage(localStorage);
    } catch {
      return null;
    }
  }, []);
  const [blocker, setBlocker] = useState<string | null>(() => browserCacheClearBlocker());
  const [clearing, setClearing] = useState(false);

  const clear = async () => {
    setClearing(true);
    const reason = await clearBrowserCache();
    // Cleared: the page is reloading. Otherwise say why.
    if (reason) {
      setBlocker(reason);
      setClearing(false);
    }
  };

  return (
    <Modal
      title="清空瀏覽器暫存？"
      width="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            icon={<Eraser size={14} aria-hidden />}
            disabled={clearing || blocker != null}
            onClick={() => void clear()}
          >
            {clearing ? '清空中…' : '清空並重新載入'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-ink-700" data-cache-dialog>
        <p>
          瀏覽器只放專案的<b>工作副本</b>，真正的檔案在 SharePoint／本機資料夾。清空後重新載入，專案會從那裡讀回來，
          跟每次部署新版本時一樣。
        </p>
        {usage && (
          <div className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 rounded-md border border-line bg-surface-muted px-3 py-2 text-[12px]">
            <span className="text-ink-500">熱網路工具的工作副本</span>
            <span className="font-semibold text-ink-900">{formatCacheSize(usage.own)}（會清掉）</span>
            <span className="text-ink-500">同網站的其他工具與登入</span>
            <span className="text-ink-700">{formatCacheSize(usage.other)}（不動）</span>
          </div>
        )}
        <ul className="list-disc pl-5 text-[12px] text-ink-600">
          <li>保留：儲存位置設定、Microsoft 登入、面板大小與欄寬。</li>
          <li>AI-Thermal、5G-RRU 等同網站工具的資料不會動。</li>
          {cacheFull && <li>「瀏覽器儲存空間已滿」的提示會在清空後消失。</li>}
        </ul>
        {blocker && (
          <p className="rounded-md border border-warn-500/40 bg-warn-100/70 px-2.5 py-2 text-[12px] text-warn-600">
            現在不能清空：{blocker}
          </p>
        )}
      </div>
    </Modal>
  );
}
