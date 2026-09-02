import { describe, expect, it } from 'vitest';

import { rth } from './resultViewModel';

/**
 * Four decimals was one digit more than anyone reads and it cost the graph
 * real width: on the branches into the bus, `0.1945 °C/W` against
 * `0.194 °C/W` is the difference between a label that fits beside the bar and
 * one that crowds it.
 */
describe('how a resistance is written on the graph', () => {
  it('gives three decimals across the range an edge actually takes', () => {
    expect(rth(0.0244)).toBe('0.024');
    // Rounds, not truncates: 0.1945 is nearer 0.195.
    expect(rth(0.1945)).toBe('0.195');
    expect(rth(0.9259)).toBe('0.926');
    expect(rth(14)).toBe('14.000');
  });

  /** A big one needs no decimals to be understood, and they only take room. */
  it('drops to one decimal once the value is large', () => {
    expect(rth(100)).toBe('100.0');
    expect(rth(1234.56)).toBe('1234.6');
  });

  /**
   * The dangerous case: at three decimals a resistance below a milli-degree
   * per watt prints `0.000`, which reads as "no resistance here" when the
   * truth is "smaller than this shows".
   */
  it('says the value is small rather than printing it as zero', () => {
    expect(rth(0.0004)).toBe('<0.001');
    expect(rth(1e-9)).toBe('<0.001');
    // A real zero is not the same claim and is not disguised as one.
    expect(rth(0)).toBe('0.000');
  });

  it('says so when there is no value at all', () => {
    expect(rth(null)).toBe('N/A');
    expect(rth(undefined)).toBe('N/A');
    expect(rth(Number.NaN)).toBe('N/A');
    expect(rth(Number.POSITIVE_INFINITY)).toBe('N/A');
  });
});
