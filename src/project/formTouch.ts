/**
 * Field-level "touched" tracking.
 *
 * A blank new project is invalid by definition, but shouting "required" at a form
 * the user has not typed in yet is noise. Errors surface once a field has been
 * edited, or once Save has been attempted.
 */

import { create } from 'zustand';

interface FormTouchState {
  touched: Record<string, boolean>;
  submitAttempted: boolean;
  touch: (field: string) => void;
  markSubmitAttempted: () => void;
  reset: () => void;
}

export const useFormTouch = create<FormTouchState>((set) => ({
  touched: {},
  submitAttempted: false,
  touch: (field) =>
    set((state) =>
      state.touched[field] ? state : { touched: { ...state.touched, [field]: true } },
    ),
  markSubmitAttempted: () => set({ submitAttempted: true }),
  reset: () => set({ touched: {}, submitAttempted: false }),
}));

/** Returns the error for a field only when it should be visible to the user. */
export function useVisibleError(errors: Record<string, string>) {
  const touched = useFormTouch((s) => s.touched);
  const submitAttempted = useFormTouch((s) => s.submitAttempted);
  return (field: string): string | undefined =>
    touched[field] || submitAttempted ? errors[field] : undefined;
}
