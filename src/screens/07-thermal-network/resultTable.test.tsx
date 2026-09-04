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
import { describe, expect, it, vi } from 'vitest';

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
