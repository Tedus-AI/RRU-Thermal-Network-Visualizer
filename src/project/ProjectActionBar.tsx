/**
 * Bottom Action Bar — 01 §13. Sticks to the bottom of the main workspace.
 *
 * Save and Cancel are gone: edits reach the project folder on their own, so
 * there is nothing to save and no last-saved state to fall back to.
 *
 * Creating a project is still explicit. Until the first create there is no file
 * to write into, and the project id is editable — persisting per keystroke would
 * leave a trail of half-named files in the folder.
 */

import { Archive, ArrowRight, Copy, FilePlus2 } from 'lucide-react';
import { Badge, Button } from '@/ui/primitives';

export function ProjectActionBar({
  isNew,
  readOnly,
  canSave,
  canContinue,
  archived,
  warningCount,
  onDuplicate,
  onArchive,
  onCreate,
  onContinue,
}: {
  /** A project that has never been created yet. */
  isNew: boolean;
  readOnly: boolean;
  /** Required fields are valid, so the project can be created. */
  canSave: boolean;
  canContinue: boolean;
  archived: boolean;
  warningCount: number;
  onDuplicate: () => void;
  onArchive: () => void;
  onCreate: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-6 py-3">
      <Button icon={<Copy size={15} />} onClick={onDuplicate} disabled={isNew}>
        Duplicate Project / 複製專案
      </Button>
      <Button icon={<Archive size={15} />} onClick={onArchive} disabled={isNew}>
        {archived ? 'Restore / 還原' : 'Archive / 封存'}
      </Button>

      <div className="ml-4 flex items-center gap-2">
        {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
        {!readOnly && !isNew && (
          <span className="text-[12px] text-ink-400">
            Changes are saved to the project folder automatically / 變更會自動儲存至專案資料夾
          </span>
        )}
        {!readOnly && warningCount > 0 && (
          <span className="text-[12px] text-ink-400">
            {warningCount} warning{warningCount > 1 ? 's' : ''} / 項警告
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isNew && (
          <Button
            variant="primary"
            icon={<FilePlus2 size={15} />}
            disabled={!canSave}
            onClick={onCreate}
          >
            Create Project / 建立專案
          </Button>
        )}
        {!isNew && (
          <Button
            variant="primary"
            trailingIcon={<ArrowRight size={15} />}
            disabled={!canContinue}
            onClick={onContinue}
          >
            Continue / 繼續
          </Button>
        )}
      </div>
    </div>
  );
}
