import { describe, expect, it } from 'vitest';

import { LAYOUT_MODES, toggleTool, type CanvasTool } from './GraphToolbar';

/**
 * Connect, Add Node and Add Edge used to latch: once armed there was no way off
 * them but to pick a different tool, and clicking the lit button again did
 * nothing at all. Zoom to Region already toggled, so the row was inconsistent
 * as well as sticky.
 */
describe('toggleTool', () => {
  const modes: CanvasTool[] = ['connect', 'add-node', 'add-edge', 'zoom-box'];

  it('arms a mode from select', () => {
    for (const mode of modes) {
      expect(toggleTool('select', mode)).toBe(mode);
    }
  });

  it('disarms a mode by pressing the same button again', () => {
    for (const mode of modes) {
      expect(toggleTool(mode, mode)).toBe('select');
    }
  });

  it('switches straight between two armed modes', () => {
    expect(toggleTool('connect', 'add-edge')).toBe('add-edge');
    expect(toggleTool('zoom-box', 'add-node')).toBe('add-node');
  });

  // Select is the resting state, so it has nothing to toggle off to.
  it('leaves select as select', () => {
    expect(toggleTool('select', 'select')).toBe('select');
  });
});

describe('layout modes', () => {
  // `breadthfirst` produced substantially what Top → Bottom already produced.
  it('no longer offers Hierarchical', () => {
    expect(LAYOUT_MODES.map((mode) => mode.value)).toEqual([
      'Auto',
      'LeftRight',
      'TopBottom',
      'Free',
    ]);
  });
});
