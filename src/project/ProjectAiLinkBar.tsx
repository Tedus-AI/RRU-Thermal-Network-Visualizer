/**
 * The first line of 基本資料: which AI-Thermal project this one is linked to
 * (`domain/projectAiLink.ts`), and the two ways forward — 連結 when there is
 * none, 「從 AI-Thermal 更新」 and 解除連結 when there is.
 */

import { useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';

import { Button, Modal } from '@/ui/primitives';
import { toast } from '@/ui/toast';
import { unlinkProjectAiNow } from './projectAiActions';
import type { ProjectAiLinkState } from './useProjectAiLink';

export function ProjectAiLinkBar({
  ai,
  readOnly,
  isNew,
  onOpen,
}: {
  ai: ProjectAiLinkState;
  readOnly: boolean;
  isNew: boolean;
  onOpen: () => void;
}) {
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const link = ai.link;
  return (
    <div
      id="ai-link"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface-muted px-3 py-2 text-[12.5px]"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-ink-700">
        <Link2 size={13} aria-hidden />
        連結的 AI-Thermal 專案
      </span>
      {link ? (
        <>
          <span className="font-semibold text-ink-900">{link.project_name}</span>
          {link.project_name !== link.project_id && (
            <span className="font-mono text-[11.5px] text-ink-400">{link.project_id}</span>
          )}
          {link.synced_at && <span className="text-ink-400">上次同步 {link.synced_at.slice(0, 10)}</span>}
          <span className="ml-auto flex items-center gap-3">
            <Button
              className="h-8"
              icon={<RefreshCw size={13} />}
              variant={ai.pending > 0 ? 'primary' : 'secondary'}
              title="讀 AI-Thermal 的資料庫，把改過的專案名稱、頻段、環境溫度與 5G-RRU 參數更新到 01"
              onClick={onOpen}
            >
              {ai.pending > 0 ? `AI-Thermal 有更新（${ai.pending} 項）` : '從 AI-Thermal 更新'}
            </Button>
            <button
              type="button"
              className="text-[12px] text-ink-500 hover:text-ink-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              disabled={readOnly}
              onClick={() => setConfirmUnlink(true)}
            >
              解除連結
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="text-ink-400">
            未連結{ai.suggested ? `・03 的元件來自 AI-Thermal 專案「${ai.suggested}」` : ''}
          </span>
          <span className="ml-auto">
            <Button
              className="h-8"
              icon={<Link2 size={13} />}
              disabled={readOnly || isNew}
              title={
                isNew
                  ? '建立專案後才能連結'
                  : '專案名稱、頻段、環境溫度與 5G-RRU 參數控制台的材料設定，改取 AI-Thermal 同一個專案的值'
              }
              onClick={onOpen}
            >
              連結 AI-Thermal 專案…
            </Button>
          </span>
        </>
      )}

      {confirmUnlink && link && (
        <Modal
          title="解除連結？"
          description={`與 AI-Thermal 專案「${link.project_name}」的連結。`}
          onClose={() => setConfirmUnlink(false)}
          footer={
            <>
              <Button onClick={() => setConfirmUnlink(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  unlinkProjectAiNow();
                  setConfirmUnlink(false);
                  toast.success('已解除連結，數值都保留。');
                }}
              >
                解除連結
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink-700">
            01 的數值都保留，之後由本工具維護，「從 AI-Thermal 更新」不再更新它們。03 的元件各自的連結不受影響。
            要再連結，按「連結 AI-Thermal 專案」。
          </p>
        </Modal>
      )}
    </div>
  );
}
