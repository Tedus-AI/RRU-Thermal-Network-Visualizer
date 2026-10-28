/**
 * A vertical plate is as tall as the machine (01's heat sink base length L)
 * unless taken over; a height typed before the link is never overwritten.
 */

import { describe, expect, it } from 'vitest';

import { PLATE_GEOMETRY_KEYS } from './calculations';
import { PLATE_HEIGHT_SOURCE_KEY, applyProjectPlateHeight, plateHeightFollowsProject } from './plateHeight';

const K = PLATE_GEOMETRY_KEYS;
type Parameters = Record<string, number | string | boolean | null | undefined>;
const plate = (parameters: Parameters): { parameters: Parameters } => ({
  parameters: { [K.enabled]: true, [K.orientation]: 'Vertical', ...parameters },
});

describe('plateHeightFollowsProject', () => {
  it('follows 01 when the height is empty, equal to 01, or linked', () => {
    expect(plateHeightFollowsProject(plate({}), 339)).toBe(true);
    expect(plateHeightFollowsProject(plate({ [K.height]: 339 }), 339)).toBe(true);
    expect(plateHeightFollowsProject(plate({ [K.height]: 300, [PLATE_HEIGHT_SOURCE_KEY]: 'project' }), 339)).toBe(true);
  });

  it('keeps a height typed before the link, and one taken over with ✂', () => {
    expect(plateHeightFollowsProject(plate({ [K.height]: 120 }), 339)).toBe(false);
    expect(plateHeightFollowsProject(plate({ [K.height]: 339, [PLATE_HEIGHT_SOURCE_KEY]: 'manual' }), 339)).toBe(false);
  });

  it('only a vertical plate described by geometry, and only when 01 states a height', () => {
    expect(plateHeightFollowsProject(plate({ [K.orientation]: 'HorizontalUp' }), 339)).toBe(false);
    expect(plateHeightFollowsProject({ parameters: { [K.enabled]: false } }, 339)).toBe(false);
    expect(plateHeightFollowsProject(plate({}), null)).toBe(false);
    expect(plateHeightFollowsProject(plate({}), 0)).toBe(false);
  });
});

describe('applyProjectPlateHeight', () => {
  it('writes the machine height and records that it follows, once', () => {
    const { parameters } = plate({});
    expect(applyProjectPlateHeight(parameters, 339)).toBe(true);
    expect(parameters[K.height]).toBe(339);
    expect(parameters[PLATE_HEIGHT_SOURCE_KEY]).toBe('project');
    expect(applyProjectPlateHeight(parameters, 339)).toBe(false);
    expect(applyProjectPlateHeight(parameters, 350)).toBe(true);
    expect(parameters[K.height]).toBe(350);
  });

  it('leaves a taken-over or typed height alone', () => {
    const manual = plate({ [K.height]: 200, [PLATE_HEIGHT_SOURCE_KEY]: 'manual' }).parameters;
    expect(applyProjectPlateHeight(manual, 339)).toBe(false);
    expect(manual[K.height]).toBe(200);
    const typed = plate({ [K.height]: 120 }).parameters;
    expect(applyProjectPlateHeight(typed, 339)).toBe(false);
    expect(typed).not.toHaveProperty(PLATE_HEIGHT_SOURCE_KEY);
  });
});
