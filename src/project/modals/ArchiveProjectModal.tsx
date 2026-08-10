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
      title={archived ? 'Restore Project? / 還原專案？' : 'Archive Project? / 封存專案？'}
      description={
        archived
          ? 'The project returns to the default project list and becomes editable again. / 專案將回到預設清單並可再次編輯。'
          : 'Project will be hidden from the default project list. Data will not be deleted. / 專案將自預設清單隱藏，資料不會被刪除。'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel / 取消</Button>
          <Button variant={archived ? 'primary' : 'danger'} onClick={onConfirm}>
            {archived ? 'Restore Project / 還原' : 'Archive Project / 封存'}
          </Button>
        </>
      }
    />
  );
}
