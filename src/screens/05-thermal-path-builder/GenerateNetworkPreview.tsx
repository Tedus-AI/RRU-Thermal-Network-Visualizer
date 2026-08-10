/**
 * "Generate from Component Preferences" — 05 §49, §52.
 *
 * The generation is a DRY RUN until the engineer presses Generate Network:
 * nothing is written to the store while this dialog is open (05 §49).
 */

import { AlertTriangle, Sparkles, Wand2 } from 'lucide-react';

import { Button, Modal } from '@/ui/primitives';
import { BilingualTooltip } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';
import type { GeneratePreview } from '@/thermal/graph/networkBuilder';
import { PRESET_LABELS, type StructurePreset } from '@/thermal/graph/sharedStructure';

function Stat({ value, label, zh }: { value: number | string; label: string; zh: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
      <p className="text-[18px] leading-tight font-bold tabular text-ink-900">{value}</p>
      <p className="text-[11px] font-semibold text-ink-700">{label}</p>
      <p className="text-[10px] text-ink-400">{zh}</p>
    </div>
  );
}

export function GenerateNetworkPreview({
  preview,
  structurePreset,
  onCancel,
  onConfirm,
}: {
  preview: GeneratePreview;
  structurePreset: StructurePreset;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Generate from Component Preferences / 依元件偏好產生網路"
      width="max-w-2xl"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel / 取消</Button>
          <Button
            variant="primary"
            icon={<Wand2 size={15} />}
            disabled={preview.components_modeled === 0}
            onClick={onConfirm}
          >
            Generate Network / 產生熱網路
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-ink-500">
        <BilingualTooltip zh={TOOLTIPS_ZH.generateFromPreferences} align="left">
          <span>This is a preview.</span>
        </BilingualTooltip>{' '}
        Nothing is written to the network until you confirm. / 這是預覽，確認後才會建立。
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat value={preview.components_modeled} label="Components modeled" zh="建模元件" />
        <Stat value={preview.nodes} label="Nodes" zh="節點" />
        <Stat value={preview.edges} label="Local edges" zh="區域連線" />
        <Stat value={preview.ports} label="Ports exposed" zh="連接埠" />
        <Stat value={preview.components_skipped} label="Skipped" zh="略過" />
        <Stat value={preview.needs_review.length} label="Need review" zh="需檢查" />
      </div>

      <div className="mt-3 rounded-md border border-line bg-surface-muted px-3 py-2">
        <p className="text-[11px] font-semibold text-ink-700">
          Shared structure preset / 共用結構預設
        </p>
        <p className="text-[12px] font-bold text-ink-900">
          {PRESET_LABELS[structurePreset].label} / {PRESET_LABELS[structurePreset].zh}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
          Ports are exposed, not connected. Step 4 connects each port explicitly — nothing is wired
          silently (05 §16). / 連接埠只會被建立，不會自動連線。
        </p>
      </div>

      {preview.needs_review.length > 0 && (
        <div className="mt-3 max-h-40 overflow-auto rounded-md border border-warn-500/40 bg-warn-100 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-warn-600">
            <AlertTriangle size={13} />
            {preview.needs_review.length} component
            {preview.needs_review.length > 1 ? 's' : ''} need review / 需檢查的元件
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.needs_review.map((entry) => (
              <li key={entry.component} className="text-[11px] text-ink-700">
                <span className="font-semibold">{entry.component}</span>
                <span className="text-ink-500"> — missing: {entry.missing.join(', ')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] leading-relaxed text-warn-600">
            These edges are created UNRESOLVED, never with a fabricated 0. /
            這些連線會以「未解析」建立，不會填入假的 0。
          </p>
        </div>
      )}

    </Modal>
  );
}

/** Shown when the network is still empty (05 §52). */
export function EmptyNetworkState({
  hasComponents,
  readOnly,
  onGenerate,
  onStartBlank,
  onGoToComponents,
}: {
  hasComponents: boolean;
  readOnly: boolean;
  onGenerate: () => void;
  onStartBlank: () => void;
  onGoToComponents: () => void;
}) {
  if (!hasComponents) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Sparkles size={26} className="mb-3 text-ink-400" />
        <p className="text-[14px] font-semibold text-ink-700">No components available.</p>
        <p className="mt-1 text-[12px] text-ink-400">
          Complete Component Manager first. / 請先完成元件管理。
        </p>
        <Button variant="primary" className="mt-4" onClick={onGoToComponents}>
          Go to Component Manager / 前往元件管理
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Sparkles size={26} className="mb-3 text-accent-600" />
      <p className="text-[14px] font-semibold text-ink-700">Build your thermal network</p>
      <p className="mt-1 text-[12px] text-ink-400">建立此專案的熱網路拓樸。</p>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={readOnly} onClick={onGenerate}>
          Generate from Preferences / 依偏好產生
        </Button>
        <Button disabled={readOnly} onClick={onStartBlank}>
          Start Blank / 從空白開始
        </Button>
      </div>
    </div>
  );
}
