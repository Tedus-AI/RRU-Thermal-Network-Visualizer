/**
 * The result table as a panel, and the button that opens it.
 *
 * It used to be a resizable row under the graph, and the two shared one screen:
 * measured on the STARKCORE project at 1500x950, the canvas got 260 px. With
 * the row gone it gets 416 — 60 % more of the thing the screen is named after —
 * and the table gets a panel almost as large as the window instead of 320 px.
 *
 * The button had to go in the TOOLBAR rather than on the page, because the page
 * around the graph is not rendered in fullscreen at all: the old row simply did
 * not exist there, so the results were unreachable without leaving fullscreen
 * first.
 *
 * These are markup-level checks — the repo renders components with
 * `renderToStaticMarkup` and has no DOM. Escape, the X, the backdrop and the
 * fullscreen case were verified in the browser against the real project.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ResultModeToolbar } from './ResultModeToolbar';
import { ResultsOverlay } from './ResultsOverlay';
import type { ResultTreeGroupRow } from './resultViewModel';

const toolbarProps = {
  mode: 'rth' as const,
  hasResult: true,
  display: { showLabels: true, showPower: true, showLimits: false, showBoundary: true },
  tool: 'select' as const,
  zoom: 1,
  layoutMode: 'Auto',
  fullscreen: false,
  componentVisibilityOpen: false,
  hiddenComponentCount: 0,
  resultsSummary: '85 · 85',
  onOpenResults: vi.fn(),
  onMode: vi.fn(),
  onDisplay: vi.fn(),
  onTool: vi.fn(),
  onZoom: vi.fn(),
  onLayoutMode: vi.fn(),
  onRelayout: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onToggleComponentVisibility: vi.fn(),
};

const GROUPS: ResultTreeGroupRow[] = [
  {
    kind: 'group',
    id: 'CMP_XCZU67DR',
    name: 'XCZU67DR',
    subtitle: 'Digital · ×1 · 3',
    peak_C: 96.2,
    power_W: 35,
    limit_C: 100,
    margin_C: 3.8,
    status: 'pass',
    nodes: [],
  },
];

describe('the button that opens the results', () => {
  it('is on the graph toolbar, so fullscreen has it too', () => {
    const html = renderToStaticMarkup(<ResultModeToolbar {...toolbarProps} />);

    expect(html).toContain('aria-label="Results / 求解結果"');
  });

  /** How much is behind it, without opening it. */
  it('says how many nodes and edges are behind it', () => {
    const html = renderToStaticMarkup(<ResultModeToolbar {...toolbarProps} />);

    expect(html).toContain('85 · 85');
  });

  /**
   * "顯眼的顏色，一眼就看出來這按鈕可以按" — the toolbar is otherwise ghost icons
   * and outline pills, so this is the one FILLED control on it. A mode pill goes
   * accent when active, but it is not a solid button and carries no icon.
   */
  it('is filled, not a ghost control like everything else on the toolbar', () => {
    const html = renderToStaticMarkup(<ResultModeToolbar {...toolbarProps} />);
    const button = html.slice(html.indexOf('aria-label="Results'));

    expect(button).toContain('bg-accent-600');
    expect(button).toContain('text-white');
    expect(button).toContain('shadow-sm');
  });

  it('still renders in fullscreen', () => {
    const html = renderToStaticMarkup(
      <ResultModeToolbar {...toolbarProps} fullscreen componentVisibilityOpen />,
    );

    expect(html).toContain('aria-label="Results / 求解結果"');
  });
});

describe('the panel itself', () => {
  const overlay = () =>
    renderToStaticMarkup(
      <ResultsOverlay
        groups={GROUPS}
        hasSolution
        nodeCount={85}
        edgeCount={85}
        selectedNodeId={null}
        selectedEdgeId={null}
        onSelectNode={vi.fn()}
        onSelectEdge={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it('is a modal dialog, not a section of the page', () => {
    const html = overlay();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  /**
   * Above the fullscreen graph, which is `fixed inset-0 z-30`. At a lower
   * z-index the panel would open behind the very graph it was opened over.
   */
  it('sits above the fullscreen graph layer', () => {
    expect(overlay()).toContain('z-50');
  });

  it('offers the X, and says Escape works', () => {
    const html = overlay();

    expect(html).toContain('aria-label="Close results / 關閉求解結果"');
    expect(html).toContain('Esc');
  });

  it('carries the counts, and the rows', () => {
    const html = overlay();

    expect(html).toContain('85 nodes');
    expect(html).toContain('85 edges');
    expect(html).toContain('XCZU67DR');
  });

  /** The reason it moved: as tall as the window allows. */
  it('is sized to the window rather than to a pane', () => {
    expect(overlay()).toContain('h-[92vh]');
  });
});
