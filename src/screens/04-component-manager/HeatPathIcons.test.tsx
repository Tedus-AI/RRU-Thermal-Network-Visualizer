/**
 * Every path and mount tile draws its stack: no NaN or undefined in a coordinate, and one solid
 * outline per layer at least.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HEAT_PATH_TYPES, MOUNT_TYPES } from '@/domain/component';

import { StackIcon } from './HeatPathIcons';

describe('heat path and mount tile icons', () => {
  for (const kind of [...HEAT_PATH_TYPES, ...MOUNT_TYPES]) {
    it(`draws ${kind}`, () => {
      const html = renderToStaticMarkup(<StackIcon kind={kind} />);
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect((html.match(/class="sh"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });
  }
});
