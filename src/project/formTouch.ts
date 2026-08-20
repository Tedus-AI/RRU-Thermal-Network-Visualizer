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

/**
 * How many of a section's fields are showing an error right now.
 *
 * Counts VISIBLE errors only, on the same rule as `useVisibleError`: a blank
 * new project is invalid by definition, and a section header that shouts about
 * fields nobody has reached yet is the same noise the touch tracking exists to
 * avoid.
 */
export function useSectionAlert(errors: Record<string, string>, fields: readonly string[]) {
  const touched = useFormTouch((s) => s.touched);
  const submitAttempted = useFormTouch((s) => s.submitAttempted);
  const count = fields.filter(
    (field) => errors[field] && (touched[field] || submitAttempted),
  ).length;
  if (count === 0) return undefined;
  return `${count} ${count === 1 ? 'field needs' : 'fields need'} attention / ${count} 個欄位待處理`;
}
