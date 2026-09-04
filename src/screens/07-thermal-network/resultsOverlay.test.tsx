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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultModeToolbar } from './ResultModeToolbar';
import { FloatingPanel } from '@/ui/FloatingPanel';

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
  exporting: null,
  onOpenResults: vi.fn(),
  onExportJpg: vi.fn(),
  onExportPdf: vi.fn(),
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
    limit_type: 'Tj',
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

    expect(button).toContain('text-white');
    expect(button).toContain('shadow-sm');
  });

  /**
   * Orange, not the blue accent: every other filled control in the app is
   * accent-600, so the panel's entry point was the same colour as navigation.
   * It is deliberately NOT `warn-*`, which is amber and means an alert — a
   * control that is always on screen must not read as one.
   */
  it('is orange, so it is not read as another accent control', () => {
    const html = renderToStaticMarkup(<ResultModeToolbar {...toolbarProps} />);
    const button = html.slice(html.indexOf('aria-label="Results'));

    expect(button).toContain('bg-orange-600');
    expect(button).not.toContain('bg-accent-600');
    expect(button).not.toContain('bg-warn');
  });

  it('still renders in fullscreen', () => {
    const html = renderToStaticMarkup(
      <ResultModeToolbar {...toolbarProps} fullscreen componentVisibilityOpen />,
    );

    expect(html).toContain('aria-label="Results / 求解結果"');
  });
});

/**
 * The panel is a WINDOW, not a modal.
 *
 * As a modal it was `fixed inset-0 z-50`, and the node inspector — which a
 * click on one of its own rows opens — is a `FloatingPanel` at z-40. So the
 * thing the click summoned appeared behind the thing that was clicked, and
 * could not be read. A modal was also the wrong promise: reading a result table
 * against the graph is not a decision to confirm and dismiss, it is two views
 * of one answer, and both belong on screen and movable.
 */
describe('the panel itself', () => {
  // `FloatingPanel` sizes itself against the viewport and reads its remembered
  // geometry on first render, so SSR needs both. Without the stub the render
  // throws "window is not defined" and every assertion below passes vacuously
  // on an error boundary that is not there.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      innerWidth: 1600,
      innerHeight: 1000,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

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
        onExportPdf={vi.fn()}
        exporting={false}
        onClose={vi.fn()}
      />,
    );

  it('is a dialog', () => {
    expect(overlay()).toContain('role="dialog"');
  });

  /** A modal owns the screen; this one must not, or the inspector is unreachable. */
  it('is not modal, so what it opens can be reached', () => {
    expect(overlay()).not.toContain('aria-modal');
  });

  it('carries the counts, and the rows', () => {
    const html = overlay();

    expect(html).toContain('85 nodes');
    expect(html).toContain('85 edges');
    expect(html).toContain('XCZU67DR');
  });

  it('offers the PDF, and says Escape closes it', () => {
    const html = overlay();

    expect(html).toContain('aria-label="Export results as PDF / 輸出求解結果 PDF"');
    expect(html).toContain('Esc');
  });

  /**
   * Geometry is the engineer's, and kept. A window they dragged and sized has
   * to come back where they left it — so the stored rect is seeded here and the
   * rendered style has to be it, which is the round trip and not just the key.
   */
  it('opens where it was left', () => {
    const store = new Map<string, string>([
      ['tnvui.panel.07.results', JSON.stringify({ x: 120, y: 90, w: 900, h: 600 })],
    ]);
    vi.stubGlobal('window', {
      innerWidth: 1600,
      innerHeight: 1000,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: () => {},
        removeItem: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    const html = overlay();

    expect(html).toContain('left:120px');
    expect(html).toContain('top:90px');
    expect(html).toContain('width:900px');
    expect(html).toContain('height:600px');
  });

  /** A rect saved on a 27" monitor must not strand the panel off a laptop. */
  it('is pulled back on screen when the saved rect no longer fits', () => {
    const store = new Map<string, string>([
      ['tnvui.panel.07.results', JSON.stringify({ x: 4000, y: 3000, w: 900, h: 600 })],
    ]);
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: () => {},
        removeItem: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    const html = overlay();

    expect(html).not.toContain('left:4000px');
    expect(html).not.toContain('top:3000px');
  });
});

/**
 * The reported bug, as a rule: whichever window was touched last is in front.
 *
 * Two panels are open at once on Screen 07 — the result table, and the
 * inspector a row click opens. At one fixed z-index the second opens behind
 * whichever the stylesheet happened to favour.
 */
describe('two windows at once', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      innerWidth: 1600,
      innerHeight: 1000,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: () => {},
        removeItem: () => void store.clear(),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  const zOf = (html: string) => {
    const match = html.match(/z-index:\s*(\d+)/);
    return match ? Number(match[1]) : null;
  };

  it('gives the later window a higher z than the earlier one', () => {
    const first = zOf(
      renderToStaticMarkup(
        <FloatingPanel title="First" storageKey="tnvui.panel.test.a" onClose={vi.fn()}>
          <span />
        </FloatingPanel>,
      ),
    );
    const second = zOf(
      renderToStaticMarkup(
        <FloatingPanel title="Second" storageKey="tnvui.panel.test.b" onClose={vi.fn()}>
          <span />
        </FloatingPanel>,
      ),
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!).toBeGreaterThan(first!);
  });

  /** Above the fullscreen graph, which sits at z-30. */
  it('opens above the fullscreen graph layer', () => {
    const z = zOf(
      renderToStaticMarkup(
        <FloatingPanel title="Panel" storageKey="tnvui.panel.test.c" onClose={vi.fn()}>
          <span />
        </FloatingPanel>,
      ),
    );

    expect(z!).toBeGreaterThan(30);
  });
});
