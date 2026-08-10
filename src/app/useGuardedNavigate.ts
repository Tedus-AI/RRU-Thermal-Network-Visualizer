import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/data/projectStore';
import { useNavigationGuard } from './navigationGuard';

/**
 * Navigate, unless the current project has unsaved changes — in which case the
 * intent is parked and the UnsavedChangesModal resolves it (01 §18).
 */
export function useGuardedNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (to: string) => {
      const { dirty } = useProjectStore.getState();
      if (dirty) {
        useNavigationGuard.getState().request({ kind: 'navigate', to });
        return;
      }
      navigate(to);
    },
    [navigate],
  );
}
