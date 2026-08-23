import { describe, expect, it } from 'vitest';

import { TEMPLATE_LIST } from '@/thermal/templates/templateRegistry';
import {
  SELECTABLE_TEMPLATE_LIST,
  templateForPaletteSelection,
} from './templatePaletteOptions';

describe('Screen 05 selectable architecture templates', () => {
  it('hides Bare Die from new selections without deleting its registry entry', () => {
    expect(SELECTABLE_TEMPLATE_LIST.map((template) => template.id)).not.toContain('BARE_DIE');
    expect(TEMPLATE_LIST.map((template) => template.id)).toContain('BARE_DIE');
  });

  it('continues to resolve an existing Bare Die selection for legacy projects', () => {
    expect(templateForPaletteSelection('BARE_DIE').id).toBe('BARE_DIE');
  });

  it('falls back to a visible option for an unknown selection', () => {
    expect(templateForPaletteSelection('UNKNOWN').id).toBe(SELECTABLE_TEMPLATE_LIST[0].id);
  });
});
