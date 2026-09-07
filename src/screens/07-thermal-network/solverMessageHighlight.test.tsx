/**
 * The highlighted solver message.
 *
 * One message in this list carries figures the run measured — the finite-Bi
 * note's h_eff and Bi — and it used to read as a paragraph of prose among four
 * other paragraphs of prose. It is now marked, and the figures inside it are
 * picked out, so the numbers can be found without reading the sentence.
 *
 * The marking is driven by literal substring matching, which is the part worth
 * testing: the solver has to hand over runs that actually occur in the message
 * it also built, or the highlight silently does nothing.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { issue } from '@/thermal/solver/solverTypes';

import { SolverValidationPanel } from './SolverValidationPanel';

const panelProps = {
  hasRun: true,
  onFocus: vi.fn(),
  onNavigate: vi.fn(),
};

const withFigures = issue(
  'info',
  'spreading_biot_applied',
  'boundary',
  '22 spreading edge(s) re-solved — h_eff 96.3 W/m²K, Bi 0.110 on the largest change.',
  '已重新計算 22 條擴散邊；h_eff 為 96.3 W/m²K、Bi 為 0.110。',
  { emphasis: ['h_eff 96.3 W/m²K, Bi 0.110', 'h_eff 為 96.3 W/m²K、Bi 為 0.110'] },
);

const plain = issue(
  'info',
  'no_external_mapping',
  'result_integrity',
  'No external simulation mapping is present.',
  '尚無外部模擬對應。',
);

describe('solver message highlighting', () => {
  it('marks the message and paints its figures dark green', () => {
    const html = renderToStaticMarkup(
      <SolverValidationPanel issues={[withFigures]} {...panelProps} />,
    );

    expect(html).toContain('bg-mark-100');
    // The English figures and the Chinese figures each come out on their own
    // line, so both runs have to be found — one per language.
    expect(html).toContain('<strong class="font-bold text-ok-700">h_eff 96.3 W/m²K, Bi 0.110');
    expect(html).toContain('<strong class="font-bold text-ok-700">h_eff 為 96.3 W/m²K、Bi 為 0.110');
    // The marker has to survive a wrap, which it only does on an inline box.
    expect(html).toContain('box-decoration-clone');
  });

  it('leaves the prose around the figures unmarked', () => {
    const html = renderToStaticMarkup(
      <SolverValidationPanel issues={[withFigures]} {...panelProps} />,
    );
    expect(html).toContain('22 spreading edge(s) re-solved — ');
    expect(html).toContain(' on the largest change.');
    // Only the figures are green: the sentence around them is not.
    expect(html.match(/text-ok-700/g)).toHaveLength(2);
  });

  it('renders a message with no figures exactly as before', () => {
    const html = renderToStaticMarkup(<SolverValidationPanel issues={[plain]} {...panelProps} />);
    expect(html).toContain('No external simulation mapping is present.');
    expect(html).not.toContain('bg-mark-100');
    expect(html).not.toContain('text-ok-700');
    // The unhighlighted second line keeps its original grey.
    expect(html).toContain('text-ink-400');
  });

  it('falls back to plain text when a run no longer occurs in the message', () => {
    const drifted = { ...withFigures, emphasis: ['h_eff 12.0 W/m²K, Bi 0.999'] };
    const html = renderToStaticMarkup(
      <SolverValidationPanel issues={[drifted]} {...panelProps} />,
    );
    expect(html).toContain('h_eff 96.3 W/m²K, Bi 0.110');
    expect(html).not.toContain('bg-mark-100');
  });
});
