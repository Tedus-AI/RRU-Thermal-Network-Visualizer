/**
 * Screen 05 — Thermal Path Builder.
 * Specification: 05_Thermal_Path_Builder.md.
 *
 * This screen describes HOW HEAT CAN TRAVEL. It does not pretend to know how
 * many watts take each route or what any node ends up at: no solve, no boundary
 * conditions, no invented edge heat flow (05 §22, §45, §64).
 *
 * `networkStore` is the single source of truth; Cytoscape is only a view (05 §46).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleCheck,
  CircleSlash,
  Link2,
  Octagon,
  RotateCcw,
  Share2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useShellActions } from '@/app/shellActions';
import { Badge, Button, Modal, Select, Skeleton, TextInput } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import { FloatingPanel } from '@/ui/FloatingPanel';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';

import { powerWOf, type Component } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { createRth } from '@/thermal/rth';
import { networkKpis, type GraphIssue } from '@/thermal/graph/graphValidation';
import { refreshHskBaseConnectionEdges } from '@/thermal/graph/hskBaseConnection';
import {
  buildComponentSubgraph,
  previewGeneration,
  resolvePortTarget,
} from '@/thermal/graph/networkBuilder';
import {
  buildSharedStructure,
  createSpreadingEdge,
  createZoneNode,
  type StructurePreset,
} from '@/thermal/graph/sharedStructure';
import { manualId, structureEdgeId } from '@/thermal/graph/idFactory';
import { NODE_TYPES, type NodeType, type ThermalEdge, type ThermalNode } from '@/thermal/types';

import { BuilderStepper, type BuilderStep } from './BuilderStepper';
import { ComponentPalette, defaultPrefFor, type BuilderPref } from './ComponentPalette';
import { TemplatePalette } from './TemplatePalette';
import {
  SharedStructurePanel,
  type NewSpreadingDraft,
  type NewZoneDraft,
} from './SharedStructurePanel';
import { GraphToolbar, type CanvasTool } from './GraphToolbar';
import { ThermalGraphCanvas, type CanvasHandle, type GraphSelection } from './ThermalGraphCanvas';
import { NodeInspector } from './NodeInspector';
import { EdgeInspector } from './EdgeInspector';
import { NetworkValidationPanel } from './NetworkValidationPanel';
import { EmptyNetworkState, GenerateNetworkPreview } from './GenerateNetworkPreview';
import { LEGEND, type LegendEntry } from '@/ui/graphStyles';

// --- Small building blocks -------------------------------------------------

function KpiCard({
  icon,
  value,
  label,
  zh,
  tone = 'text-ink-900',
  iconTone = 'text-ink-400',
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
  zh: string;
  tone?: string;
  iconTone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-2 py-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink-900">
        <span className={`shrink-0 ${iconTone}`}>{icon}</span>
        <span className="truncate">{label}</span>
        <span className={`ml-auto shrink-0 pl-2 font-bold tabular ${tone}`}>{value}</span>
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-ink-400">{zh}</span>
    </div>
  );
}

function Collapsible({
  title,
  zh,
  open,
  onToggle,
  children,
}: {
  title: string;
  zh: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-line px-3.5 py-2.5 text-left"
      >
        <h3 className="text-[13px] font-bold text-ink-700">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </h3>
        <ChevronDown
          size={15}
          className={`ml-auto text-ink-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="p-3">{children}</div>}
    </section>
  );
}

function LegendSwatch({ entry }: { entry: LegendEntry }) {
  if (entry.kind === 'line') {
    return (
      <span
        aria-hidden
        className="h-0 w-5 shrink-0 border-t-2"
        style={{
          borderTopStyle: entry.style as 'solid',
          // Grey unless the entry names a real line colour on the canvas.
          borderTopColor: entry.color ?? '#64748b',
        }}
      />
    );
  }
  if (entry.kind === 'state') {
    // A ring, not a filled chip: these are painted ON a node of some other
    // colour, so showing them as a fill would imply a node group of their own.
    return (
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-sm"
        style={{ boxShadow: `inset 0 0 0 2.5px ${entry.style}` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-sm border"
      style={{ borderColor: entry.style, background: `${entry.style}33` }}
    />
  );
}

/**
 * Top-left and collapsed by default: the canvas is the work surface, and a
 * permanently open key over one of its corners costs more room than it earns
 * once the vocabulary is familiar.
 */
function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-3 left-3 z-10 w-[11.5rem] rounded-md border border-line bg-surface/95 px-3 py-2.5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-[12px] font-bold text-ink-700"
      >
        Legend / 圖例
        <ChevronDown size={13} className={`ml-auto ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <ul className="mt-2 grid grid-cols-1 gap-1">
          {LEGEND.map((entry) => (
            <li key={entry.label}>
              {entry.section && (
                <p className="mt-1.5 mb-1 text-[10px] font-bold text-ink-400 first:mt-0">
                  {entry.section} / {entry.sectionZh}
                </p>
              )}
              <span className="flex items-center gap-2 whitespace-nowrap text-[11px] text-ink-500">
                <LegendSwatch entry={entry} />
                {entry.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-96 w-80" />
        <Skeleton className="h-96 flex-1" />
      </div>
    </div>
  );
}

// --- Screen ----------------------------------------------------------------

export function ThermalPathBuilderView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<CanvasHandle | null>(null);
  const pendingSourceRef = useRef<string | null>(null);

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());
  // Template links resolve against the project's material constants, so every
  // build path here has to be given them rather than assuming the defaults.
  const materials = useProjectStore((s) => s.draft?.materials) ?? defaultMaterials();

  const components = useComponentStore((s) => s.components);
  const network = useNetworkStore((s) => s.network);
  const validation = useNetworkStore((s) => s.validation);
  const requiresReview = useNetworkStore((s) => s.requiresReview);
  const past = useNetworkStore((s) => s.past);
  const future = useNetworkStore((s) => s.future);
  const solverState = useSolverStore((s) => s.state);

  const [step, setStep] = useState<BuilderStep>('components');
  const [openPanel, setOpenPanel] = useState<Record<string, boolean>>({
    components: true,
    templates: false,
    structure: false,
  });
  const [prefs, setPrefs] = useState<Record<string, BuilderPref>>({});
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selection, setSelection] = useState<GraphSelection>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [layoutMode, setLayoutMode] = useState('Auto');
  const [zoom, setZoom] = useState(1);
  const [showPorts, setShowPorts] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Seeded from the project's own answer (01 §2), so Screen 04's zone list and
  // the structure this screen builds start from the same decision. It stays
  // local state because trying a different shape here should not silently
  // rewrite the project until the engineer applies it.
  const projectStructure = useProjectStore((s) => s.draft?.project_context.base_structure);
  const [structurePreset, setStructurePreset] = useState<StructurePreset>(
    projectStructure ?? 'SINGLE_MAIN_BASE',
  );
  const [showGenerate, setShowGenerate] = useState(false);
  const [rebuildFor, setRebuildFor] = useState<string | null>(null);
  /** Arms the destructive rebuild; the second click is the one that fires. */
  const [confirmEntireRebuild, setConfirmEntireRebuild] = useState(false);
  const [qtyWarning, setQtyWarning] = useState<{
    componentId: string;
    next: BuilderPref;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    kind: 'node' | 'edge';
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [addNodeDraft, setAddNodeDraft] = useState<{
    name: string;
    type: NodeType;
  } | null>(null);
  const [warningConfirm, setWarningConfirm] = useState<number | null>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const leaveFullscreen = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', leaveFullscreen);
    return () => window.removeEventListener('keydown', leaveFullscreen);
  }, [fullscreen]);

  useEffect(() => {
    if (!projectId) return;
    const projectStore = useProjectStore.getState();
    projectStore.refreshProjects();
    if (projectStore.draft?.project_id !== projectId) {
      projectStore.openProject(projectId);
      useScenarioStore.getState().loadFor(projectId);
      useSolverStore.getState().reset();
    }
    useComponentStore.getState().loadFor(projectId);
    useNetworkStore.getState().loadFor(projectId);
  }, [projectId]);

  // Older saved networks may already contain linked HSK-base edges. Refresh
  // their analytical value when the project is opened or Screen 01 changes
  // the shared base inputs; no manual edge override is discarded.
  //
  // Opening the project is what migrates a pre-spreading edge: those were
  // stored as `conduction_LkA` over the contact patch, which the refresh
  // rewrites into `spreading_disc` over the base envelope. A project that never
  // filled the base L and W lands on UNRESOLVED, which is the point — the old
  // number was computed from a base size nobody had stated.
  useEffect(() => {
    if (!draft || draft.project_id !== projectId) return;
    const store = useNetworkStore.getState();
    const current = store.network;
    if (!current || current.project_id !== projectId) return;
    const probe = structuredClone(current);
    if (refreshHskBaseConnectionEdges(probe, materials) === 0) return;
    store.mutate(
      (next) => {
        refreshHskBaseConnectionEdges(next, materials);
      },
      { skipHistory: true },
    );
  }, [
    projectId,
    draft?.project_id,
    materials.hsk_base_k_W_mK.value,
    materials.hsk_base_thickness_mm?.value,
    materials.hsk_base_L_mm?.value,
    materials.hsk_base_W_mm?.value,
  ]);

  // One section at a time, matching the step. Three open panels in a 300 px
  // column is what made this side of the screen feel cramped; the engineer can
  // still open any of them by hand afterwards.
  useEffect(() => {
    setOpenPanel({
      components: step === 'components' || step === 'connections' || step === 'validate',
      templates: step === 'templates',
      structure: step === 'structure',
    });
  }, [step]);

  // Screen 04's preferences seed the builder; the engineer can override them.
  useEffect(() => {
    setPrefs((current) => {
      const next = { ...current };
      let changed = false;
      for (const component of components) {
        if (!next[component.id]) {
          next[component.id] = defaultPrefFor(component);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [components]);

  const handleSave = () => {
    if (!projectId || readOnly) return;
    const positions = canvasRef.current?.positions();
    if (positions && Object.keys(positions).length > 0) {
      useNetworkStore.getState().mutate(
        (net) => {
          net.layout.positions = { ...net.layout.positions, ...positions };
          net.layout.mode = layoutMode;
        },
        { skipHistory: true, skipInvalidate: true },
      );
    }
    useNetworkStore.getState().save(projectId);
    const current = useNetworkStore.getState();
    if (
      current.validation?.errors === 0 &&
      Object.keys(current.network?.templates ?? {}).length >= enabledComponents.length
    ) {
      current.setRequiresReview(false);
    }
    toast.success('Thermal network saved / 熱網路已儲存');
  };

  const setSaveHandler = useShellActions((s) => s.setSaveHandler);
  useEffect(() => {
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, readOnly, layoutMode]);

  const enabledComponents = useMemo(
    () => components.filter((component) => component.enabled),
    [components],
  );

  const modeledIds = useMemo(
    () => new Set(Object.keys(network?.templates ?? {})),
    [network?.templates],
  );

  const kpis = useMemo(
    () =>
      network
        ? networkKpis(network, enabledComponents.length)
        : {
            componentsModeled: 0,
            componentsTotal: enabledComponents.length,
            nodes: 0,
            edges: 0,
            unconnectedPorts: 0,
            unresolvedRth: 0,
          },
    [network, enabledComponents.length],
  );

  const selectedComponent: Component | null =
    components.find((component) => component.id === selectedComponentId) ?? null;
  const selectedPref = selectedComponent
    ? (prefs[selectedComponent.id] ?? defaultPrefFor(selectedComponent))
    : null;

  /**
   * How many of this component's objects "Entire Subgraph" would destroy.
   *
   * Deliberately the same test `replaceComponentSubgraph` deletes by — manual
   * origin, or generated-then-edited — so the number the dialog promises is the
   * number that actually goes.
   */
  const manualObjectsFor = (componentId: string): number => {
    if (!network) return 0;
    const belongs = (origin?: { component_id?: string; kind?: string; modified?: boolean }) =>
      origin?.component_id === componentId && (origin.kind === 'manual' || origin.modified);
    return (
      Object.values(network.nodes).filter((node) => belongs(node.origin)).length +
      Object.values(network.edges).filter((edge) => belongs(edge.origin)).length
    );
  };

  // --- Actions -------------------------------------------------------------

  const applyTemplate = (componentId: string, mode: 'generated_only' | 'entire' | 'new') => {
    const component = components.find((entry) => entry.id === componentId);
    const pref = prefs[componentId];
    if (!component || !pref) return;

    const subgraph = buildComponentSubgraph(component, {
      materials,
      templateId: pref.templateId,
      qtyModel: pref.qtyModel,
      groupCount: pref.groupCount,
    });
    if (!subgraph) {
      toast.error('Template not found / 找不到模板');
      return;
    }

    if (mode === 'new') {
      useNetworkStore.getState().addSubgraph(subgraph);
      // Same wiring pass Generate runs. Building one component's subgraph on
      // its own used to skip it entirely, so rebuilding a single part left its
      // HEAT_OUT dangling while "Generate from Preferences" over the very same
      // component connected it — the difference being invisible and, from the
      // engineer's side, arbitrary.
      const { connected } = connectSuggestedPorts();
      toast.success(
        `${component.name}: ${subgraph.nodes.length} nodes, ${subgraph.edges.length} edges${
          connected > 0 ? `, ${connected} port(s) connected` : ''
        } / 已建立子圖`,
      );
      return;
    }

    const { preservedManual } = useNetworkStore
      .getState()
      .replaceComponentSubgraph(componentId, subgraph, mode);
    const { connected } = connectSuggestedPorts();
    toast.success(
      preservedManual > 0
        ? `Rebuilt "${component.name}", ${preservedManual} manual object(s) preserved / 已保留手動物件`
        : `Rebuilt "${component.name}"${connected > 0 ? `, ${connected} port(s) reconnected` : ''} / 已重建子圖`,
    );
  };

  const handleApplyTemplate = () => {
    if (!selectedComponent) return;
    if (modeledIds.has(selectedComponent.id)) {
      setRebuildFor(selectedComponent.id);
      return;
    }
    applyTemplate(selectedComponent.id, 'new');
  };

  const handlePrefChange = (componentId: string, next: BuilderPref) => {
    const current = prefs[componentId];
    // Changing how quantity is represented rebuilds topology, so warn first (05 §7).
    if (current && current.qtyModel !== next.qtyModel && modeledIds.has(componentId)) {
      setQtyWarning({ componentId, next });
      return;
    }
    setPrefs({ ...prefs, [componentId]: next });
  };

  const handleGenerate = () => {
    const structure = buildSharedStructure(structurePreset);
    const store = useNetworkStore.getState();

    store.addSubgraph({
      nodes: structure.nodes,
      edges: structure.edges,
      zones: structure.zones,
    });

    for (const component of enabledComponents) {
      const pref = prefs[component.id] ?? defaultPrefFor(component);
      const subgraph = buildComponentSubgraph(component, {
        materials,
        templateId: pref.templateId,
        qtyModel: pref.qtyModel,
        groupCount: pref.groupCount,
      });
      if (subgraph) store.addSubgraph(subgraph);
    }

    // Generate used to stop here and tell the engineer to go and wire every
    // port by hand — including the case where the structure offers a single
    // shared base and there is nothing to decide. It now does the connections
    // that follow from what has already been answered, and reports how many
    // are genuinely left.
    const { connected } = connectSuggestedPorts();
    const remaining = Object.values(useNetworkStore.getState().network?.nodes ?? {}).filter(
      (node) => (node.ports ?? []).some((port) => !port.connected_to),
    ).length;

    setShowGenerate(false);
    setStep('connections');
    toast.success(
      remaining > 0
        ? `Network generated — ${connected} port(s) connected, ${remaining} still need a target. / 已產生網路，已連接 ${connected} 個埠，尚有 ${remaining} 個待指定。`
        : `Network generated — all ${connected} port(s) connected. / 已產生網路，${connected} 個埠皆已連接。`,
    );
  };

  const handleApplyPreset = () => {
    const structure = buildSharedStructure(structurePreset);
    if (structure.nodes.length === 0) {
      toast.warning(
        'Custom preset creates nothing — add zones manually. / 自訂結構請手動新增區域。',
      );
      return;
    }
    useNetworkStore.getState().replaceSharedStructure(structure, materials);
    toast.success(
      'Shared structure replaced; compatible component connections were preserved. / 已替換共用結構，並保留可相容的元件連線。',
    );
  };

  const handleAddZone = (zoneDraft: NewZoneDraft) => {
    const node = createZoneNode(zoneDraft.name, zoneDraft.name, zoneDraft.type);
    useNetworkStore.getState().mutate((net) => {
      net.nodes[node.id] = {
        ...node,
        metadata: zoneDraft.notes ? { notes: zoneDraft.notes } : undefined,
      };
      net.zones[node.id] = {
        id: node.id,
        name: zoneDraft.name,
        type: zoneDraft.type,
        linked_hsk: zoneDraft.linkedHsk || null,
        notes: zoneDraft.notes,
      };
      if (zoneDraft.linkedHsk && net.nodes[zoneDraft.linkedHsk]) {
        const id = structureEdgeId(node.id, zoneDraft.linkedHsk);
        net.edges[id] = {
          id,
          from: node.id,
          to: zoneDraft.linkedHsk,
          type: 'conduction',
          method: 'conduction_LkA',
          rth: createRth(null, 'Analytical', 'low'),
          parameters: {},
          heat_flow_W: null,
          delta_T_C: null,
          resolution: 'unresolved',
          resolution_note: 'Resistance not yet defined.',
          enabled: true,
          origin: { kind: 'manual' },
        };
      }
    });
    toast.success(`Zone "${zoneDraft.name}" created / 已建立區域`);
  };

  const handleAddSpreading = (spreadDraft: NewSpreadingDraft) => {
    const usable = spreadDraft.method === 'manual' || spreadDraft.method === 'correlation';
    const edge = createSpreadingEdge(spreadDraft.from, spreadDraft.to, {
      R_C_per_W: usable ? spreadDraft.rth : null,
      note:
        spreadDraft.method === 'future_flotherm'
          ? 'Reserved for a future FloTHERM result (Screen 03 is deferred).'
          : undefined,
    });
    useNetworkStore.getState().upsertEdge({
      ...edge,
      confidence: spreadDraft.confidence,
      rth: spreadDraft.source
        ? {
            ...edge.rth,
            provenance: {
              ...edge.rth.provenance,
              Manual: {
                source: 'Manual',
                reference: spreadDraft.source,
                confidence: spreadDraft.confidence,
              },
            },
          }
        : edge.rth,
    });
    toast.success('Spreading edge created / 已建立擴散連線');
  };

  /**
   * The two wiring tools, kept genuinely apart.
   *
   * They used to be near-indistinguishable: both asked for a source then a
   * target, and Connect quietly fell back to creating the same blank manual edge
   * whenever the source had no open port. So the only difference was invisible,
   * happened in one case out of two, and the fallback was the worse outcome —
   * a port that should have been wired through its material instead became a
   * `custom` edge with no resistance and no note saying why.
   *
   *   Connect  — port wiring only. It resolves the interface through the
   *              project's materials. If the source has no open port it says so
   *              and does nothing.
   *   Add Edge — always a blank manual edge, for a route the templates do not
   *              describe. The resistance is yours to enter.
   */
  const handleConnect = (sourceId: string, targetId: string) => {
    if (!network) return;
    const source = network.nodes[sourceId];
    const target = network.nodes[targetId];
    if (!source || !target) return;

    if (tool === 'connect') {
      const openPort = (source.ports ?? []).find((port) => !port.connected_to);
      if (!openPort) {
        toast.warning(
          `"${source.name}" has no unconnected port. Use Add Edge for a manual route. / 此節點沒有未連接的埠，請改用「新增連線」。`,
        );
        return;
      }
      useNetworkStore.getState().connectPort(sourceId, openPort.kind, targetId, materials);
      toast.success(`${openPort.kind} → ${target.name} / 已連接`);
      return;
    }

    const id = manualId('EDGE', new Set(Object.keys(network.edges)));
    const edge: ThermalEdge = {
      id,
      from: sourceId,
      to: targetId,
      type: 'custom',
      method: 'direct_rth',
      rth: createRth(null, 'Manual', 'low'),
      parameters: {},
      heat_flow_W: null,
      delta_T_C: null,
      resolution: 'unresolved',
      resolution_note: 'Manual edge — enter a resistance in the Edge Inspector.',
      enabled: true,
      origin: { kind: 'manual' },
    };
    useNetworkStore.getState().upsertEdge(edge);
    setSelection({ kind: 'edge', id });
    toast.success('Edge created — define its model / 已建立連線，請設定模型');
  };

  /**
   * Wires every open port whose destination is not in doubt, and leaves the
   * rest alone.
   *
   * Two things count as "not in doubt". The first is the engineer's own answer:
   * Screen 04's preferred base zone, matched against the zones this structure
   * actually built. The second is a structure that offers exactly one base —
   * on a single shared HSK there is no choice to make, so asking the engineer
   * to click each port onto the only available target is busywork, not rigour.
   *
   * Anything else is a real decision and is left for them.
   */
  const connectSuggestedPorts = (): { connected: number; soleBase: boolean } => {
    const store = useNetworkStore.getState();
    const live = store.network;
    if (!live) return { connected: 0, soleBase: false };
    const zoneIds = Object.keys(live.zones);

    let connected = 0;
    let usedSoleBase = false;
    for (const node of Object.values(live.nodes)) {
      const port = (node.ports ?? []).find((entry) => !entry.connected_to);
      if (!port || !node.component_ref) continue;
      const component = components.find((entry) => entry.id === node.component_ref);
      if (!component) continue;

      const target = resolvePortTarget(component, zoneIds);
      if (!target || !live.nodes[target.zoneId]) continue;
      if (target.reason === 'sole_base') usedSoleBase = true;

      store.connectPort(node.id, port.kind, target.zoneId, materials);
      connected++;
    }
    return { connected, soleBase: usedSoleBase };
  };

  const autoConnectSuggested = () => {
    const { connected, soleBase } = connectSuggestedPorts();
    toast[connected > 0 ? 'success' : 'warning'](
      connected > 0
        ? `${connected} port(s) connected${soleBase ? ' to the only shared base' : ' to the suggested zone'} / 已${soleBase ? '連接至唯一共用基座' : '依建議連接'}`
        : 'No suggested zone matched. Connect the ports manually. / 沒有可用的建議區域。',
    );
  };

  const focusIssue = (issue: GraphIssue) => {
    if (issue.nodeId) {
      setSelection({ kind: 'node', id: issue.nodeId });
      canvasRef.current?.center(issue.nodeId);
    } else if (issue.edgeId) {
      setSelection({ kind: 'edge', id: issue.edgeId });
    }
  };

  // --- Guards --------------------------------------------------------------

  /**
   * Delete removes whatever is selected on the canvas.
   *
   * Bound to the window rather than to the canvas element: Cytoscape draws into
   * a canvas that never takes focus, so a listener on the container would only
   * ever fire if the engineer happened to have tabbed to it.
   *
   * Which means the guards matter more than usual — the same key press must not
   * eat a character out of a field in the inspector, or delete anything at all
   * in a read-only project. Undo covers the rest (05 §46).
   *
   * It lives up here with the other effects, ABOVE the loading and error
   * returns, because hooks must run in the same order on every render. Placed
   * below them it ran only once the project had loaded — so the first render
   * after a page reload, which starts in the loading state, called one hook
   * fewer than the next one and React tore the whole screen down.
   */
  useEffect(() => {
    if (readOnly || !selection) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }

      event.preventDefault();
      const store = useNetworkStore.getState();
      if (selection.kind === 'node') store.removeNode(selection.id);
      else store.removeEdge(selection.id);
      setSelection(null);
      toast.success('Deleted — Undo restores it / 已刪除，可用復原還原');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, selection]);

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">Unable to load thermal network.</h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入熱網路。</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => projectId && useNetworkStore.getState().loadFor(projectId)}
            >
              Retry / 重試
            </Button>
            <Button onClick={() => navigate('/')}>Return to Component Manager</Button>
          </div>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft || !network) return <LoadingState />;

  const blockingErrors = validation?.errors ?? 0;
  const warnings = validation?.warnings ?? 0;
  const isEmpty = Object.keys(network.nodes).length === 0;

  const handleSaveAndContinue = () => {
    if (blockingErrors > 0) return;
    handleSave();
    if (warnings > 0) {
      setWarningConfirm(warnings);
      return;
    }
    navigate(projectPath(projectId, 'boundary'));
  };

  const selectedNode = selection?.kind === 'node' ? network.nodes[selection.id] : null;
  const selectedEdge = selection?.kind === 'edge' ? network.edges[selection.id] : null;

  const completedSteps: BuilderStep[] = [];
  if (components.length > 0) completedSteps.push('components');
  if (modeledIds.size > 0) completedSteps.push('templates');
  if (Object.keys(network.zones).length > 0) completedSteps.push('structure');
  if (kpis.unconnectedPorts === 0 && kpis.nodes > 0) completedSteps.push('connections');
  if (validation && validation.errors === 0 && kpis.nodes > 0) completedSteps.push('validate');

  return (
    <ScreenWorkspace
      title="Thermal Path Builder"
      titleZh="熱路徑設定"
      descriptionZh="定義熱可以怎麼走：元件子圖、共用結構與彼此的連接。本畫面不設定邊界條件，也不進行求解。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          <Badge tone={network.status === 'NEEDS_REVIEW' ? 'warn' : 'neutral'}>
            {network.status}
          </Badge>
          <Badge tone={solverState === 'DIRTY' ? 'warn' : 'neutral'}>Solver {solverState}</Badge>
          {requiresReview && <Badge tone="warn">Linked parameters changed / 連動參數已變更</Badge>}
        </div>
      }
      metrics={
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={<Boxes size={13} />}
            value={`${kpis.componentsModeled} / ${kpis.componentsTotal}`}
            label="Components Modeled"
            zh="建模元件"
          />
          <KpiCard icon={<Share2 size={13} />} value={kpis.nodes} label="Nodes" zh="節點" />
          <KpiCard icon={<Link2 size={13} />} value={kpis.edges} label="Edges" zh="連線" />
          <KpiCard
            icon={<CircleSlash size={13} />}
            iconTone={kpis.unconnectedPorts > 0 ? 'text-warn-600' : 'text-ink-400'}
            value={kpis.unconnectedPorts}
            label="Unconnected Ports"
            zh="未連接埠"
            tone={kpis.unconnectedPorts > 0 ? 'text-warn-600' : 'text-ink-900'}
          />
          <KpiCard
            icon={<TriangleAlert size={13} />}
            iconTone={kpis.unresolvedRth > 0 ? 'text-warn-600' : 'text-ink-400'}
            value={kpis.unresolvedRth}
            label="Unresolved Rth"
            zh="未解析熱阻"
            tone={kpis.unresolvedRth > 0 ? 'text-warn-600' : 'text-ink-900'}
          />
          <KpiCard
            icon={<Octagon size={13} />}
            iconTone={blockingErrors > 0 ? 'text-danger-600' : 'text-ok-600'}
            value={blockingErrors}
            label="Blocking Errors"
            zh="阻擋錯誤"
            tone={blockingErrors > 0 ? 'text-danger-600' : 'text-ok-600'}
          />
        </div>
      }
      stepper={<BuilderStepper current={step} onSelect={setStep} completed={completedSteps} />}
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            onClick={() => navigate(projectPath(projectId, 'components'))}
          >
            Back / 返回
          </Button>
          <Button
            icon={<RotateCcw size={15} />}
            onClick={() => {
              canvasRef.current?.runLayout(layoutMode);
              canvasRef.current?.fit();
            }}
          >
            Reset View / 重設視圖
          </Button>

          {blockingErrors > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              {blockingErrors} blocking error{blockingErrors > 1 ? 's' : ''} must be fixed before
              Screen 06 / 需先修正錯誤
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              icon={<CircleCheck size={15} />}
              onClick={() => {
                const result = useNetworkStore.getState().revalidate();
                if (!result) return;
                setStep('validate');
                if (result.errors > 0) toast.error(`${result.errors} blocking error(s) / 有錯誤`);
                else if (result.warnings > 0)
                  toast.warning(`${result.warnings} warning(s) / 有警告`);
                else toast.success('Topology is valid / 拓樸驗證通過');
              }}
            >
              Validate / 驗證
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={blockingErrors > 0 || isEmpty}
              onClick={handleSaveAndContinue}
            >
              Save &amp; Continue / 儲存並繼續
            </Button>
          </div>
        </div>
      }
    >
      {/* The editor fills every pixel left by the shell. Fullscreen promotes this
          workspace above the shell while keeping the same editing controls. */}
      <div
        className={`flex min-h-[22rem] flex-1 flex-col gap-3 lg:flex-row ${fullscreen ? 'fixed inset-0 z-30 min-h-0 bg-canvas p-3' : ''}`}
        data-testid="thermal-path-workspace"
      >
        {/* The palettes scroll inside their own column so the canvas keeps a
            stable viewport — a graph editor cannot live in a page that scrolls. */}
        {!fullscreen && paletteCollapsed && (
          <button
            type="button"
            onClick={() => setPaletteCollapsed(false)}
            aria-label="Expand component tools / 展開元件工具"
            title="Expand component tools / 展開元件工具"
            className="flex h-9 w-full shrink-0 items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[11px] font-semibold text-ink-500 hover:border-ink-400 hover:text-ink-900 lg:h-full lg:w-10 lg:flex-col"
          >
            <ChevronRight size={15} />
            <span className="hidden [writing-mode:vertical-rl] lg:block">Tools / 工具</span>
          </button>
        )}
        {!fullscreen && !paletteCollapsed && (
          <div className="relative flex w-full shrink-0 flex-col gap-3 overflow-y-auto pr-1 lg:h-full lg:w-[19rem]">
            <button
              type="button"
              onClick={() => setPaletteCollapsed(true)}
              aria-label="Collapse component tools / 收合元件工具"
              title="Collapse component tools / 收合元件工具"
              className="absolute top-2 right-9 z-10 flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-500 shadow-sm hover:border-ink-400 hover:text-ink-900"
            >
              <ChevronLeft size={14} />
            </button>
            <Collapsible
              title="Components"
              zh="元件"
              open={openPanel.components}
              onToggle={() =>
                setOpenPanel({
                  ...openPanel,
                  components: !openPanel.components,
                })
              }
            >
              <ComponentPalette
                components={components}
                prefs={prefs}
                modeledIds={modeledIds}
                selectedId={selectedComponentId}
                onSelect={(componentId) => {
                  setSelectedComponentId(componentId);
                  setOpenPanel((panels) => ({ ...panels, templates: true }));
                }}
              />
            </Collapsible>

            <Collapsible
              title="Templates"
              zh="架構模板"
              open={openPanel.templates}
              onToggle={() => setOpenPanel({ ...openPanel, templates: !openPanel.templates })}
            >
              <TemplatePalette
                component={selectedComponent}
                pref={selectedPref}
                hasSubgraph={Boolean(selectedComponent && modeledIds.has(selectedComponent.id))}
                readOnly={readOnly}
                onPrefChange={(next) => {
                  if (!selectedComponent) return;
                  handlePrefChange(selectedComponent.id, next);
                }}
                onApply={handleApplyTemplate}
              />
            </Collapsible>

            <Collapsible
              title="Shared Structure"
              zh="共用結構"
              open={openPanel.structure}
              onToggle={() => setOpenPanel({ ...openPanel, structure: !openPanel.structure })}
            >
              <SharedStructurePanel
                network={network}
                preset={structurePreset}
                readOnly={readOnly}
                onPresetChange={setStructurePreset}
                onApplyPreset={handleApplyPreset}
                onAddZone={handleAddZone}
                onAddSpreading={handleAddSpreading}
                onFocusNode={(nodeId) => {
                  setSelection({ kind: 'node', id: nodeId });
                  canvasRef.current?.center(nodeId);
                }}
              />
            </Collapsible>

            <div className="flex shrink-0 gap-2">
              <Button
                variant="primary"
                className="h-8 flex-1"
                disabled={readOnly || enabledComponents.length === 0}
                onClick={() => setShowGenerate(true)}
              >
                Generate from Preferences
              </Button>
              <Button
                className="h-8 flex-1"
                disabled={readOnly}
                onClick={() => {
                  handleApplyPreset();
                  setStep('structure');
                }}
              >
                Start Blank
              </Button>
            </div>
          </div>
        )}

        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-surface ${fullscreen ? 'rounded-none' : 'rounded-lg'}`}
        >
          <GraphToolbar
            tool={tool}
            layoutMode={layoutMode}
            zoom={zoom}
            showPorts={showPorts}
            showLabels={showLabels}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            readOnly={readOnly}
            onTool={(next) => {
              setTool(next);
              if (next === 'add-node') setAddNodeDraft({ name: '', type: 'custom' });
            }}
            onLayoutMode={(mode) => {
              setLayoutMode(mode);
              canvasRef.current?.runLayout(mode);
            }}
            onAutoLayout={() => canvasRef.current?.runLayout(layoutMode)}
            onAutoConnect={autoConnectSuggested}
            onFit={() => canvasRef.current?.fit()}
            onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
            onUndo={() => useNetworkStore.getState().undo()}
            onRedo={() => useNetworkStore.getState().redo()}
            onValidate={() => {
              const result = useNetworkStore.getState().revalidate();
              setStep('validate');
              // It always did re-run validation, but said nothing — and on an
              // already-valid network nothing on screen changed either, so the
              // button read as broken.
              if (!result) {
                toast.warning('Nothing to validate yet / 尚無可驗證的網路');
              } else if (result.errors > 0) {
                toast.error(
                  `${result.errors} error(s), ${result.warnings} warning(s) / ${result.errors} 個錯誤、${result.warnings} 個警告`,
                );
              } else if (result.warnings > 0) {
                toast.warning(
                  `No errors, ${result.warnings} warning(s) / 無錯誤，${result.warnings} 個警告`,
                );
              } else {
                toast.success('Network is valid / 熱網路驗證通過');
              }
            }}
            onTogglePorts={() => setShowPorts((value) => !value)}
            onToggleLabels={() => setShowLabels((value) => !value)}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((value) => !value)}
          />

          <div className="relative min-h-0 flex-1">
            {isEmpty ? (
              <EmptyNetworkState
                hasComponents={enabledComponents.length > 0}
                readOnly={readOnly}
                onGenerate={() => setShowGenerate(true)}
                onStartBlank={() => {
                  handleApplyPreset();
                  setStep('structure');
                }}
                onGoToComponents={() => navigate(projectPath(projectId, 'components'))}
              />
            ) : (
              <>
                <ThermalGraphCanvas
                  ref={canvasRef}
                  network={network}
                  selection={selection}
                  tool={tool}
                  showPorts={showPorts}
                  showLabels={showLabels}
                  layoutMode={layoutMode}
                  onSelect={setSelection}
                  onNodeMoved={(nodeId, position) =>
                    useNetworkStore.getState().setNodePosition(nodeId, position)
                  }
                  onConnect={handleConnect}
                  onContextMenu={(target, at) => setContextMenu({ ...target, x: at.x, y: at.y })}
                  onZoomChange={setZoom}
                  onLayout={(positions) =>
                    useNetworkStore.getState().mutate(
                      (net) => {
                        net.layout.positions = {
                          ...net.layout.positions,
                          ...positions,
                        };
                      },
                      { skipHistory: true, skipInvalidate: true },
                    )
                  }
                  pendingSourceRef={pendingSourceRef}
                />
                <Legend />
                <NetworkValidationPanel validation={validation} onFocus={focusIssue} />
                {/* Beside the legend, not on top of it — and it names which of
                    the two wiring tools is armed, since they ask for the same
                    two clicks but do different things with them. */}
                {(tool === 'connect' || tool === 'add-edge') && (
                  <p className="absolute top-3 left-[13rem] z-10 rounded-md border border-accent-500 bg-accent-100 px-2.5 py-1.5 text-[11px] font-semibold text-accent-700">
                    {tool === 'connect'
                      ? 'Connect port: click a node with an open port, then its target. / 連接埠：先點有未連接埠的節點，再點目標。'
                      : 'Add edge: click the source node, then the target. / 新增連線：先點起點節點，再點終點。'}
                  </p>
                )}
              </>
            )}

            {contextMenu && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setContextMenu(null)}
                />
                <ul
                  className="absolute z-30 min-w-40 rounded-md border border-line bg-surface py-1 shadow-lg"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  {(contextMenu.kind === 'node'
                    ? [
                        { id: 'inspect', label: 'Inspect / 檢視' },
                        { id: 'center', label: 'Center / 置中' },
                        { id: 'duplicate', label: 'Duplicate / 複製' },
                        { id: 'disable', label: 'Disable / 停用' },
                        { id: 'delete', label: 'Delete / 刪除' },
                      ]
                    : [
                        { id: 'inspect', label: 'Inspect / 檢視' },
                        { id: 'duplicate', label: 'Duplicate / 複製' },
                        { id: 'disable', label: 'Disable / 停用' },
                        {
                          id: 'reverse',
                          label: 'Reverse direction / 反轉方向',
                        },
                        { id: 'delete', label: 'Delete / 刪除' },
                      ]
                  ).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-surface-muted disabled:opacity-50"
                        disabled={readOnly && item.id !== 'inspect' && item.id !== 'center'}
                        onClick={() => {
                          const store = useNetworkStore.getState();
                          const { kind, id } = contextMenu;
                          setContextMenu(null);

                          if (item.id === 'inspect') {
                            setSelection({ kind, id });
                            return;
                          }
                          if (item.id === 'center') {
                            canvasRef.current?.center(id);
                            return;
                          }
                          if (item.id === 'delete') {
                            if (kind === 'node') store.removeNode(id);
                            else store.removeEdge(id);
                            setSelection(null);
                            return;
                          }
                          if (item.id === 'disable') {
                            if (kind === 'edge') {
                              const edge = network.edges[id];
                              if (edge)
                                store.upsertEdge({
                                  ...edge,
                                  enabled: !edge.enabled,
                                });
                            } else {
                              const node = network.nodes[id];
                              if (node)
                                store.upsertNode({
                                  ...node,
                                  disabled: !node.disabled,
                                });
                            }
                            return;
                          }
                          if (item.id === 'duplicate') {
                            if (kind === 'node') {
                              const node = network.nodes[id];
                              if (!node) return;
                              const newId = manualId('NODE', new Set(Object.keys(network.nodes)));
                              const copy: ThermalNode = {
                                ...node,
                                id: newId,
                                name: `${node.name} (copy)`,
                                ports: (node.ports ?? []).map((port) => ({
                                  ...port,
                                  connected_to: null,
                                })),
                                origin: {
                                  kind: 'manual',
                                  component_id: node.component_ref,
                                },
                              };
                              store.upsertNode(copy);
                              setSelection({ kind: 'node', id: newId });
                            } else {
                              const edge = network.edges[id];
                              if (!edge) return;
                              const newId = manualId('EDGE', new Set(Object.keys(network.edges)));
                              store.upsertEdge({
                                ...edge,
                                id: newId,
                                origin: {
                                  kind: 'manual',
                                  component_id: edge.origin?.component_id,
                                },
                              });
                              setSelection({ kind: 'edge', id: newId });
                            }
                            return;
                          }
                          if (item.id === 'reverse' && kind === 'edge') {
                            const edge = network.edges[id];
                            if (!edge) return;
                            store.upsertEdge({
                              ...edge,
                              from: edge.to,
                              to: edge.from,
                              metadata: {
                                ...edge.metadata,
                                nominal_direction_reversed: true,
                              },
                            });
                          }
                        }}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Like Screen 04, inspection is non-modal: the graph keeps its full
          width and remains clickable behind the movable, resizable window. */}
      {(selectedNode || selectedEdge) && (
        <FloatingPanel
          storageKey="tnv.05.inspector"
          defaultWidth={720}
          defaultHeight={960}
          title={selectedNode ? `Node: ${selectedNode.id}` : `Edge: ${selectedEdge!.id}`}
          subtitle={
            selectedNode
              ? selectedNode.name
              : `${network.nodes[selectedEdge!.from]?.name ?? selectedEdge!.from} → ${network.nodes[selectedEdge!.to]?.name ?? selectedEdge!.to}`
          }
          badge={
            selectedNode ? (
              <Badge
                tone={
                  selectedNode.disabled
                    ? 'neutral'
                    : selectedNode.boundary_role === 'placeholder'
                      ? 'warn'
                      : 'ok'
                }
              >
                {selectedNode.disabled
                  ? 'DISABLED'
                  : selectedNode.boundary_role === 'placeholder'
                    ? 'BOUNDARY'
                    : 'ACTIVE'}
              </Badge>
            ) : (
              <Badge
                tone={
                  !selectedEdge!.enabled
                    ? 'neutral'
                    : selectedEdge!.resolution === 'resolved'
                      ? 'ok'
                      : 'warn'
                }
              >
                {!selectedEdge!.enabled
                  ? 'DISABLED'
                  : selectedEdge!.resolution === 'resolved'
                    ? 'RESOLVED'
                    : 'UNRESOLVED'}
              </Badge>
            )
          }
          onClose={() => setSelection(null)}
        >
          {selectedNode ? (
            <NodeInspector
              embedded
              node={selectedNode}
              network={network}
              readOnly={readOnly}
              onPatch={(patch) =>
                useNetworkStore.getState().upsertNode({
                  ...selectedNode,
                  ...patch,
                  origin: selectedNode.origin
                    ? { ...selectedNode.origin, modified: true }
                    : { kind: 'manual' },
                })
              }
              onFocus={(nodeId) => canvasRef.current?.center(nodeId)}
              onSelectEdge={(edgeId) => setSelection({ kind: 'edge', id: edgeId })}
              onToggleEdge={(edgeId) => {
                const edge = network.edges[edgeId];
                if (edge)
                  useNetworkStore.getState().upsertEdge({ ...edge, enabled: !edge.enabled });
              }}
              onDeleteEdge={(edgeId) => useNetworkStore.getState().removeEdge(edgeId)}
              onToggleNode={() => {
                const disabled = !selectedNode.disabled;
                useNetworkStore.getState().mutate((net) => {
                  net.nodes[selectedNode.id] = { ...selectedNode, disabled };
                  for (const [id, edge] of Object.entries(net.edges)) {
                    if (edge.from === selectedNode.id || edge.to === selectedNode.id) {
                      net.edges[id] = { ...edge, enabled: !disabled };
                    }
                  }
                });
              }}
              onDeleteNode={() => {
                useNetworkStore.getState().removeNode(selectedNode.id);
                setSelection(null);
              }}
            />
          ) : (
            <EdgeInspector
              embedded
              edge={selectedEdge!}
              network={network}
              readOnly={readOnly}
              readiness={{
                errors: validation?.errors ?? 0,
                warnings: validation?.warnings ?? 0,
                info: validation?.info ?? 0,
              }}
              onPatch={(patch) =>
                useNetworkStore.getState().upsertEdge({ ...selectedEdge!, ...patch })
              }
              onDelete={() => {
                useNetworkStore.getState().removeEdge(selectedEdge!.id);
                setSelection(null);
              }}
              onReverse={() =>
                useNetworkStore.getState().mutate((net) => {
                  const edge = net.edges[selectedEdge!.id];
                  if (!edge) return;
                  net.edges[selectedEdge!.id] = {
                    ...edge,
                    from: edge.to,
                    to: edge.from,
                    metadata: {
                      ...edge.metadata,
                      nominal_direction_reversed: true,
                    },
                  };
                })
              }
            />
          )}
        </FloatingPanel>
      )}

      {/* --- Modals --- */}

      {showGenerate && (
        <GenerateNetworkPreview
          preview={previewGeneration(
            enabledComponents.map((component) => ({
              ...component,
              architecture_prep: {
                ...component.architecture_prep,
                template_preference: (prefs[component.id]?.templateId ??
                  component.architecture_prep
                    .template_preference) as Component['architecture_prep']['template_preference'],
                qty_model_preference: (prefs[component.id]?.qtyModel ??
                  component.architecture_prep
                    .qty_model_preference) as Component['architecture_prep']['qty_model_preference'],
              },
            })),
            materials,
          )}
          structurePreset={structurePreset}
          onCancel={() => setShowGenerate(false)}
          onConfirm={handleGenerate}
        />
      )}

      {rebuildFor && (
        <Modal
          title="Rebuild component subgraph / 重建元件子圖"
          description="Both options rebuild this component from its template. They differ in what happens to anything you added or edited by hand. / 兩個選項都會依模板重建此元件，差別在於你手動新增或修改過的物件會怎麼處理。"
          // Three bilingual choices do not fit the default width on one row.
          width="max-w-2xl"
          onClose={() => {
            setRebuildFor(null);
            setConfirmEntireRebuild(false);
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setRebuildFor(null);
                  setConfirmEntireRebuild(false);
                }}
              >
                Cancel / 取消
              </Button>
              {/*
                Destructive, so it is armed before it fires. The first click
                turns it red and spells out exactly what disappears; only the
                second click does it. The count comes from the same
                `origin.kind === 'manual' || origin.modified` test the store
                uses, so the number shown is the number that will be deleted.
              */}
              <Button
                variant={confirmEntireRebuild ? 'danger' : undefined}
                onClick={() => {
                  if (!confirmEntireRebuild) {
                    setConfirmEntireRebuild(true);
                    return;
                  }
                  applyTemplate(rebuildFor, 'entire');
                  setRebuildFor(null);
                  setConfirmEntireRebuild(false);
                }}
              >
                {confirmEntireRebuild
                  ? 'Confirm delete / 確定刪除'
                  : 'Entire Subgraph / 全部取代'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  applyTemplate(rebuildFor, 'generated_only');
                  setRebuildFor(null);
                  setConfirmEntireRebuild(false);
                }}
              >
                Auto-generated Only / 僅自動產生
              </Button>
            </>
          }
        >
          <dl className="flex flex-col gap-2.5 text-[13px]">
            <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
              <dt className="font-semibold text-ink-900">Auto-generated Only / 僅自動產生</dt>
              <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                Replaces what the template made and <strong>keeps</strong> everything you added or
                edited by hand.
                <span className="block">
                  只取代模板產生的部分，你手動新增或修改過的物件會<strong>保留</strong>。
                </span>
              </dd>
            </div>
            <div
              className={`rounded-md border px-3 py-2 ${
                confirmEntireRebuild
                  ? 'border-danger-500 bg-danger-100/50'
                  : 'border-line bg-surface-muted'
              }`}
            >
              <dt className="font-semibold text-ink-900">Entire Subgraph / 全部取代</dt>
              <dd className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                Deletes <strong>every</strong> node and edge belonging to this component, including
                the ones you added or edited by hand, then rebuilds from the template.
                <span className="block">
                  刪除此元件的<strong>所有</strong>節點與連線（含手動新增與修改過的），再依模板重建。
                </span>
              </dd>
              {manualObjectsFor(rebuildFor) > 0 ? (
                <p
                  className={`mt-1.5 text-[12px] font-semibold ${
                    confirmEntireRebuild ? 'text-danger-600' : 'text-warn-600'
                  }`}
                >
                  {manualObjectsFor(rebuildFor)} hand-made object(s) will be permanently deleted.
                  <span className="block">
                    將永久刪除 {manualObjectsFor(rebuildFor)} 個手動建立／修改的物件。
                  </span>
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-ink-400">
                  This component has no hand-made objects, so both options do the same thing here.
                  <span className="block">此元件沒有手動物件，因此兩個選項結果相同。</span>
                </p>
              )}
            </div>
          </dl>
        </Modal>
      )}

      {qtyWarning && (
        <Modal
          title="Quantity representation change / 變更數量表示方式"
          description="Changing how this component's quantity is represented rebuilds its topology. Existing connections and manual edits on the old instances may be orphaned. / 變更數量表示會重建拓樸，既有連線與手動修改可能會失效。"
          onClose={() => setQtyWarning(null)}
          footer={
            <>
              <Button onClick={() => setQtyWarning(null)}>Cancel / 取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setPrefs({
                    ...prefs,
                    [qtyWarning.componentId]: qtyWarning.next,
                  });
                  setQtyWarning(null);
                  toast.warning(
                    'Representation changed. Re-apply the template to rebuild. / 已變更，請重新套用模板。',
                  );
                }}
              >
                Change anyway / 仍要變更
              </Button>
            </>
          }
        />
      )}

      {addNodeDraft && (
        <Modal
          title="Add node / 新增節點"
          onClose={() => {
            setAddNodeDraft(null);
            setTool('select');
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setAddNodeDraft(null);
                  setTool('select');
                }}
              >
                Cancel / 取消
              </Button>
              <Button
                variant="primary"
                disabled={!addNodeDraft.name.trim()}
                onClick={() => {
                  const id = manualId('NODE', new Set(Object.keys(network.nodes)));
                  useNetworkStore.getState().upsertNode({
                    id,
                    name: addNodeDraft.name.trim(),
                    type: addNodeDraft.type,
                    power_W: 0,
                    temperature_C: null,
                    temperature_source: null,
                    boundary_type: null,
                    zone_id: null,
                    ports: [],
                    origin: { kind: 'manual' },
                  });
                  setSelection({ kind: 'node', id });
                  setAddNodeDraft(null);
                  setTool('select');
                }}
              >
                Add / 新增
              </Button>
            </>
          }
        >
          <FieldLabel label="Node Name" zh="節點名稱" htmlFor="new-node-name" required />
          <TextInput
            id="new-node-name"
            className="mt-1 mb-2"
            value={addNodeDraft.name}
            onChange={(event) => setAddNodeDraft({ ...addNodeDraft, name: event.target.value })}
          />
          <FieldLabel label="Node Type" zh="節點類型" htmlFor="new-node-type" />
          <Select
            id="new-node-type"
            className="mt-1"
            value={addNodeDraft.type}
            options={NODE_TYPES}
            onChange={(event) =>
              setAddNodeDraft({
                ...addNodeDraft,
                type: event.target.value as NodeType,
              })
            }
          />
        </Modal>
      )}

      {warningConfirm != null && (
        <Modal
          title="Continue with warnings? / 有警告，仍要繼續？"
          description={`${warningConfirm} item(s) remain unresolved. They must be completed in Screen 06 or a later calibration. / 尚有 ${warningConfirm} 項未解析，需於 Screen 06 或後續校正完成。`}
          onClose={() => setWarningConfirm(null)}
          footer={
            <>
              <Button onClick={() => setWarningConfirm(null)}>Stay / 留在本頁</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setWarningConfirm(null);
                  navigate(projectPath(projectId, 'boundary'));
                }}
              >
                Continue / 繼續
              </Button>
            </>
          }
        />
      )}
    </ScreenWorkspace>
  );
}

/** Kept for the palette: total dissipation summary, never an edge heat flow. */
export function totalDissipation(components: Component[]): number {
  return components.reduce((sum, component) => sum + powerWOf(component) * (component.qty || 1), 0);
}
