/**
 * Bottom Action Bar — 01 §13. Sticks to the bottom of the main workspace.
 *
 * Save and Cancel are gone: edits reach the project folder on their own, so
 * there is nothing to save and no last-saved state to fall back to. The header's
 * storage lights say where and when they were written, so the bar no longer
 * repeats it.
 *
 * Creating a project is still explicit. Until the first create there is no file
 * to write into, and the project id is editable — persisting per keystroke would
 * leave a trail of half-named files in the folder.
 */

import { Archive, ArrowRight, Copy, FilePlus2 } from 'lucide-react';
import { Button } from '@/ui/primitives';

export function ProjectActionBar({
  isNew,
  canSave,
  canContinue,
  archived,
  continueTo,
  onDuplicate,
  onArchive,
  onCreate,
  onContinue,
}: {
  /** A project that has never been created yet. */
  isNew: boolean;
  /** Required fields are valid, so the project can be created. */
  canSave: boolean;
  canContinue: boolean;
  archived: boolean;
  /** Where Continue goes, as the sidebar names it ("07 求解與結果"); empty says just 繼續. */
  continueTo: string;
  onDuplicate: () => void;
  onArchive: () => void;
  onCreate: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-6 py-3">
      <Button icon={<Copy size={15} />} onClick={onDuplicate} disabled={isNew}>
        複製專案
      </Button>
      <Button icon={<Archive size={15} />} onClick={onArchive} disabled={isNew}>
        {archived ? '還原' : '封存'}
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {isNew ? (
          <Button
            variant="primary"
            icon={<FilePlus2 size={15} />}
            disabled={!canSave}
            onClick={onCreate}
          >
            建立專案
          </Button>
        ) : (
          <Button
            variant="primary"
            trailingIcon={<ArrowRight size={15} />}
            disabled={!canContinue}
            onClick={onContinue}
          >
            {continueTo ? `繼續：${continueTo}` : '繼續'}
          </Button>
        )}
      </div>
    </div>
  );
}
