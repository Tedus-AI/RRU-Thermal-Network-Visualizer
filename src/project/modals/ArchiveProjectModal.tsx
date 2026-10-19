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
      title={archived ? '還原專案？' : '封存專案？'}
      description={
        archived ? '專案回到清單，可再次編輯。' : '專案改為唯讀並標示已封存，資料不會刪除。'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant={archived ? 'primary' : 'danger'} onClick={onConfirm}>
            {archived ? '還原' : '封存'}
          </Button>
        </>
      }
    />
  );
}
