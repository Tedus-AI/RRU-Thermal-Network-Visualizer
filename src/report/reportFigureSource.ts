/**
 * Where the report's network pictures come from.
 *
 * Screen 11 derived these inline and Screen 12 did not derive them at all — it
 * simply never passed them to the renderer, so the exported PDF printed
 * "Thermal Network Not Available" and "Bottleneck Thermal Network Not
 * Available" over two sections the preview had just drawn in full. §9 says
 * Screen 12 must not change the report's layout; silently dropping two of its
 * seven sections is the largest change it could make.
 *
 * So the derivation lives here and both screens call it. It is the same
 * ranking helper, the same saved studies and the same recomputed levers Screen
 * 10 uses for Improvement Actions — one answer to "which parts matter", not
 * three.
 */

import { projectComponentLimits } from '@/thermal/graph/componentProjection';
import { marginRanking, partsNeedingAttention } from '@/thermal/analysis/marginRanking';
import { segmentLevers, type SegmentLevers } from '@/thermal/analysis/tunableParameters';
import { NEAR_LIMIT_MARGIN_C } from '@/thermal/analysis/temperatureDataset';
import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';
import type { BoundaryPort, ScenarioBoundaryConditionSet } from '@/thermal/boundary/types';
import type { ImprovementStudy } from '@/thermal/analysis/analysisTypes';

import { networkFigures, type NetworkFigure } from './networkFigures';
import type { NetworkFigureContext } from '@/screens/11-report-preview/ReportNetworkFigures';

export interface FigureSourceInput {
  /**
   * The solve INPUT's network where there is one, not the stored graph. A fin
   * link's parameters live on the network the solve ran on, so levers read off
   * the stored graph come back empty and the report says a part has nothing
   * adjustable while Screen 08 is listing six things.
   */
  solve_network: ThermalNetwork | null;
  stored_network: ThermalNetwork | null;
  components: readonly Component[];
  solution: ThermalSolution | null;
  /** A stale solve draws no numbers, so the figures draw none either. */
  stale: boolean;
  scenario_id: string | null;
  studies: readonly ImprovementStudy[];
  boundary_ports: readonly BoundaryPort[];
  boundary_set: ScenarioBoundaryConditionSet | null;
}

export interface FigureSource {
  context: NetworkFigureContext | null;
  figures: NetworkFigure[];
}

export function reportFigureSource(input: FigureSourceInput): FigureSource {
  const base = input.solve_network ?? input.stored_network;
  if (!base) return { context: null, figures: [] };

  const context: NetworkFigureContext = {
    network:
      input.components.length > 0 ? projectComponentLimits(base, [...input.components]) : base,
    solution: input.stale ? null : input.solution,
    scenarioId: input.scenario_id ?? '',
  };

  if (!context.solution) return { context, figures: [] };

  const ranked = partsNeedingAttention(
    marginRanking(context.network, context.solution.node_temperatures_C, 0),
  ).filter((part) => part.margin_C <= NEAR_LIMIT_MARGIN_C);

  const byTarget = new Map(input.studies.map((study) => [study.target_node_id, study]));
  const leversByNode = new Map<string, SegmentLevers[] | null>();
  for (const part of ranked) {
    const study = byTarget.get(part.node_id);
    // null means "no study"; an empty array means "a study whose segments have
    // nothing adjustable". The report says different things about the two.
    leversByNode.set(
      part.node_id,
      study && input.scenario_id
        ? study.segments.map((segment, index) =>
            segmentLevers(
              context.network,
              input.scenario_id as string,
              segment.edge_id,
              segment.label,
              segment.reduction_pct,
              { ports: input.boundary_ports, set: input.boundary_set },
              // A saved study records the segments the reader cut, not where
              // each sat in the chain, so the study's own order is the number
              // the report shows -- on the figure and in the list alike.
              index + 1,
            ),
          )
        : null,
    );
  }

  return {
    context,
    figures: networkFigures({
      network: context.network,
      components: [...input.components],
      ranked,
      leversByNode,
    }),
  };
}
