/**
 * The result table, and the one class of style it may not use.
 *
 * The table is rasterized into a PDF by html2canvas 1.4.1, because jsPDF's
 * built-in fonts have no CJK glyphs and a text PDF would drop half of every
 * bilingual label. html2canvas cannot parse `oklab()`, and Tailwind v4 compiles
 * every `/NN` opacity modifier — `border-line/50`, `bg-surface-muted/60` — into
 * exactly that. The first browser run of the export died on it:
 *
 *   Export failed: Attempting to parse an unsupported color function "oklab"
 *
 * Nothing about that is visible on screen, so it can only come back by someone
 * reaching for the obvious utility. Hence a test, rather than a comment.
 *
 * The column checks are the other half of this change: `Rth` could only ever be
 * filled on an edge row and the rise above ambient only on a node row, so on
 * the view an engineer actually reads both were columns of em dashes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultTree } from './ResultTree';
import type { ResultTreeGroupRow } from './resultViewModel';

const GROUPS: ResultTreeGroupRow[] = [
  {
    kind: 'group',
    id: 'CMP_PA',
    name: 'GTRB384608FC',
    subtitle: 'RF · ×4',
    peak_C: 181.3,
    power_W: 211.96,
    limit_C: 225,
    limit_type: 'Tj',
    margin_C: 43.7,
    status: 'pass',
    nodes: [
      {
        kind: 'node',
        id: 'NODE_CMP_PA_1_JUNCTION',
        row: {
          node: {
            id: 'NODE_CMP_PA_1_JUNCTION',
            name: 'GTRB384608FC 1 Junction',
            type: 'junction',
            limit_type: 'Tj',
          },
          temperature_C: 181.3,
          delta_to_ambient_C: 136.3,
          power_W: 52.99,
          limit_C: 225,
          margin_C: 43.7,
          status: 'pass',
          fixed: false,
        },
        edges: [
          {
            kind: 'edge',
            id: 'EDGE_CMP_PA_1_JUNCTION_CASE',
            name: 'Rjc',
            outgoing: true,
            counterpart_name: 'GTRB384608FC 1 Case',
            rth_C_per_W: 1.5,
            heat_flow_W: 53,
            delta_T_C: 79.5,
            rth_origin: 'edge',
          },
        ],
      },
    ],
  } as unknown as ResultTreeGroupRow,
];

/**
 * `useColumnWidths` reads the remembered widths on first render, so SSR needs a
 * window. Without the stub every assertion below would pass against a throw.
 */
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

function render(overrides: Partial<Parameters<typeof ResultTree>[0]> = {}) {
  return renderToStaticMarkup(
    <ResultTree
      groups={GROUPS}
      hasSolution
      selectedNodeId={null}
      selectedEdgeId={null}
      onSelectNode={vi.fn()}
      onSelectEdge={vi.fn()}
      {...overrides}
    />,
  );
}

describe('what html2canvas has to be able to parse', () => {
  /**
   * The regression. Any `text-x/50`-shaped class here becomes `oklab()` and
   * takes the PDF export down with it.
   */
  it('uses no Tailwind opacity modifier anywhere in the table', () => {
    const html = render({ forceExpanded: true });
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
      match[1].split(/\s+/),
    );
    const withOpacity = classes.filter((name) => /^[a-z-]+-[a-z0-9-]+\/\d+$/.test(name));

    expect(withOpacity).toEqual([]);
  });
});

describe('the columns the table keeps', () => {
  it('heads the four a node row can actually fill', () => {
    const html = render();

    for (const heading of ['Component · Node · Path', 'Limit', 'Margin']) {
      expect(html).toContain(heading);
    }
  });

  /**
   * Both were dashes on the view an engineer reads: Rth is an edge quantity and
   * the rise above ambient a node one, and neither had a row to fill it.
   */
  it('no longer heads Rth or ΔT, which only one kind of row could fill', () => {
    const html = render();
    const header = html.slice(0, html.indexOf('GTRB384608FC'));

    expect(header).not.toContain('Rth');
    expect(header).not.toContain('ΔT');
  });
});

describe('where an edge keeps its numbers', () => {
  /** Deleting the columns must not delete the data. */
  it('still shows the drop, the flow and the resistance', () => {
    const html = render({ forceExpanded: true });

    expect(html).toContain('79.5 K');
    expect(html).toContain('53.0 W');
    expect(html).toContain('1.500 °C/W');
  });

  it('says which node the edge runs to', () => {
    expect(render({ forceExpanded: true })).toContain('GTRB384608FC 1 Case');
  });
});

describe('opening the tree', () => {
  /** Collapsed by default: ten components of chains is not a first view. */
  it('shows only the group rows until something is opened', () => {
    const html = render();

    expect(html).toContain('GTRB384608FC');
    expect(html).not.toContain('GTRB384608FC 1 Junction');
  });

  /**
   * The PDF renders THIS component with `forceExpanded`, not a print-only copy
   * of it — a second rendering of one table drifts, and the drift is noticed
   * after it has shipped in a document.
   */
  it('opens everything for the export, without being clicked', () => {
    const html = render({ forceExpanded: true });

    expect(html).toContain('GTRB384608FC 1 Junction');
    expect(html).toContain('1.500 °C/W');
  });
});

/**
 * The reported problem: "一展開就感覺有點亂，全部搞在一起". Twenty rows of one
 * component at the same weight on the same ground, with nothing saying where
 * that component ended and the next began.
 */
describe('telling one component from the next', () => {
  it('gives each component a block of its own', () => {
    const html = render({ forceExpanded: true });

    expect(html).toContain('data-result-block="CMP_PA"');
    expect((html.match(/<tbody/g) ?? []).length).toBe(1);
  });

  /** The header a continued page in the PDF puts back is found by this hook. */
  it('marks the block header, which the PDF re-shows on a continued page', () => {
    expect(render()).toContain('data-result-block-header');
  });

  /** The gap is the signal the eye catches while scrolling. */
  it('closes an open block with a gap, and a closed one without', () => {
    expect(render({ forceExpanded: true })).toContain('data-result-block-gap');
    expect(render()).not.toContain('data-result-block-gap');
  });

  /**
   * One continuous stripe down every row of the block: it bounds the block AND
   * says whether the part is inside its limit. Green here, since this fixture
   * passes.
   */
  it('runs a status rail down every row of the block', () => {
    const html = render({ forceExpanded: true });
    const rails = html.match(/border-left:3px solid var\(--color-ok-500\)/g) ?? [];

    // The group row, its node, and that node's edge — the whole block.
    expect(rails.length).toBe(3);
  });

  it('paints the rail red when the component is over limit', () => {
    const over = [{ ...GROUPS[0], status: 'over' as const, margin_C: -1.9 }];
    const html = renderToStaticMarkup(
      <ResultTree
        groups={over}
        hasSolution
        selectedNodeId={null}
        selectedEdgeId={null}
        onSelectNode={vi.fn()}
        onSelectEdge={vi.fn()}
      />,
    );

    expect(html).toContain('border-left:3px solid var(--color-danger-500)');
  });
});

describe('an edge is not a node', () => {
  /**
   * It used to be a row in the same five-column grid, and its numbers landed
   * under Q, LIMIT and MARGIN — headings that mean something else entirely.
   */
  it('spans the whole table rather than borrowing the node columns', () => {
    const html = render({ forceExpanded: true });
    const edge = html.slice(html.indexOf('Rjc'));

    // Case-insensitive: `renderToStaticMarkup` echoes the JSX spelling, while
    // the browser DOM carries the real `colspan`. Both were checked.
    expect(html.toLowerCase()).toContain('colspan="6"');
    // …and its numbers sit next to its name, not at the far right.
    expect(edge.indexOf('79.5 K')).toBeGreaterThan(-1);
  });
});

describe('columns the engineer sized', () => {
  it('is table-fixed with a colgroup, or a dragged width springs back', () => {
    const html = render();

    expect(html).toContain('table-fixed');
    expect(html).toContain('<colgroup>');
  });

  it('offers a resize handle per sized column, and none on the filler', () => {
    const html = render();

    expect((html.match(/role="separator"/g) ?? []).length).toBe(5);
  });

  /**
   * `table-fixed` needs every width stated, and a table of stated widths stops
   * where they stop — 832 px adrift in an 1180 px window. The filler takes the
   * slack so the table fills its panel without disturbing the five real widths.
   */
  it('fills the panel through an unsized filler column', () => {
    const html = render();

    expect(html).toContain('width:100%');
    expect(html).toContain('min-width:832px');
    expect((html.match(/<col[ />]/g) ?? []).length).toBe(6);
  });

  /** A PDF has no draggable columns, and a stray hover style is a raster risk. */
  it('drops the handles for the export', () => {
    expect(render({ forceExpanded: true })).not.toContain('role="separator"');
  });
});

/**
 * html2canvas rasterizes this table into the PDF, and it does not size a flex
 * container the way the browser does: every metric chip drew its text straight
 * through its own rounded border, the box narrower than the text inside it.
 * Ordinary inline flow it gets right.
 */
describe('what the chips may not be', () => {
  it('lays the metric chips out inline, not as flex boxes', () => {
    const html = render({ forceExpanded: true });
    const chip = html.slice(html.indexOf('79.5 K') - 400, html.indexOf('79.5 K'));

    expect(chip).toContain('inline-block');
    expect(chip).not.toContain('items-baseline');
  });

  it('keeps a chip on one line', () => {
    expect(render({ forceExpanded: true })).toContain('whitespace-nowrap');
  });
});
