import { describe, expect, it } from 'vitest';

import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';
import { SELECTABLE_TEMPLATE_LIST, templateForPaletteSelection } from './templatePaletteOptions';

/**
 * This used to assert that `Bare Die` was hidden from new selections while
 * staying in the registry for saved projects. It has since dissolved into Top
 * Surface plus a `Pedestal` mount and left the registry, and the migrator
 * rewrites a component that named it — so there is nothing left to hide.
 */
describe('Screen 05 selectable architecture templates', () => {
  it('offers every template the registry has', () => {
    expect(SELECTABLE_TEMPLATE_LIST.map((template) => template.id)).toEqual(
      TEMPLATE_LIST.map((template) => template.id),
    );
  });

  it('no longer carries the dissolved templates', () => {
    const ids = TEMPLATE_LIST.map((template) => template.id);
    expect(ids).not.toContain('BARE_DIE');
    expect(ids).not.toContain('SMALL_BASE_HEAT_PIPE');
  });

  it('falls back to a visible option for an unknown selection', () => {
    expect(templateForPaletteSelection('UNKNOWN').id).toBe(SELECTABLE_TEMPLATE_LIST[0].id);
    // Including one that used to exist: the migrator repairs the stored
    // preference, and this keeps the picker usable until it does.
    expect(templateForPaletteSelection('BARE_DIE').id).toBe(SELECTABLE_TEMPLATE_LIST[0].id);
  });
});
