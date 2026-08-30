import { beforeEach, describe, expect, it } from 'vitest';

import {
  currentSaveGeneration,
  markSavePending,
  markSaveSettled,
  useSaveStatus,
} from './saveStatus';

beforeEach(() => {
  useSaveStatus.setState({ pending: false, generation: 0 });
});

describe('save status generations', () => {
  it('does not let an older disk write mark a newer edit as saved', () => {
    const first = markSavePending();
    const second = markSavePending();

    markSaveSettled(first);
    expect(useSaveStatus.getState().pending).toBe(true);
    expect(currentSaveGeneration()).toBe(second);

    markSaveSettled(second);
    expect(useSaveStatus.getState().pending).toBe(false);
  });
});
