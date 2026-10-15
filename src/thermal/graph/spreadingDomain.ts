/**
 * How much of the HSK base an edge spreads into — see `SpreadingDomainSpec`.
 *
 * The part's choice travels on its port node, stamped by `networkBuilder` and
 * kept current by `refreshMounts`, for the same reason the mount does: the base
 * edge is built and refreshed from the graph alone, without the component list.
 * The solver's projection reads the component itself, so a choice made in
 * Screen 04 is solved with before Screen 05 has restamped anything.
 *
 * On an edge with a reduced domain it becomes three parameters (an edge on the
 * whole base carries none of them, exactly as before the choice existed):
 *   - `base_area_mm2`   the whole base. The Biot refinement takes the far-face h
 *                        off it: h is intensive, the base is what the fins cool.
 *   - `plate_area_mm2`  the domain Lee's series spreads into — the whole base, a
 *                        stated area, or (after the solve) the edge's heat share.
 *   - `spreading_domain` 'Manual' | 'HeatShare'; absent for the whole base.
 */

import {
  emptySpreadingDomain,
  spreadingDomainOf,
  type SpreadingDomainSpec,
} from '@/domain/component';
import type { ThermalEdge, ThermalNetwork, ThermalNode } from '../types';
import { portNodeOf } from './spreadingVariant';

export const SPREADING_DOMAIN_KEY = 'spreading_domain';

/** The domain stamped on a node; anything older reads as the whole base. */
export function spreadingDomainStamp(node: Pick<ThermalNode, 'metadata'> | undefined): SpreadingDomainSpec {
  const stored = node?.metadata?.[SPREADING_DOMAIN_KEY];
  return stored && typeof stored === 'object'
    ? spreadingDomainOf({ spreading_domain: stored as SpreadingDomainSpec })
    : emptySpreadingDomain();
}

/** The domain of the part an edge starting at `fromNodeId` carries. */
export function spreadingDomainAt(network: ThermalNetwork, fromNodeId: string): SpreadingDomainSpec {
  return spreadingDomainStamp(portNodeOf(network, fromNodeId));
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Applies a domain to base-edge parameters whose `plate_area_mm2` is still the
 * whole base. `devices` is how many parts the edge stands for: a stated area is
 * per device, and the calculator divides the plate between them again.
 *
 * A stated mode without its area spreads into the whole base — the conservative
 * reading of a choice that is not finished — and Screen 04 says so beside the
 * field. Nothing here invents an area.
 */
export function applySpreadingDomain(
  parameters: NonNullable<ThermalEdge['parameters']>,
  domain: SpreadingDomainSpec,
  devices = 1,
): NonNullable<ThermalEdge['parameters']> {
  const next = { ...parameters };
  delete next.spreading_domain;
  delete next.heat_share;
  delete next.base_area_mm2;
  const base = next.plate_area_mm2;
  // The whole base needs nothing beyond what the edge always carried, so an
  // edge that keeps it is written exactly as before this choice existed.
  if (!positive(base)) return next;

  if (domain.mode === 'Manual' && domain.area_mm2 != null) {
    next.base_area_mm2 = base;
    next.plate_area_mm2 = clampDomainArea(domain.area_mm2 * Math.max(1, devices), next);
    next.spreading_domain = 'Manual';
  } else if (domain.mode === 'HeatShare') {
    // The share is a solved quantity (00 Rule 4); until the solve, the whole base.
    next.base_area_mm2 = base;
    next.spreading_domain = 'HeatShare';
  }
  return next;
}

/** A domain no smaller than the contact patch and no larger than the base. */
export function clampDomainArea(
  area: number,
  parameters: NonNullable<ThermalEdge['parameters']>,
): number {
  const base = parameters.base_area_mm2 ?? parameters.plate_area_mm2;
  const source = parameters.source_area_mm2;
  let value = area;
  if (positive(base)) value = Math.min(value, base);
  if (positive(source)) value = Math.max(value, source);
  return value;
}

/** What an edge reports about its domain, for the inspectors. */
export function edgeSpreadingDomain(edge: Pick<ThermalEdge, 'parameters'>): {
  mode: 'WholeBase' | 'HeatShare' | 'Manual';
  plate_area_mm2: number | null;
  base_area_mm2: number | null;
} {
  const params = edge.parameters ?? {};
  const mode =
    params.spreading_domain === 'Manual' || params.spreading_domain === 'HeatShare'
      ? params.spreading_domain
      : 'WholeBase';
  const plate = positive(params.plate_area_mm2) ? params.plate_area_mm2 : null;
  const base = positive(params.base_area_mm2) ? params.base_area_mm2 : plate;
  return { mode, plate_area_mm2: plate, base_area_mm2: base };
}
