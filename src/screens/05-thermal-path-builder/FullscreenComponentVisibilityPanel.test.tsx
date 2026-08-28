import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { createComponent, type Component } from '@/domain/component';

import { FullscreenComponentVisibilityPanel } from './FullscreenComponentVisibilityPanel';
import { GraphToolbar } from './GraphToolbar';

function component(id: string, name: string): Component {
  return createComponent({
    id,
    name,
    category: 'RF',
    qty: 4,
    power_W: 12.5,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-08-28T00:00:00.000Z',
    },
  });
}

const toolbarProps = {
  tool: 'select' as const,
  layoutMode: 'Auto',
  zoom: 1,
  showPorts: true,
  showLabels: true,
  canUndo: false,
  canRedo: false,
  readOnly: false,
  onTool: vi.fn(),
  onLayoutMode: vi.fn(),
  onAutoLayout: vi.fn(),
  onAutoConnect: vi.fn(),
  onFit: vi.fn(),
  onZoom: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onValidate: vi.fn(),
  onTogglePorts: vi.fn(),
  onToggleLabels: vi.fn(),
  componentVisibilityOpen: false,
  hiddenComponentCount: 0,
  onToggleComponentVisibility: vi.fn(),
  onToggleFullscreen: vi.fn(),
};

describe('fullscreen component visibility controls', () => {
  it('adds the component visibility entry only while the graph is fullscreen', () => {
    const normal = renderToStaticMarkup(<GraphToolbar {...toolbarProps} fullscreen={false} />);
    const fullscreen = renderToStaticMarkup(
      <GraphToolbar
        {...toolbarProps}
        fullscreen
        componentVisibilityOpen
        hiddenComponentCount={3}
      />,
    );

    expect(normal).not.toContain('Component Visibility / 元件顯示');
    expect(fullscreen).toContain('Component Visibility / 元件顯示');
    expect(fullscreen).toContain('>3</span>');
  });

  it('reports shown and hidden modeled components without changing their data', () => {
    const components = [component('CMP_PA', 'Final PA'), component('CMP_FPGA', 'FPGA')];
    const hiddenIds = new Set(['CMP_FPGA']);
    const before = JSON.stringify(components);

    const html = renderToStaticMarkup(
      <FullscreenComponentVisibilityPanel
        components={components}
        hiddenIds={hiddenIds}
        onToggleVisible={vi.fn()}
        onShowAll={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('Hide Final PA in the graph');
    expect(html).toContain('Show FPGA in the graph');
    expect(html).toContain('1 hidden / 已隱藏 1 個');
    expect(JSON.stringify(components)).toBe(before);
    expect([...hiddenIds]).toEqual(['CMP_FPGA']);
  });
});
