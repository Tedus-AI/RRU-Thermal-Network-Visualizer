/** Archive / Restore Project (01 §17, §23). Archiving hides, never deletes. */

import { Button, Modal } from '@/ui/primitives';

export function ArchiveProjectModal({
  archived,
  onClose,
  onConfirm,
}: {
  archived: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={archived ? 'Restore Project?' : 'Archive Project?'}
      description={
        archived
          ? 'The project returns to the default project list and becomes editable again.'
          : 'Project will be hidden from the default project list. Data will not be deleted.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={archived ? 'primary' : 'danger'} onClick={onConfirm}>
            {archived ? 'Restore Project' : 'Archive Project'}
          </Button>
        </>
      }
    />
  );
}
