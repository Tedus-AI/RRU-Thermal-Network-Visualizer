/**
 * The heat path drawing has a branch for every path and every mount, and most
 * parts arrive with half their numbers missing. Every combination has to draw,
 * blank or filled, in both views — a NaN in a coordinate or a thrown error
 * would take the whole inspector down with it.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  HEAT_PATH_TYPES,
  MOUNT_TYPES,
  createComponent,
  emptyMount,
  type Component,
  type HeatPathType,
  type MountType,
} from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { sourced } from '@/domain/sourcedValue';

import { draw2D, draw3D, solderVoids, svgIds } from './heatPathDrawing';
import { heatPathView } from './heatPathModel';

function part(heatPath: HeatPathType, mount: MountType, filled: boolean): Component {
  const base = createComponent({
    id: 'CMP_X',
    name: 'X',
    category: 'RF',
    qty: 2,
    power_W: 10,
    provenance: {
      source_type: 'Manual',
      source_project_id: null,
      source_project_name: null,
      source_file: null,
      imported_at: '2026-10-21T00:00:00.000Z',
    },
  });
  const spec = base.thermal_spec;
  if (!filled) {
    return {
      ...base,
      thermal_spec: { ...spec, heat_path: { type: heatPath, parameters: {} }, mount: emptyMount(mount) },
    };
  }
  return {
    ...base,
    thermal_spec: {
      ...spec,
      limit_C: sourced(150, 'Manual'),
      r_jc_C_per_W: sourced(1, 'Manual'),
      geometry: {
        ...spec.geometry,
        package_L_mm: 20,
        package_W_mm: 10,
        package_H_mm: 3,
        source_L_mm: 8,
        source_W_mm: 6,
        board_thickness_mm: 2,
      },
      heat_path: {
        type: heatPath,
        parameters: heatPath === 'DirectMetal' ? { contact_geometry: 'PerimeterFrame', perimeter_land_width_mm: 2, exposed_surface_enabled: true } : {},
      },
      tim: { ...spec.tim, tim_id: 'TIM_GREASE' },
      mount: {
        ...emptyMount(mount),
        contact_L_mm: 30,
        contact_W_mm: 20,
        height_mm: 4,
        heat_pipe_count: 2,
        heat_pipe_R_C_per_W: 0.1,
        attachment: 'Bolted',
        joint_tim_id: 'TIM_PAD',
        joint_blt_mm: 0.5,
      },
      spreading_domain: { mode: 'Manual', area_mm2: 5000 },
    },
  };
}

const materials = {
  ...defaultMaterials(),
  coin_L_mm: sourced(40, 'Manual'),
  coin_W_mm: sourced(30, 'Manual'),
  coin_thickness_mm: sourced(2.5, 'Manual'),
  hsk_base_thickness_mm: sourced(7, 'Manual'),
  hsk_base_L_mm: sourced(330, 'Manual'),
  hsk_base_W_mm: sourced(270, 'Manual'),
};

describe('heat path drawing', () => {
  const ids = svgIds('t');
  for (const heatPath of HEAT_PATH_TYPES) {
    for (const mount of MOUNT_TYPES) {
      for (const filled of [false, true]) {
        it(`draws ${heatPath} + ${mount} (${filled ? 'filled' : 'blank'}) in both views`, () => {
          const view = heatPathView(part(heatPath, mount, filled), materials);
          for (const drawing of [draw2D(view, ids), draw3D(view, ids, 35), draw3D(view, ids, 215)]) {
            const html = renderToStaticMarkup(
              <svg viewBox={drawing.viewBox}>
                {drawing.layers.map((group) => (
                  <g key={group.layer}>{group.node}</g>
                ))}
                {drawing.flow}
                {drawing.probe}
                {drawing.labels.map((label, index) => (
                  <g key={index}>{label.node}</g>
                ))}
                {(['pkgL', 'pkgW', 'pkgH', 'eL', 'blt', 'mL', 'mH', 'jointBlt', 'landW', 'spread', 'rjc'] as const).map(
                  (key) => (
                    <g key={key}>{drawing.dim(key)}</g>
                  ),
                )}
              </svg>,
            );
            expect(html).not.toMatch(/NaN|Infinity|undefined/);
            expect(drawing.layers.some((group) => group.layer === 'base')).toBe(true);
          }
        });
      }
    }
  }
});

describe('solder voids in the 3D stack', () => {
  it('cover exactly the part of the joint that is not solder, inside the joint', () => {
    const voids = solderVoids(60, 30, 0.75);
    const area = voids.reduce((sum, [, , r]) => sum + Math.PI * r * r, 0);
    expect(area).toBeCloseTo(0.25 * 60 * 30, 6);
    for (const [x, y, r] of voids) {
      expect(Math.abs(x) + r).toBeLessThanOrEqual(30 + 1e-9);
      expect(Math.abs(y) + r).toBeLessThanOrEqual(15 + 1e-9);
    }
  });

  it('draws none for a full joint or a voiding nobody entered', () => {
    expect(solderVoids(60, 30, 1)).toEqual([]);
    expect(solderVoids(60, 30, null)).toEqual([]);
  });
});
