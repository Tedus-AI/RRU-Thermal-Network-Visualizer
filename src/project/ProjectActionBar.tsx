/** Bottom Action Bar — 01 §13. Sticks to the bottom of the main workspace. */

import { Archive, ArrowRight, Copy, Save } from 'lucide-react';
import { Badge, Button } from '@/ui/primitives';

export function ProjectActionBar({
  dirty,
  readOnly,
  canSave,
  canContinue,
  archived,
  warningCount,
  onCancel,
  onDuplicate,
  onArchive,
  onSave,
  onSaveAndContinue,
}: {
  dirty: boolean;
  readOnly: boolean;
  canSave: boolean;
  canContinue: boolean;
  archived: boolean;
  warningCount: number;
  onCancel: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onSave: () => void;
  onSaveAndContinue: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-6 py-3">
      <Button onClick={onCancel} disabled={!dirty}>
        Cancel
      </Button>
      <Button icon={<Copy size={15} />} onClick={onDuplicate}>
        Duplicate Project
      </Button>
      <Button icon={<Archive size={15} />} onClick={onArchive}>
        {archived ? 'Restore' : 'Archive'}
      </Button>

      <div className="ml-4 flex items-center gap-2">
        {readOnly && <Badge tone="accent">READ ONLY</Badge>}
        {!readOnly && dirty && <Badge tone="warn">● Unsaved</Badge>}
        {!readOnly && warningCount > 0 && (
          <span className="text-[12px] text-ink-400">
            {warningCount} warning{warningCount > 1 ? 's' : ''} — save is still allowed
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button icon={<Save size={15} />} disabled={!canSave} onClick={onSave}>
          Save Project
        </Button>
        <Button
          variant="primary"
          trailingIcon={<ArrowRight size={15} />}
          disabled={!canContinue}
          onClick={onSaveAndContinue}
        >
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
}
