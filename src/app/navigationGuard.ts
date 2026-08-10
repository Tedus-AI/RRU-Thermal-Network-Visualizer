/**
 * Unsaved-changes route guard — 01 §18, AC-05.
 *
 * Any navigation that would abandon a dirty project must be intercepted and
 * resolved by the user (Stay / Discard / Save & Continue). This is modelled as a
 * pending intent so it also covers project switching from the header, not just
 * router navigation.
 */

import { create } from 'zustand';

export type PendingIntent =
  | { kind: 'navigate'; to: string }
  | { kind: 'switch-project'; projectId: string }
  | { kind: 'new-project' };

interface GuardState {
  pending: PendingIntent | null;
  request: (intent: PendingIntent) => void;
  clear: () => void;
}

export const useNavigationGuard = create<GuardState>((set) => ({
  pending: null,
  request: (intent) => set({ pending: intent }),
  clear: () => set({ pending: null }),
}));
