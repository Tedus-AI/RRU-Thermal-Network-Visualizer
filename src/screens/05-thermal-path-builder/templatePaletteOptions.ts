import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';

/**
 * Templates offered for new Screen 05 selections.
 *
 * This used to filter `Bare Die` out: it stayed in the registry so saved
 * projects could still rebuild, but was not offered for new work. Bare Die has
 * since dissolved into Top Surface plus a `Pedestal` mount and left the
 * registry altogether, so there is nothing left to hide and every template the
 * registry has is selectable.
 *
 * The indirection is kept rather than inlined because a template can go out of
 * service again, and when it does this is the one place that decides it.
 */
export const SELECTABLE_TEMPLATE_LIST = TEMPLATE_LIST;

/** Preserve a hidden legacy selection while falling back to a visible option. */
export function templateForPaletteSelection(templateId?: string | null) {
  return (
    TEMPLATE_LIST.find((template) => template.id === templateId) ?? SELECTABLE_TEMPLATE_LIST[0]
  );
}
