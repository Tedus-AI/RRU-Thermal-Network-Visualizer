import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildSharedStructure } from '@/thermal/graph/sharedStructure';
import { DEFAULT_SOLVER_SETTINGS, type ThermalNetwork } from '@/thermal/types';

import { EdgeInspector } from './EdgeInspector';
import type { ScenarioBoundaryEdgeView } from './scenarioBoundaryProjection';

function network(): ThermalNetwork {
  const structure = buildSharedStructure('SINGLE_MAIN_BASE');
  return {
    schema_version: '1.0',
    project_id: 'P',
    revision: 'R',
    network_name: 'Main Thermal Network',
    mode: 'analytical',
    status: 'DRAFT',
    nodes: Object.fromEntries(structure.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(structure.edges.map((edge) => [edge.id, edge])),
    templates: {},
    zones: Object.fromEntries(structure.zones.map((zone) => [zone.id, zone])),
    layout: { mode: 'Auto', positions: {} },
    flotherm_mappings: {},
    solver_settings: { ...DEFAULT_SOLVER_SETTINGS },
  };
}

const callbacks = {
  onPatch: () => undefined,
  onDelete: () => undefined,
  onReverse: () => undefined,
};

describe('Edge Inspector scenario display', () => {
  it('shows active Screen 06 inputs and preview resistance on a boundary edge', () => {
    const graph = network();
    const edge = Object.values(graph.edges).find((candidate) => candidate.method === 'convection_hA')!;
    const scenarioBoundary: ScenarioBoundaryEdgeView = {
      edge_id: edge.id,
      boundary_port_id: 'BP_FIN',
      scenario_id: 'SCN_55C',
      kind: 'combined',
      rth_C_per_W: 0.02442,
      h_W_m2K: 12,
      h_conv_W_m2K: 12,
      h_rad_W_m2K: null,
      emissivity: 0.85,
      area_m2: 2,
      ambient_C: 55,
      source: 'stated',
      fin: null,
      completeness: 'complete',
      resolved: true,
    };

    const html = renderToStaticMarkup(
      <EdgeInspector
        edge={edge}
        network={graph}
        readOnly={false}
        readiness={{ errors: 0, warnings: 0, info: 2 }}
        scenarioBoundary={scenarioBoundary}
        {...callbacks}
      />,
    );

    expect(html).toContain('Scenario Resolved');
    expect(html).toContain('Screen 06 · SCN_55C · 0.0244 °C/W');
    expect(html).toContain('12.00 W/m²·K');
    expect(html).toContain('0.850');
    expect(html).toContain('2.000000 m²');
    expect(html).toContain('55.0 °C');
  });

  it('describes the near-zero structural link as isothermal instead of zero', () => {
    const graph = network();
    const edge = Object.values(graph.edges).find(
      (candidate) => candidate.parameters?.ideal_link === true,
    )!;
    const html = renderToStaticMarkup(
      <EdgeInspector
        edge={edge}
        network={graph}
        readOnly={false}
        readiness={{ errors: 0, warnings: 0, info: 0 }}
        {...callbacks}
      />,
    );

    expect(html).toContain('Isothermal solver link / 等溫求解連結');
    expect(html).toContain('&lt; 0.0001 °C/W');
    expect(html).not.toContain('0.0000 °C/W');
  });

  it('shows the fin gradient on the root link once a scenario states fin geometry', () => {
    const graph = network();
    const edge = Object.values(graph.edges).find(
      (candidate) => candidate.parameters?.ideal_link === true,
    )!;
    const scenarioBoundary: ScenarioBoundaryEdgeView = {
      edge_id: edge.id,
      boundary_port_id: 'BP_FIN',
      scenario_id: 'SCN_45C',
      kind: 'fin_conduction',
      rth_C_per_W: 0.0166,
      h_W_m2K: null,
      h_conv_W_m2K: null,
      h_rad_W_m2K: null,
      emissivity: null,
      area_m2: 0.918,
      ambient_C: 45,
      source: 'fin_geometry',
      fin: { eta_fin: 0.93, effectiveness: 0.93, tipExcessRatio: 0.8802, mLc: 0.4712 },
      completeness: 'complete',
      resolved: true,
    };

    const html = renderToStaticMarkup(
      <EdgeInspector
        edge={edge}
        network={graph}
        readOnly={false}
        readiness={{ errors: 0, warnings: 0, info: 0 }}
        scenarioBoundary={scenarioBoundary}
        {...callbacks}
      />,
    );

    expect(html).toContain('Fin Conduction / 鰭片導熱');
    expect(html).toContain('0.9300');
    expect(html).toContain('0.8802');
    expect(html).toContain('0.0166 °C/W');
    // The same step must stop claiming to be isothermal while it carries this.
    expect(html).not.toContain('Isothermal solver link / 等溫求解連結');
  });

  it('reports a fin boundary’s emissivity as folded into h_rad rather than as an input', () => {
    const graph = network();
    const edge = Object.values(graph.edges).find(
      (candidate) => candidate.method === 'convection_hA',
    )!;
    const scenarioBoundary: ScenarioBoundaryEdgeView = {
      edge_id: edge.id,
      boundary_port_id: 'BP_FIN',
      scenario_id: 'SCN_45C',
      kind: 'combined',
      rth_C_per_W: 0.1262,
      h_W_m2K: 8.633,
      h_conv_W_m2K: 6.233,
      h_rad_W_m2K: 2.4,
      emissivity: null,
      area_m2: 0.918,
      ambient_C: 45,
      source: 'fin_geometry',
      fin: { eta_fin: 0.93, effectiveness: 0.93, tipExcessRatio: 0.8802, mLc: 0.4712 },
      completeness: 'complete',
      resolved: true,
    };

    const html = renderToStaticMarkup(
      <EdgeInspector
        edge={edge}
        network={graph}
        readOnly={false}
        readiness={{ errors: 0, warnings: 0, info: 0 }}
        scenarioBoundary={scenarioBoundary}
        {...callbacks}
      />,
    );

    expect(html).toContain('8.63 W/m²·K');
    expect(html).toContain('6.23 + 2.40 W/m²·K');
    expect(html).toContain('In h_rad');
    expect(html).toContain('0.918000 m²');
  });
});

