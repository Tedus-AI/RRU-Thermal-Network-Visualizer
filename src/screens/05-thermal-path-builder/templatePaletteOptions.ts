import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';

/**
 * Templates offered for new Screen 05 selections.
 *
 * Bare Die remains in the registry so imported and previously saved projects
 * can still render and rebuild their existing topology, but it is no longer a
 * selectable architecture for new work.
 */
export const SELECTABLE_TEMPLATE_LIST = TEMPLATE_LIST.filter(
  (template) => template.id !== 'BARE_DIE',
);

/** Preserve a hidden legacy selection while falling back to a visible option. */
export function templateForPaletteSelection(templateId?: string | null) {
  return (
    TEMPLATE_LIST.find((template) => template.id === templateId) ??
    SELECTABLE_TEMPLATE_LIST[0]
  );
}
