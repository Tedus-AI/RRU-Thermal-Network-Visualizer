/**
 * Unsaved-changes guard modal — 01 §18, AC-05.
 * Mounted in the App Shell so it covers navigation from any screen.
 */

import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/ui/primitives';
import { useNavigationGuard } from '@/app/navigationGuard';
import { useProjectStore } from '@/data/projectStore';
import { useProjectSave } from '../useProjectSave';
import { projectPath } from '@/app/navigation';

export function UnsavedChangesModal() {
  const pending = useNavigationGuard((s) => s.pending);
  const clear = useNavigationGuard((s) => s.clear);
  const navigate = useNavigate();
  const { save, canSave } = useProjectSave();

  if (!pending) return null;

  const proceed = () => {
    clear();
    switch (pending.kind) {
      case 'navigate':
        navigate(pending.to);
        break;
      case 'switch-project':
        navigate(projectPath(pending.projectId, 'info'));
        break;
      case 'new-project':
        navigate('/project/new/info');
        break;
    }
  };

  const handleDiscard = () => {
    useProjectStore.getState().revert();
    proceed();
  };

  const handleSave = () => {
    if (save()) proceed();
  };

  return (
    <Modal
      title="You have unsaved changes. / 尚有未儲存的變更"
      description="Leaving this screen now will discard the edits you have made to this project. / 現在離開將捨棄此專案的編輯內容。"
      onClose={clear}
      footer={
        <>
          <Button onClick={clear}>Stay / 留下</Button>
          <Button variant="danger" onClick={handleDiscard}>
            Discard / 捨棄
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={handleSave}>
            Save &amp; Continue / 儲存並繼續
          </Button>
        </>
      }
    />
  );
}
