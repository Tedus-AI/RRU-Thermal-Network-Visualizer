/**
 * Screen 08 — Bottleneck Analysis.
 *
 * The question, in the order an engineer actually asks it:
 *
 *   1. Which parts are closest to their own spec?       → the margin deck
 *   2. Show me that one's heat path.                    → Screen 07's graph, focused
 *   3. Which segments of it are worth arguing about?    → the three biggest drops
 *   4. If I got N % out of them, what do I get back?    → live, full re-solve
 *   5. Record that.                                     → a saved study
 *
 * This replaces a screen that ranked all 85 edges by a composite score and left
 * the reader to work out what to do with the list. The ranking was not wrong,
 * it answered a question one step removed from the one being asked: an engineer
 * does not need the 41st best edge in the machine, they need the three segments
 * on the path of the part that is about to fail.
 *
 * What it still never does (08 §30): temperature histogram, node temperature
 * bar chart, physical distribution map, executive pass/fail summary, report
 * narrative, FloTHERM parser. Those are 09, 10 and 11.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Maximize2,
  Minimize2,
  Network,
  PictureInPicture2,
  Table2,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { Badge, Button, Select, Skeleton } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import { KpiTile } from '@/ui/KpiTile';
import { toast } from '@/ui/toast';
import { focusHiddenNodes, focusLabels, graphPaths } from '@/ui/graphExplorerModel';
import { FloatingPanel } from '@/ui/FloatingPanel';
import { ResizablePane } from '@/ui/ResizablePane';
import { ResizableSidebar } from '@/ui/ResizableSidebar';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { useAnalysisStore } from '@/data/analysisStore';

import { DEFAULT_SOLVER_SETTINGS } from '@/thermal/types';
import { solveNetwork } from '@/thermal/networkSolver';
import { projectComponentLimits } from '@/thermal/graph/componentProjection';
import { marginRanking } from '@/thermal/analysis/marginRanking';
import {
  chainSegments,
  solutionWithWhatIf,
  solveWithAdjustments,
  type Adjustment,
} from '@/thermal/analysis/whatIf';
import {
  ANALYSIS_SCHEMA_VERSION,
  type ImprovementStudy,
  type StudySegment,
} from '@/thermal/analysis/analysisTypes';
import { segmentLevers, type Lever, type SegmentLevers } from '@/thermal/analysis/tunableParameters';
import {
  SolvedGraphCanvas,
  type SolvedGraphHandle,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';
import { NodeResultInspector } from '@/screens/07-thermal-network/NodeResultInspector';
import { EdgeResultInspector } from '@/screens/07-thermal-network/EdgeResultInspector';
import { ResultsOverlay } from '@/screens/07-thermal-network/ResultsOverlay';
import {
  ANALYSIS_RESULT_MODES,
  COMBINED_MODE,
  edgeRows,
  nodeRows,
  resultTree,
  type ResultMode,
} from '@/screens/07-thermal-network/resultViewModel';

import { LeverTable } from './LeverTable';
import { MarginDeck } from './MarginDeck';
import { REDUCTION_MAX, SegmentTuner } from './SegmentTuner';
import { StudyTable } from './StudyTable';
import { num } from './analysisViewModel';

/**
 * How many parts the deck offers.
 *
 * There is no matching cap on the segments: the tuner lists the component's
 * WHOLE chain, junction to ambient, however many links that is. A top-three cut
 * answered "where is the biggest drop" but hid the rest of the path, and the
 * rest of the path is what the reader is deciding against — a 0.4 °C segment
 * you can actually buy beats a 9 °C one you cannot.
 */
const DECK_SIZE = 3;

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
const GRAPH_DISPLAY = {
  showLabels: true,
  showPower: true,
  showLimits: true,
  showBoundary: true,
};

function Section({
  index,
  title,
  zh,
  actions,
  className = '',
  bodyClassName = 'overflow-auto p-3',
  children,
}: {
  index: number;
  title: string;
  zh: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
          {index}
        </span>
        <h2 className="min-w-0 truncate text-[13px] font-bold text-ink-900">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </h2>
        {actions && <span className="ml-auto flex shrink-0 items-center gap-2">{actions}</span>}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[26rem] w-full" />
    </div>
  );
}

export function BottleneckAnalysisView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const network = useNetworkStore((s) => s.network);
  const components = useComponentStore((s) => s.components);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const solverState = useSolverStore((s) => s.state);

  const solutions = useSolutionStore((s) => s.solutions);
  const solutionKey = useSolutionStore((s) => s.activeKey);
  const solveInput = useSolutionStore((s) => s.input);
  const studies = useAnalysisStore((s) => s.proposals);

  const [rankIndex, setRankIndex] = useState(0);
  const [reductions, setReductions] = useState<Record<string, number>>({});
  /**
   * Node temperature and edge ΔT together, by default.
   *
   * On 08 they are one question — which link costs this part its margin — so
   * they are one view. The input-only modes 07 offers (Node Type, Rth Source)
   * say how the model was built, which is 04/05/06's question, not this one.
   */
  const [mode, setMode] = useState<ResultMode>(COMBINED_MODE.id);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<'levers' | 'studies'>('levers');
  /** The lower panel as a window the reader can put over the graph. */
  const [bottomFloating, setBottomFloating] = useState(false);
  /**
   * Which saved study the sliders are currently editing, if any.
   *
   * `null` is a fresh draft: Add creates a record, Save has nothing to write
   * over. Once a record exists — because Add made it, or because a row in the
   * table was opened — the pair swap: Save overwrites THAT record and Add is
   * out, because "add" on a study already saved would silently fork it.
   */
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  /** 08 — the focused chain answers the question; the whole machine gives it context. */
  const [wholeMachine, setWholeMachine] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /**
   * Whether the selection was made ON the graph.
   *
   * The deck and the whole-machine switch also select a node — that is how the
   * part stays marked among 113 of them — but only a tap on the graph is a
   * request to READ that node, so only a tap opens the inspector. Picking a
   * rank threw a detail panel over the screen nobody asked for.
   */
  const [inspecting, setInspecting] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const graphRef = useRef<SolvedGraphHandle | null>(null);

  const solution = solutionKey ? (solutions[solutionKey] ?? null) : null;
  const scenario = scenarios.find((entry) => entry.id === activeScenarioId) ?? null;

  useEffect(() => {
    if (!projectId) return;
    const projectStore = useProjectStore.getState();
    projectStore.refreshProjects();
    if (projectStore.draft?.project_id !== projectId) {
      projectStore.openProject(projectId);
      useSolverStore.getState().reset();
    }
    useScenarioStore.getState().loadFor(projectId);
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
    const scenarioId = useScenarioStore.getState().activeScenarioId;
    useBoundaryStore.getState().loadFor(projectId, scenarioId);
    useSolutionStore.getState().loadFor(projectId, scenarioId);
    useAnalysisStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    useAnalysisStore.getState().loadFor(projectId, activeScenarioId);
    setRankIndex(0);
    setReductions({});
  }, [projectId, activeScenarioId]);

  const boundarySets = useBoundaryStore((s) => s.sets);
  const boundaryKey = useBoundaryStore((s) => s.activeKey);
  const boundaryPorts = useBoundaryStore((s) => s.ports);
  const solutionStale = useSolutionStore((s) => s.isStale());
  const solverSettings = network?.solver_settings ?? DEFAULT_SOLVER_SETTINGS;
  const scenarioId = activeScenarioId ?? '';

  /**
   * The network every number on this screen is computed from.
   *
   * It is Screen 07's SOLVE-READY network — the one carrying the scenario's
   * boundary resistances and the finite-Bi spreading refinement — with the
   * component limits projected onto it. Reading limits off the stored graph and
   * temperatures off the solve-ready one is how the two disagree.
   */
  const solveGraph = useMemo(() => {
    const base = solveInput?.network ?? network;
    if (!base) return null;
    return components.length > 0 ? projectComponentLimits(base, components) : base;
  }, [solveInput, network, components]);

  /**
   * The baseline IS Screen 07's result. Not a re-solve of it, not a variant of
   * it — the temperatures that screen is showing.
   *
   * That is the only defensible answer to "why do the two screens disagree",
   * and it now holds by construction: `checkScenario` applies the finite-Bi
   * refinement, so the solve input the store hands over is the network the
   * stored solution came from, whichever door the store came in by. The guard
   * below is the belt to that braces — cheap, and it fails loudly instead of
   * quietly producing different numbers than the screen before it.
   */
  const baselineTemperatures = solution?.node_temperatures_C ?? null;

  const drift = useMemo(() => {
    if (!solveGraph || !scenarioId || !baselineTemperatures) return null;
    const again = solveNetwork(solveGraph, {
      scenarioId,
      powerScale: 1,
      settings: solverSettings,
    });
    if (!again.ok) return null;
    let worst: { node_id: string; delta_C: number } | null = null;
    for (const [id, value] of Object.entries(baselineTemperatures)) {
      const other = again.temperatures[id];
      if (!Number.isFinite(value) || !Number.isFinite(other)) continue;
      const delta = Math.abs(value - other);
      if (!worst || delta > worst.delta_C) worst = { node_id: id, delta_C: delta };
    }
    return worst && worst.delta_C > 0.05 ? worst : null;
  }, [solveGraph, scenarioId, solverSettings, baselineTemperatures]);

  const ranked = useMemo(
    () =>
      solveGraph && baselineTemperatures
        ? marginRanking(solveGraph, baselineTemperatures, DECK_SIZE)
        : [],
    [solveGraph, baselineTemperatures],
  );
  const target = ranked[Math.min(rankIndex, Math.max(ranked.length - 1, 0))] ?? null;

  /** The focused part's own nodes, and everything its heat passes through. */
  const focus = useMemo(() => {
    if (!solveGraph || !target) return null;
    const path = graphPaths(solveGraph).find((entry) => entry.nodeIds.includes(target.node_id));
    if (!path) return null;
    const hidden = focusHiddenNodes(solveGraph, path);
    const visible = new Set(Object.keys(solveGraph.nodes).filter((id) => !hidden.has(id)));
    const componentName =
      components.find((entry) => entry.id === path.componentId)?.name ?? path.componentId;
    return {
      path,
      hidden,
      visible,
      own: new Set(path.nodeIds),
      labels: focusLabels(solveGraph, path, componentName),
    };
  }, [solveGraph, target, components]);

  const segments = useMemo(() => {
    if (!solveGraph || !solution || !focus) return [];
    return chainSegments(solveGraph, solution, focus.visible, focus.own);
  }, [solveGraph, solution, focus]);

  /**
   * Picking a part is a request to see that part.
   *
   * Leaving the graph on the whole machine made 1 / 2 / 3 look dead: the deck,
   * the margin tile and the segment list all changed and the one thing the
   * reader was looking at did not. Selecting the node as well means the switch
   * back to the whole machine still says where the part is.
   */
  const showWholeMachine = (next: boolean) => {
    setWholeMachine(next);
    // Going wide without a mark loses the part among 113 nodes; the selection
    // is what carries "this is the one you were looking at" across the switch.
    // It marks, it does not open: `inspecting` stays false.
    if (next && target) {
      setSelectedNodeId(target.node_id);
      setInspecting(false);
    }
  };

  const selectRank = (index: number) => {
    setRankIndex(index);
    setWholeMachine(false);
    setSelectedNodeId(ranked[index]?.node_id ?? null);
    setSelectedEdgeId(null);
    setInspecting(false);
  };

  // A new part starts from its solved state, never from the last part's cuts —
  // and never still attached to the record the last part was editing.
  useEffect(() => {
    setReductions({});
    setEditingStudyId(null);
  }, [target?.node_id]);

  const adjustments: Adjustment[] = useMemo(
    () =>
      segments
        .map((segment) => ({
          edge_id: segment.edge_id,
          reduction_pct: reductions[segment.edge_id] ?? 0,
        }))
        .filter((entry) => entry.reduction_pct > 0),
    [segments, reductions],
  );

  const whatIf = useMemo(() => {
    if (!solveGraph || !scenarioId || adjustments.length === 0) return null;
    return solveWithAdjustments(solveGraph, scenarioId, solverSettings, adjustments);
  }, [solveGraph, scenarioId, solverSettings, adjustments]);

  const projected = useMemo(() => {
    if (!target || !whatIf?.ok) return null;
    const temperature = whatIf.temperatures[target.node_id];
    if (!Number.isFinite(temperature)) return null;
    return { temperature_C: temperature, margin_C: target.limit_C - temperature };
  }, [target, whatIf]);

  /** What each segment would buy on its own — the "where do I spend effort" number. */
  const soloGains = useMemo(() => {
    const gains: Record<string, number> = {};
    if (!solveGraph || !scenarioId || !target || !baselineTemperatures) return gains;
    for (const segment of segments) {
      const pct = reductions[segment.edge_id] ?? 0;
      if (pct <= 0) {
        gains[segment.edge_id] = 0;
        continue;
      }
      const solo = solveWithAdjustments(solveGraph, scenarioId, solverSettings, [
        { edge_id: segment.edge_id, reduction_pct: pct },
      ]);
      gains[segment.edge_id] = solo.ok
        ? baselineTemperatures[target.node_id] - solo.temperatures[target.node_id]
        : 0;
    }
    return gains;
  }, [solveGraph, scenarioId, solverSettings, segments, reductions, target, baselineTemperatures]);

  /**
   * The segments the tuner is offering, marked on the graph.
   *
   * Same numbering as the list beside it — 1 is the biggest drop — so "row 2"
   * and "the badge with a 2 on it" are the same thing, and the one being cut
   * right now is the one that glows. Without it the reader moves a slider in a
   * column and has to work out, from four almost identical labels, which line
   * on the picture they just changed.
   */
  const tunedEdges = useMemo(() => {
    const marks = new Map<string, { rank: number; active: boolean }>();
    segments.forEach((segment, index) => {
      marks.set(segment.edge_id, {
        rank: index + 1,
        active: (reductions[segment.edge_id] ?? 0) > 0,
      });
    });
    return marks;
  }, [segments, reductions]);

  /** The graph paints the what-if while one is live, and the baseline otherwise. */
  const graphSolution = useMemo(() => {
    if (!solution) return null;
    return whatIf?.ok ? solutionWithWhatIf(solution, whatIf) : solution;
  }, [solution, whatIf]);

  /**
   * Whether the sliders say something the stored record does not.
   *
   * On a fresh draft that is "any cut at all". On a record being edited it is
   * a comparison against what was saved — otherwise Save would stay lit after
   * writing, and a button that is enabled when it has nothing to do teaches the
   * reader to ignore it.
   */
  const editing = studies.find((entry) => entry.id === editingStudyId) ?? null;
  const dirty = useMemo(() => {
    const cuts = Object.entries(reductions).filter(([, pct]) => pct > 0);
    if (!editing) return cuts.length > 0;
    const saved = new Map(editing.segments.map((entry) => [entry.edge_id, entry.reduction_pct]));
    if (saved.size !== cuts.length) return true;
    return cuts.some(([edgeId, pct]) => saved.get(edgeId) !== pct);
  }, [reductions, editing]);

  /**
   * The full result table, built exactly as Screen 07 builds it — same
   * `nodeRows` / `edgeRows` / `resultTree`, off the same solve-ready network.
   *
   * It reads the solution the GRAPH is showing, so with a what-if live the
   * table and the picture agree; the graph's own banner is what says the
   * numbers are an assumption.
   */
  const ambient =
    (boundaryKey ? boundarySets[boundaryKey]?.ambient.external_ambient_C : null) ??
    scenario?.ambient_C ??
    null;
  const tableRows = useMemo(
    () =>
      solveGraph
        ? nodeRows(solveGraph, graphSolution, {
            ambient_C: ambient,
            powerScale: scenario?.power_scale ?? 1,
          })
        : [],
    [solveGraph, graphSolution, ambient, scenario?.power_scale],
  );
  const tableFlows = useMemo(
    () => (solveGraph ? edgeRows(solveGraph, graphSolution) : []),
    [solveGraph, graphSolution],
  );
  const tableTree = useMemo(
    () => (solveGraph ? resultTree(solveGraph, graphSolution, tableRows, components) : []),
    [solveGraph, graphSolution, tableRows, components],
  );

  const selectedNode = selectedNodeId ? (solveGraph?.nodes[selectedNodeId] ?? null) : null;
  const selectedEdge = selectedEdgeId ? (solveGraph?.edges[selectedEdgeId] ?? null) : null;

  /**
   * For every segment actually cut: what would have to change, and to what.
   *
   * Screen 06's own inputs come with it, because a boundary edge and the
   * fin-root link have no parameters of their own — their resistance is the fin
   * geometry's, and naming that geometry is the only useful thing to say about
   * them.
   */
  const boundaryContext = useMemo(
    () => ({ ports: boundaryPorts, set: boundaryKey ? (boundarySets[boundaryKey] ?? null) : null }),
    [boundaryPorts, boundaryKey, boundarySets],
  );

  const levers = useMemo(() => {
    if (!solveGraph || !scenarioId) return [];
    return segments
      .filter((segment) => (reductions[segment.edge_id] ?? 0) > 0)
      .map((segment) =>
        segmentLevers(
          solveGraph,
          scenarioId,
          segment.edge_id,
          segment.label,
          reductions[segment.edge_id] ?? 0,
          boundaryContext,
        ),
      );
  }, [solveGraph, scenarioId, segments, reductions, boundaryContext]);

  /**
   * What the target part gets back if ONE row is taken.
   *
   * Every row of a segment reaches the same resistance, so they share a number
   * — except a row that cannot reach it, which gets the gain at the best that
   * input can do on its own. That is the honest figure for it, and it is
   * usually much smaller, which is the point of showing it.
   */
  const coolings = useMemo(() => {
    const table = new Map<string, number | null>();
    if (!solveGraph || !scenarioId || !target || !baselineTemperatures) return table;

    const gainAt = (edgeId: string, pct: number): number | null => {
      const solved = solveWithAdjustments(solveGraph, scenarioId, solverSettings, [
        { edge_id: edgeId, reduction_pct: Math.min(pct, 99.9) },
      ]);
      if (!solved.ok) return null;
      const gain = baselineTemperatures[target.node_id] - solved.temperatures[target.node_id];
      return Number.isFinite(gain) ? gain : null;
    };

    for (const segment of levers) {
      // The rows that reach the target all reach the SAME resistance, so they
      // share one solve rather than paying for one each.
      const full = gainAt(segment.edge_id, segment.reduction_pct);
      // The ratio is against the calculator's own value, which is what a limit
      // is expressed in — not against a refined override that may differ.
      const own = segment.rth_calculated_C_per_W;
      for (const lever of segment.levers) {
        const key = `${segment.edge_id}|${lever.key}`;
        if (lever.limit && own != null && own > 0) {
          // This one cannot reach the segment's target: what it buys is what
          // its own ceiling or turning point buys, which is smaller.
          table.set(key, gainAt(segment.edge_id, (1 - lever.limit.best_rth_C_per_W / own) * 100));
        } else {
          // Everything else — an exact target, and a Screen 06 dimension with a
          // direction but no number — is a route to the SAME resistance, so it
          // is the same °C. The row that has no target still gets one, because
          // "how much is this segment worth" is the question being asked.
          table.set(key, full);
        }
      }
    }
    return table;
  }, [levers, solveGraph, scenarioId, solverSettings, target, baselineTemperatures]);

  const coolingOf = (segment: SegmentLevers, lever: Lever): number | null =>
    coolings.get(`${segment.edge_id}|${lever.key}`) ?? null;

  // Fullscreen leaves the same way every overlay on this tool does, and the
  // graph is re-fitted after the box changes size rather than keeping a zoom
  // computed for the old one.
  useEffect(() => {
    if (!graphFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGraphFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [graphFullscreen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => graphRef.current?.fit());
    return () => cancelAnimationFrame(frame);
  }, [graphFullscreen]);

  /**
   * Write the sliders out — as a new record, or over the one being edited.
   *
   * `saveStudy` in the store replaces by id, so keeping the id IS the
   * overwrite; a new id is a new row. That is the whole difference between the
   * two buttons.
   */
  const commitStudy = (mode: 'add' | 'overwrite') => {
    if (!projectId || !target || !projected || !scenarioId) return;
    const studySegments: StudySegment[] = segments
      .filter((segment) => (reductions[segment.edge_id] ?? 0) > 0)
      .map((segment) => {
        const pct = reductions[segment.edge_id] ?? 0;
        return {
          edge_id: segment.edge_id,
          label: segment.label,
          edge_type: segment.edge_type,
          reduction_pct: pct,
          rth_before_C_per_W: segment.rth_C_per_W,
          rth_after_C_per_W: segment.rth_C_per_W * (1 - pct / 100),
          solo_gain_C: soloGains[segment.edge_id] ?? 0,
        };
      });

    const id =
      mode === 'overwrite' && editingStudyId
        ? editingStudyId
        : `STUDY_${scenarioId}_${target.node_id}_${Date.now()}`;

    const study: ImprovementStudy = {
      id,
      schema_version: ANALYSIS_SCHEMA_VERSION,
      project_id: projectId,
      scenario_id: scenarioId,
      target_node_id: target.node_id,
      target_node_name: target.name,
      limit_C: target.limit_C,
      limit_type: target.limit_type,
      baseline: { temperature_C: target.temperature_C, margin_C: target.margin_C },
      projected,
      segments: studySegments,
      // A record keeps the time it was FIRST written; overwriting is an edit of
      // that study, not a different one.
      created_at: editing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      applied: false,
    };

    useAnalysisStore.getState().saveStudy(projectId, study);
    setEditingStudyId(id);
    // Saving is the moment the reader asks "so what do I actually change?", so
    // that is the panel they are left looking at.
    setBottomTab('levers');
    toast.success(
      mode === 'add'
        ? 'Study added — no resistance was changed / 已新增，未修改任何熱阻'
        : 'Study updated — no resistance was changed / 已覆蓋，未修改任何熱阻',
    );
  };

  /** Opening a row is entering it for editing, not copying it into a draft. */
  const loadStudy = (study: ImprovementStudy) => {
    const position = ranked.findIndex((entry) => entry.node_id === study.target_node_id);
    if (position >= 0) setRankIndex(position);
    setReductions(
      Object.fromEntries(study.segments.map((entry) => [entry.edge_id, entry.reduction_pct])),
    );
    // After the rank change, which resets the reductions on its own effect.
    setTimeout(() => {
      setReductions(
        Object.fromEntries(study.segments.map((entry) => [entry.edge_id, entry.reduction_pct])),
      );
      setEditingStudyId(study.id);
    }, 0);
  };

  // --- guards --------------------------------------------------------------

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load the analysis.</h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入瓶頸分析。</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
            Return to Project Info
          </Button>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft) return <LoadingState />;

  const hasTopology = Boolean(network && Object.keys(network.nodes).length > 0);

  // 08 §7 — without a valid Screen 07 solution there is nothing to improve.
  if (
    !hasTopology ||
    !network ||
    !solution ||
    !solveGraph ||
    !baselineTemperatures ||
    solutionStale ||
    solution.status === 'FAILED'
  ) {
    return (
      <ScreenWorkspace
        title="Bottleneck Analysis"
        titleZh="瓶頸分析"
        descriptionZh="從離規格最近的元件出發，看它的熱路徑上哪一段最值得改善。"
      >
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <p className="text-[14px] font-semibold text-ink-700">
              {!hasTopology
                ? 'No thermal network found.'
                : !solution
                  ? 'This scenario has no Screen 07 solution yet.'
                  : solutionStale
                    ? 'The Screen 07 solution is stale. Re-solve before analysing it.'
                    : 'The Screen 07 solve failed. Fix it before analysing.'}
            </p>
            <p className="mt-1 text-[12px] text-ink-400">
              {!hasTopology ? '找不到熱網路，請先完成 05。' : '瓶頸分析需要 07 有效且未失效的解。'}
            </p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() =>
                navigate(projectPath(projectId, hasTopology ? 'network' : 'thermal-path'))
              }
            >
              {hasTopology ? 'Open 07 Thermal Network / 前往 07' : 'Open 05 / 前往 05'}
            </Button>
          </div>
        </div>
      </ScreenWorkspace>
    );
  }

  const gain = projected && target ? projected.margin_C - target.margin_C : 0;

  // The lower panel's header, tabs, body and pop-out control, shared by the
  // docked pane and the floating window so the two cannot drift apart.
  const lowerHeader = (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
        3
      </span>
      <h2 className="min-w-0 truncate text-[13px] font-bold text-ink-900">
        {bottomTab === 'levers' ? 'What To Change' : 'Saved Studies'}{' '}
        <span className="font-semibold text-ink-400">
          / {bottomTab === 'levers' ? '可調整的參數' : '已儲存的調整分析'}
        </span>
      </h2>
    </>
  );

  const lowerTabs = (
    <span className="flex shrink-0 overflow-hidden rounded-md border border-line-strong">
      {[
        { id: 'levers' as const, label: 'What to change', zh: '可調參數', count: levers.length },
        { id: 'studies' as const, label: 'Saved', zh: '已儲存', count: studies.length },
      ].map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-pressed={bottomTab === entry.id}
          title={biTitle(entry.label, entry.zh)}
          onClick={() => setBottomTab(entry.id)}
          className={`flex items-center gap-1 whitespace-nowrap px-2.5 py-1 text-[11px] leading-none font-semibold transition-colors ${
            bottomTab === entry.id
              ? 'bg-accent-600 text-white'
              : 'bg-surface text-ink-500 hover:bg-surface-muted hover:text-ink-900'
          }`}
        >
          {entry.label}
          <span
            className={`rounded px-1 text-[10px] tabular ${
              bottomTab === entry.id ? 'bg-white/20' : 'bg-surface-muted'
            }`}
          >
            {entry.count}
          </span>
        </button>
      ))}
    </span>
  );

  const popOutButton = (
    <button
      type="button"
      aria-pressed={bottomFloating}
      title={biTitle(
        bottomFloating ? 'Dock it back into the column' : 'Open as a floating window',
        bottomFloating ? '收回原本的區域' : '改為浮動視窗',
      )}
      onClick={() => setBottomFloating((value) => !value)}
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-500 hover:bg-surface-muted hover:text-ink-900"
    >
      <PictureInPicture2 size={13} />
    </button>
  );

  const lowerBody =
    bottomTab === 'levers' ? (
      <LeverTable segments={levers} projectId={projectId} gainOf={coolingOf} />
    ) : (
      <StudyTable
        studies={studies}
        readOnly={readOnly}
        editingId={editingStudyId}
        onSelect={loadStudy}
        onDelete={(id) => useAnalysisStore.getState().deleteStudy(projectId, id)}
      />
    );

  return (
    <ScreenWorkspace
      title="Bottleneck Analysis"
      titleZh="瓶頸分析"
      descriptionZh="從離規格最近的元件出發，在它的熱路徑上調整最值得改善的區段，即時看餘裕變化。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          <Badge tone={solverState === 'SOLVED' ? 'ok' : 'warn'}>Solver {solverState}</Badge>
          {scenario && <Badge tone="neutral">{scenario.name}</Badge>}
        </div>
      }
      metrics={
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <MarginDeck ranked={ranked} index={rankIndex} onSelect={selectRank} />
          <KpiTile
            icon={<span className="text-[10px] font-bold">°C</span>}
            label="Margin Now"
            zh="目前餘裕"
            tooltip="Limit − Temperature，來自 07 的解。"
            value={target ? num(target.margin_C, 1, '°C') : 'N/A'}
            status={
              target
                ? `${num(target.temperature_C, 1)} / ${target.limit_C} °C ${target.limit_type ?? ''}`
                : undefined
            }
            tone={
              !target
                ? 'text-ink-900'
                : target.margin_C < 0
                  ? 'text-danger-600'
                  : target.margin_C < 10
                    ? 'text-warn-600'
                    : 'text-ok-600'
            }
          />
          <KpiTile
            icon={<ArrowRight size={13} />}
            label="Margin If Adjusted"
            zh="調整後餘裕"
            tooltip="以目前的調整重新求解整張網路後，此元件剩下的餘裕。"
            value={projected ? num(projected.margin_C, 1, '°C') : '—'}
            status={
              projected
                ? `${gain >= 0 ? '+' : ''}${gain.toFixed(1)} °C gained / 改善`
                : 'move a segment / 調整區段後顯示'
            }
            tone={projected ? 'text-ok-600' : 'text-ink-400'}
          />
          <KpiTile
            icon={<span className="text-[10px] font-bold">#</span>}
            label="Saved Studies"
            zh="已儲存分析"
            tooltip="此情境已儲存的假設調整紀錄；不會修改任何熱阻。"
            value={String(studies.length)}
            status="assumptions only / 僅為假設"
          />
        </div>
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={biTitle('Back to 07 Thermal Network', '返回 07')}
            onClick={() => navigate(projectPath(projectId, 'network'))}
          >
            Back to Thermal Network
          </Button>
          <span className="text-[11px] text-ink-400">
            {ranked.length} part(s) ranked by margin · {segments.length} segment(s) on this
            part's whole chain · adjustments are assumptions, never written to the model
          </span>
          <Button
            variant="primary"
            className="ml-auto"
            icon={<ArrowRight size={15} />}
            title={biTitle('Continue to 09', '前往 09')}
            onClick={() => navigate(projectPath(projectId, 'temperature'))}
          >
            Continue to Temperature Distribution
          </Button>
        </div>
      }
    >
      {drift && (
        <p className="mb-3 rounded-md border border-warn-500/40 bg-warn-100 px-3 py-2 text-[11px] leading-relaxed font-semibold text-warn-600">
          Screen 07's stored solution and a re-solve of its own inputs differ by{' '}
          {drift.delta_C.toFixed(1)} °C at {drift.node_id}. Re-solve Screen 07 so both screens
          show the same baseline.
          <span className="block font-normal text-ink-500">
            07 的既有解與「以其輸入重新求解」在 {drift.node_id} 相差 {drift.delta_C.toFixed(1)}{' '}
            °C，請回 07 重新求解，兩畫面才會一致。
          </span>
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Section
            index={1}
            title={
              wholeMachine
                ? 'Thermal Network — whole machine'
                : target
                  ? `Heat Path — ${target.name}`
                  : 'Heat Path'
            }
            zh={wholeMachine ? '整機熱網路' : '此元件的熱路徑'}
            className={
              graphFullscreen
                ? 'fixed inset-3 z-30 shadow-2xl'
                : 'min-h-[22rem] flex-1'
            }
            /**
             * `overflow-hidden`, and the canvas pinned to this box rather than
             * sized by a percentage of it. Both matter.
             *
             * Cytoscape sets its layers to the container's client box in whole
             * pixels. Inside an `overflow-auto` parent that is a loop: on a
             * display where the box is a fractional height — Windows at 125 %,
             * say — the layers round past it, a scrollbar appears, the
             * scrollbar takes ~15 px back off the box, `h-full` shrinks, and
             * cytoscape's own debounced observer resizes the layers 100 ms
             * later, which removes the scrollbar and starts it again. The graph
             * paints on the one frame the two agree and is blank on the rest —
             * exactly the "appears for half a second then goes" this screen
             * showed while Screen 07, whose host is a plain flex child, never
             * did. A graph pans and zooms; it must never scroll.
             */
            bodyClassName="relative overflow-hidden p-0"
            actions={
              <>
                <span className="flex h-7 shrink-0 overflow-hidden rounded-md border border-line-strong">
                  {[
                    { id: false, label: 'This Part', zh: '此元件', icon: <Crosshair size={12} /> },
                    { id: true, label: 'Whole Machine', zh: '整機', icon: <Network size={12} /> },
                  ].map((entry) => (
                    <button
                      key={String(entry.id)}
                      type="button"
                      aria-pressed={wholeMachine === entry.id}
                      title={biTitle(entry.label, entry.zh)}
                      onClick={() => showWholeMachine(entry.id)}
                      className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 text-[11px] leading-none font-semibold transition-colors ${
                        wholeMachine === entry.id
                          ? 'bg-accent-600 text-white'
                          : 'bg-surface text-ink-500 hover:bg-surface-muted hover:text-ink-900'
                      }`}
                    >
                      {entry.icon}
                      {entry.label}
                    </button>
                  ))}
                </span>
                <Select
                  className="h-7 !text-[11px]"
                  value={mode}
                  items={ANALYSIS_RESULT_MODES.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                  }))}
                  onChange={(event) => setMode(event.target.value as ResultMode)}
                />
                {/* Screen 07's own result table, on 07's own numbers. 08 is
                    where the reader decides; the full table is what they check
                    the decision against, and sending them back to 07 to read it
                    loses the part they had selected. */}
                <button
                  type="button"
                  onClick={() => setResultsOpen(true)}
                  aria-label="Results / 求解結果"
                  title={biTitle('Open the full result table', '開啟完整求解結果')}
                  className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-orange-600 px-2 text-[11px] font-bold text-white shadow-sm ring-1 ring-orange-700/40 transition-colors hover:bg-orange-500"
                >
                  <Table2 size={13} />
                  <span>Results</span>
                  <span className="rounded bg-white/20 px-1 text-[10px] font-semibold tabular">
                    {tableRows.length} · {tableFlows.length}
                  </span>
                </button>
                <button
                  type="button"
                  title={biTitle(
                    graphFullscreen ? 'Leave fullscreen (Esc)' : 'Fullscreen',
                    graphFullscreen ? '離開全螢幕（Esc）' : '全螢幕',
                  )}
                  aria-label={biTitle('Fullscreen', '全螢幕')}
                  aria-pressed={graphFullscreen}
                  onClick={() => setGraphFullscreen((value) => !value)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-500 hover:bg-surface-muted"
                >
                  {graphFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              </>
            }
          >
            <div className="absolute inset-0">
              <SolvedGraphCanvas
                ref={graphRef}
                network={solveGraph}
                solution={graphSolution}
                mode={mode}
                tunedEdges={wholeMachine ? undefined : tunedEdges}
                display={GRAPH_DISPLAY}
                scenarioId={scenarioId}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                tool="select"
                layoutMode="Auto"
                hiddenComponentIds={EMPTY_SET}
                extraHiddenNodeIds={wholeMachine ? EMPTY_SET : (focus?.hidden ?? EMPTY_SET)}
                focusKey={wholeMachine ? undefined : focus?.path.key}
                nodeLabelOverrides={wholeMachine ? undefined : focus?.labels}
                /*
                   Only a tap that LANDS on something opens the inspector.

                   The canvas reports a node tap as "this node, and no edge", so
                   a handler that also cleared the flag on a null id turned it
                   straight back off — the panel opened and closed inside one
                   click. Clearing is the panel's own job: it is gated on there
                   being a selection at all, and a tap on the background sends
                   null to both.
                */
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  if (nodeId) setInspecting(true);
                }}
                onSelectEdge={(edgeId) => {
                  setSelectedEdgeId(edgeId);
                  if (edgeId) setInspecting(true);
                }}
                onZoomChange={() => undefined}
              />
              {whatIf?.ok && (
                <p className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-md border border-orange-500/40 bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 shadow-sm">
                  Showing the adjusted network — nothing is written to the model
                  <span className="ml-1 font-normal text-ink-500">
                    / 顯示調整後結果，未寫回模型
                  </span>
                </p>
              )}
            </div>
          </Section>

          {/* Two answers to one question, so they share a box rather than each
              taking a slice of the graph's height: what would have to change to
              get the cut being asked for, and what has been asked for before.

              Sized by the reader, not by me. A lever table with four segments
              on it needs several times the height of an empty one, and how much
              of the graph that is worth is their call — so it is Screen 07's
              own seam: drag it to any height, click it to fold, and the choice
              is remembered per project.

              Or taken out of the column entirely. Six fin dimensions across
              five columns want more width than the space under a graph, and the
              graph wants its height back while they are being read — so the
              same panel opens as a window that floats over both, remembers its
              own geometry, and goes back where it came from on a second
              press. */}
          {bottomFloating ? (
            <section className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface px-3.5 py-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
                3
              </span>
              <span className="min-w-0 truncate text-[12px] text-ink-500">
                {bottomTab === 'levers' ? 'What To Change' : 'Saved Studies'} is open as a window
                <span className="ml-1 text-ink-400">
                  / {bottomTab === 'levers' ? '可調整的參數' : '已儲存的調整分析'}目前為浮動視窗
                </span>
              </span>
              <Button
                className="ml-auto h-7 !text-[11px]"
                icon={<PictureInPicture2 size={13} />}
                title={biTitle('Dock it back into the column', '收回原本的區域')}
                onClick={() => setBottomFloating(false)}
              >
                Dock / 收回
              </Button>
            </section>
          ) : (
            <ResizablePane
              id="tnv.08.lowerPane"
              defaultHeight={220}
              labelEn={bottomTab === 'levers' ? 'What To Change' : 'Saved Studies'}
              labelZh={bottomTab === 'levers' ? '可調整的參數' : '已儲存的調整分析'}
              header={lowerHeader}
              actions={
                <>
                  {lowerTabs}
                  {popOutButton}
                </>
              }
            >
              <div className="px-3 py-2">{lowerBody}</div>
            </ResizablePane>
          )}
        </div>

        {/* The chain is a column the reader sizes: four segments of a TIM
            stack and nine of a heat pipe want different widths, and the graph
            beside it is what pays either way. Same seam as 05 and 06. */}
        <ResizableSidebar
          id="tnv.08.chain"
          side="right"
          defaultWidth={368}
          labelEn="the resistance chain"
          labelZh="整條熱阻鏈路"
          shortEn="Chain"
          shortZh="鏈路"
        >
          <Section
            index={2}
            title="Resistance Chain"
            zh="整條熱阻鏈路"
            className="h-full min-h-[26rem]"
            actions={
              <span className="shrink-0 whitespace-nowrap text-[10px] text-ink-400">
                {segments.length} seg · 0.1 %
              </span>
            }
          >
            {target ? (
              <SegmentTuner
                target={target}
                segments={segments}
                reductions={reductions}
                soloGains={soloGains}
                projected={projected}
                readOnly={readOnly}
                dirty={dirty}
                onReduction={(edgeId, pct) =>
                  setReductions((current) => ({
                    ...current,
                    [edgeId]: Math.min(
                      REDUCTION_MAX,
                      Math.max(0, Number.isFinite(pct) ? pct : 0),
                    ),
                  }))
                }
                onReset={() =>
                  setReductions(
                    editing
                      ? Object.fromEntries(
                          editing.segments.map((entry) => [entry.edge_id, entry.reduction_pct]),
                        )
                      : {},
                  )
                }
                onExit={() => {
                  setEditingStudyId(null);
                  setReductions({});
                }}
                editingName={editing?.target_node_name ?? null}
                onAdd={() => commitStudy('add')}
                onSave={() => commitStudy('overwrite')}
              />
            ) : (
              <p className="py-6 text-center text-[11px] text-ink-400">
                No part in this network carries a temperature limit.
                <span className="block">此網路沒有任何元件設定溫度上限。</span>
              </p>
            )}
          </Section>
        </ResizableSidebar>
      </div>

      {/* The lower panel, as a window. `FloatingPanel` remembers its own
          geometry per storage key, so the size the reader drags it to is the
          size it opens at next time — which is the point of taking it out of a
          column whose height it has to share. */}
      {bottomFloating && (
        <FloatingPanel
          storageKey="tnv.08.lowerWindow"
          defaultWidth={860}
          defaultHeight={520}
          title={bottomTab === 'levers' ? 'What To Change' : 'Saved Studies'}
          subtitle={bottomTab === 'levers' ? '可調整的參數' : '已儲存的調整分析'}
          badge={lowerTabs}
          actions={popOutButton}
          bodyClassName="p-3"
          onClose={() => setBottomFloating(false)}
        >
          {lowerBody}
        </FloatingPanel>
      )}

      {resultsOpen && (
        <ResultsOverlay
          groups={tableTree}
          hasSolution={Boolean(graphSolution)}
          nodeCount={tableRows.length}
          edgeCount={tableFlows.length}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={(nodeId) => {
            setSelectedEdgeId(null);
            setSelectedNodeId(nodeId);
            setInspecting(true);
            graphRef.current?.center(nodeId);
          }}
          onSelectEdge={(edgeId) => {
            setSelectedNodeId(null);
            setSelectedEdgeId(edgeId);
            setInspecting(true);
            graphRef.current?.center(edgeId);
          }}
          // 08 argues about a design; exporting the table is 07's and 12's job.
          onExportPdf={() => undefined}
          exporting={false}
          onClose={() => setResultsOpen(false)}
        />
      )}

      {/* The same inspector Screen 07 opens, on the same components. A node or
          an edge on this graph is the same object it is over there, and the
          reader tuning a segment is exactly the reader who needs to see where
          its resistance came from. */}
      {inspecting && (selectedNode || selectedEdge) && solveGraph && (
        <FloatingPanel
          storageKey="tnv.08.inspector"
          defaultWidth={460}
          defaultHeight={620}
          title={selectedEdge ? selectedEdge.id : (selectedNode?.name ?? '')}
          subtitle={
            selectedEdge
              ? `${solveGraph.nodes[selectedEdge.from]?.name ?? selectedEdge.from} → ${
                  solveGraph.nodes[selectedEdge.to]?.name ?? selectedEdge.to
                }`
              : (selectedNode?.id ?? '')
          }
          badge={<Badge tone="neutral">{selectedEdge ? 'Edge / 連線' : 'Node / 節點'}</Badge>}
          onClose={() => {
            setInspecting(false);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
        >
          <div className="p-3">
            {selectedEdge ? (
              <EdgeResultInspector
                edge={selectedEdge}
                network={solveGraph}
                solution={graphSolution}
                stale={false}
                scenarioId={scenarioId}
                onSelectNode={(nodeId) => {
                  setSelectedEdgeId(null);
                  setSelectedNodeId(nodeId);
                }}
              />
            ) : selectedNode ? (
              <NodeResultInspector
                node={selectedNode}
                network={solveGraph}
                solution={graphSolution}
                stale={false}
                scenarioName={scenario?.name ?? ''}
                solverState={solverState}
                onSelectEdge={(edgeId) => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(edgeId);
                }}
              />
            ) : null}
          </div>
        </FloatingPanel>
      )}
    </ScreenWorkspace>
  );
}
