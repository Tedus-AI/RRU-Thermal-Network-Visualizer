/**
 * Deterministic recommendations — 08 §18.
 *
 * Rules, not a language model. The same edge type always produces the same
 * advice, so two engineers reading the same analysis see the same words, and
 * the screen never invents a number it did not compute.
 *
 * The advice says what to REVIEW. It never says "set Rth to X" — the actual
 * engineering change goes back through Screens 04 / 05 / 06 (08 §23).
 */

import type { ThermalEdge } from '../types';
import type { Candidate, SensitivityOutcome } from './analysisTypes';

interface Rule {
  title: string;
  zh: string;
  points: string[];
}

const BY_TYPE: Partial<Record<ThermalEdge['type'], Rule>> = {
  tim: {
    title: 'Thermal interface material',
    zh: '熱介面材料',
    points: [
      'Review TIM thickness and bond line — a thinner, better-controlled BLT is usually the cheapest gain.',
      'Review the TIM conductivity grade and whether the datasheet value applies at the real compression.',
      'Review compression / mounting pressure and the effective contact area.',
    ],
  },
  solder: {
    title: 'Solder joint',
    zh: '銲錫接合',
    points: [
      'Review solder void content and the reflow profile.',
      'Review pad geometry and the effective joint area.',
    ],
  },
  package_rjc: {
    title: 'Package junction-to-case',
    zh: '封裝接面至外殼',
    points: [
      'Rjc is a package property — review the part selection or the vendor thermal model rather than the board design.',
      'Confirm the datasheet Rjc applies to this mounting condition and this die configuration.',
    ],
  },
  thermal_via: {
    title: 'Thermal vias',
    zh: '導熱孔',
    points: [
      'Review via count, diameter and pitch under the pad.',
      'Review plating thickness and whether the vias are filled.',
      'Review whether a copper coin would replace the via field entirely.',
    ],
  },
  contact: {
    title: 'Mechanical contact',
    zh: '機械接觸',
    points: [
      'Review flatness, surface finish and clamping force at the interface.',
      'Review whether a gap filler or a TIM belongs at this joint.',
    ],
  },
  spreading: {
    title: 'Spreading path',
    zh: '熱擴散路徑',
    points: [
      'Review base thickness and the spreading area available to this zone.',
      'Review heat-pipe or vapour-chamber placement across the shared base.',
      'Review the continuity of the metal path — a local thinning dominates the spread.',
    ],
  },
  conduction: {
    title: 'Solid conduction path',
    zh: '固體導熱路徑',
    points: [
      'Review the cross-sectional area and the length of the conduction path.',
      'Review the material choice for this section.',
      'Review whether the path is interrupted by a joint that belongs to another candidate.',
    ],
  },
  heat_pipe: {
    title: 'Heat pipe',
    zh: '熱管',
    points: [
      'Review heat-pipe count, diameter and the evaporator / condenser contact length.',
      'Confirm the transport limit is not being approached at this heat load and orientation.',
    ],
  },
  convection: {
    title: 'Convection to ambient',
    zh: '對流至環境',
    points: [
      'Review effective fin area, fin spacing and exposure to the airflow.',
      'Review the convection coefficient assumption in Screen 06 before redesigning hardware.',
      'Review whether the surface is shadowed by the enclosure or by an adjacent unit.',
    ],
  },
  radiation: {
    title: 'Radiation to surroundings',
    zh: '輻射至周圍',
    points: [
      'Review surface emissivity — a coating change is often the least intrusive improvement.',
      'Review the view factor and what the surface actually sees.',
    ],
  },
};

const FALLBACK: Rule = {
  title: 'Thermal path segment',
  zh: '熱路徑區段',
  points: [
    'Review the geometry and material assumptions behind this resistance.',
    'Review the source of the Rth value before committing to a design change.',
  ],
};

export function recommendFor(candidate: Candidate, outcome: SensitivityOutcome): Rule {
  const base = BY_TYPE[candidate.edge.type] ?? FALLBACK;
  const points = [...base.points];

  if (candidate.boundary_derived) {
    points.unshift(
      'This resistance is derived from the Screen 06 boundary conditions, so confirm h, area and emissivity before treating it as a hardware problem.',
    );
  }

  if (candidate.shared) {
    points.push(
      `This segment is shared: ${outcome.affected_component_count} component(s) improve when it does.`,
    );
  }

  if (candidate.confidence === 'low') {
    points.push(
      'Confidence in this resistance is low. Confirm the value before spending design effort on it.',
    );
  }

  if (outcome.solve_status === 'FAILED') {
    points.push('The sensitivity solve for this candidate failed; the projected benefit is unknown.');
  }

  return { ...base, points };
}
