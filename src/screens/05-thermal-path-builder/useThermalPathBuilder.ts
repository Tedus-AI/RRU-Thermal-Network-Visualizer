/**
 * Screen 05's state, the effects that keep it in step with the stores, and the
 * actions its panels call.
 *
 * Every hook the screen uses runs here, in one fixed order, and the view calls
 * this before its loading and error returns — see the Delete-key effect below
 * for what happens when a hook runs only on some renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { FOCUS_PARAM, consumeFocus } from '@/app/focusLink';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolverStore } from '@/data/solverStore';
import { describePrune, pruneDeletedComponents } from '@/data/componentDeletion';
import { orphanedComponentIds } from '@/thermal/graph/componentPruning';

import type { Component } from '@/domain/component';
import { defaultMaterials } from '@/domain/materials';
import { staleLinkedEdges } from '@/thermal/graph/staleLinkedEdges';
import { createRth } from '@/thermal/rth';
import { networkKpis, type GraphIssue } from '@/thermal/graph/graphValidation';
import { refreshHskBaseConnectionEdges } from '@/thermal/graph/hskBaseConnection';
import { buildComponentSubgraph, resolvePortTarget } from '@/thermal/graph/networkBuilder';
import {
  buildSharedStructure,
  createSpreadingEdge,
  createZoneNode,
  type StructurePreset,
} from '@/thermal/graph/sharedStructure';
import { manualId, structureEdgeId } from '@/thermal/graph/idFactory';
import type { NodeType, ThermalEdge } from '@/thermal/types';

import { defaultPrefFor, type BuilderPref } from './ComponentPalette';
import type { NewSpreadingDraft, NewZoneDraft } from './SharedStructurePanel';
import type { CanvasTool } from './GraphToolbar';
import { useGraphExplorer } from '@/ui/GraphExplorer';
import type { CanvasHandle, GraphSelection } from './ThermalGraphCanvas';
import { applyBoundaryValidationOverlay } from './boundaryValidationOverlay';
import { projectScenarioBoundaryEdges } from './scenarioBoundaryProjection';

/**
 * Which tool group of the advanced editor is open. There is no stepper any
 * more (05 and 06 became one page); the step only decides which palette the
 * advanced editor shows after an action — Start Blank opens the structure,
 * Generate the connections.
 */
export type BuilderStep = 'components' | 'templates' | 'structure' | 'connections' | 'validate';

export function useThermalPathBuilder() {
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

  // Recomputed from the stored graph rather than tracked by a flag: a flag has
  // to be set by every path that could invalidate an edge — Screen 01, Screen
  // 04, an import, an undo — and the one that forgets is the one that matters.
  const staleEdges = useMemo(
    () => (network ? staleLinkedEdges(network, components, materials) : []),
    [network, components, materials],
  );
  const validation = useNetworkStore((s) => s.validation);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const boundarySets = useBoundaryStore((s) => s.sets);
  const activeBoundaryKey = useBoundaryStore((s) => s.activeKey);
  const boundaryPorts = useBoundaryStore((s) => s.ports);
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

  /**
   * Arrived from Screen 08's "Edit in" with an edge to open.
   *
   * It waits for the network, because a selection made before the graph loads
   * points at nothing; the parameter is consumed on the way so a reload does
   * not re-select an edge the engineer has moved on from.
   */
  const [focusParams] = useSearchParams();
  const [focusField, setFocusField] = useState<string | null>(null);
  useEffect(() => {
    if (!network) return;
    // A link to a boundary surface carries a node and a field instead; that
    // field belongs to the surface panel (`useBoundaryWorkspace`).
    if (!focusParams.get(FOCUS_PARAM.edge)) return;
    const edgeId = consumeFocus(focusParams, FOCUS_PARAM.edge, navigate);
    const field = consumeFocus(focusParams, FOCUS_PARAM.field, navigate);
    if (edgeId && network.edges[edgeId]) {
      setSelection({ kind: 'edge', id: edgeId });
      setFocusField(field);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, focusParams]);
  const [tool, setTool] = useState<CanvasTool>('select');
  /**
   * The advanced editor: templates, shared structure, manual connections, and
   * the canvas tools that add, connect and delete. Off by default — the network
   * is generated from 04, and the page's everyday job is the surfaces — so a
   * click on the fin surface followed by Backspace cannot delete it.
   */
  const [editing, setEditingState] = useState(false);
  const setEditing = useCallback((next: boolean) => {
    setEditingState(next);
    if (!next) setTool('select');
  }, []);
  const [layoutMode, setLayoutMode] = useState('Auto');
  const [zoom, setZoom] = useState(1);
  const [showPorts, setShowPorts] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [componentVisibilityOpen, setComponentVisibilityOpen] = useState(false);
  /**
   * Components switched off in the palette. Deliberately component state and
   * not persisted: it is a way of reading a crowded graph, not a property of
   * the project, and a filter that survived a reload would eventually be
   * mistaken for a missing component.
   */
  const [hiddenComponentIds, setHiddenComponentIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const explorer = useGraphExplorer(network, components, hiddenComponentIds);
  const toggleComponentVisible = useCallback((componentId: string) => {
    setHiddenComponentIds((current) => {
      const next = new Set(current);
      if (!next.delete(componentId)) next.add(componentId);
      return next;
    });
  }, []);
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
      if (event.key !== 'Escape') return;
      if (componentVisibilityOpen) setComponentVisibilityOpen(false);
      else setFullscreen(false);
    };
    window.addEventListener('keydown', leaveFullscreen);
    return () => window.removeEventListener('keydown', leaveFullscreen);
  }, [componentVisibilityOpen, fullscreen]);

  useEffect(() => {
    if (fullscreen) return;
    setComponentVisibilityOpen(false);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen || !componentVisibilityOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('[data-fullscreen-component-panel]') ||
        target.closest('[data-component-visibility-toggle]')
      )
        return;
      setComponentVisibilityOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [componentVisibilityOpen, fullscreen]);

  /**
   * Entering or leaving fullscreen changes the drawing area by a large factor,
   * and the canvas only ever auto-fits once — after that the pan and zoom are
   * the engineer's, and resizing the window must not throw them away. A
   * fullscreen toggle is the one resize that is not incidental: it is a request
   * for more room, so the graph is refitted to the room it just got. Without
   * this, both directions needed a second click on Fit to be usable.
   *
   * Two frames: the first lets React commit the new class, the second lets the
   * browser lay it out, so `fit` measures the container it will actually be.
   */
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => canvasRef.current?.fit());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
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

  // Screen 05 still validates topology, but its visible readiness also reflects
  // the active scenario's saved Screen 06 overlay. Re-loading on network
  // revision keeps the derived boundary ports aligned after regeneration.
  useEffect(() => {
    if (!projectId || !network || network.project_id !== projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    // Keyed on the revision, not the object: every edit makes a new network,
    // but only a new revision can move the derived boundary ports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeScenarioId, network?.revision]);

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
    // Keyed on the Screen 01 base inputs this reads, not the whole draft, so
    // typing a project name does not re-run the refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    draft?.project_id,
    materials.hsk_base_k_W_mK.value,
    materials.hsk_base_thickness_mm?.value,
    materials.hsk_base_L_mm?.value,
    materials.hsk_base_W_mm?.value,
  ]);

  // The same idea for the mount, which is chosen in Screen 04 and lives on the
  // port node. Without this, picking a boss over there would raise the review
  // flag and then appear to do nothing here until the engineer happened to
  // regenerate that component — a new feature that looks broken on first use.
  // `refreshMounts` only touches ports whose stamp is stale, so a visit with
  // nothing changed costs one comparison per node and writes nothing.
  useEffect(() => {
    if (!draft || draft.project_id !== projectId) return;
    const current = useNetworkStore.getState().network;
    if (!current || current.project_id !== projectId) return;
    useNetworkStore.getState().refreshMounts(components, materials);
    // The draft object changes on every keystroke; only which project is open
    // matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, draft?.project_id, components, materials]);

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

  /** Saves the network. `silent`: the page's own save reports once for everything it saved. */
  const handleSave = (silent = false) => {
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
    if (!silent) toast.success('熱網路已儲存');
  };

  const enabledComponents = useMemo(
    () => components.filter((component) => component.enabled),
    [components],
  );

  const modeledIds = useMemo(
    () => new Set(Object.keys(network?.templates ?? {})),
    [network?.templates],
  );

  const modeledComponents = useMemo(
    () => components.filter((component) => modeledIds.has(component.id)),
    [components, modeledIds],
  );

  const hiddenModeledComponentIds = useMemo(
    () =>
      new Set(
        [...hiddenComponentIds].filter((componentId) => modeledIds.has(componentId)),
      ),
    [hiddenComponentIds, modeledIds],
  );

  const activeBoundarySet = activeBoundaryKey ? (boundarySets[activeBoundaryKey] ?? null) : null;
  const scenarioBoundaryEdges = useMemo(
    () => projectScenarioBoundaryEdges(network, boundaryPorts, activeBoundarySet),
    [network, boundaryPorts, activeBoundarySet],
  );
  const displayValidation = useMemo(
    () => applyBoundaryValidationOverlay(validation, network, boundaryPorts, activeBoundarySet),
    [validation, network, boundaryPorts, activeBoundarySet],
  );

  const kpis = useMemo(
    () => {
      if (network) {
        const result = networkKpis(network, enabledComponents.length);
        result.unresolvedRth =
          displayValidation?.issues.filter(
            (issue) => issue.code === 'UNRESOLVED_RTH' || issue.code === 'BOUNDARY_NOT_CONFIGURED',
          ).length ?? result.unresolvedRth;
        return result;
      }
      return {
        componentsModeled: 0,
        componentsTotal: enabledComponents.length,
        nodes: 0,
        edges: 0,
        unconnectedPorts: 0,
        unresolvedRth: 0,
      };
    },
    [network, enabledComponents.length, displayValidation],
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

    const { preservedManual, droppedStale } = useNetworkStore
      .getState()
      .replaceComponentSubgraph(componentId, subgraph, mode);
    const { connected } = connectSuggestedPorts();
    // A dropped hand-made object is a warning, not a success: the new template
    // left it with nowhere to attach, and the engineer drew it.
    if (droppedStale > 0) {
      toast.warning(
        `Rebuilt "${component.name}" — ${droppedStale} hand-made object(s) removed, their nodes are not in the new template. / 已重建，${droppedStale} 個手繪物件因新模板已無對應節點而移除。`,
      );
      return;
    }
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
    let dropped = 0;
    const skipped: string[] = [];

    // Generate builds from the component list as it is, so a part 04 no
    // longer has goes first — its subgraph, wiring and 06 assignments.
    const gone = store.network ? orphanedComponentIds(store.network, new Set(components.map((c) => c.id))) : [];
    const pruned = projectId && gone.length > 0 ? pruneDeletedComponents(projectId, gone) : null;
    if (pruned && pruned.nodes > 0) toast.success(describePrune(pruned));

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
      // Never silent. A component whose template the registry does not have
      // produces no subgraph, and skipping it without a word is how a stale
      // subgraph survived every regenerate for as long as anyone tried.
      if (!subgraph) {
        skipped.push(`${component.name} (${pref.templateId})`);
        continue;
      }
      // `addSubgraph` is an upsert keyed by node id, so re-generating a
      // component whose template now emits DIFFERENT ids left the old chain
      // standing beside the new one: an FPGA moved from Board to Top Surface
      // came back with both an EPAD/via branch and a lid branch off the same
      // junction, and the solver saw two parallel paths where the engineer had
      // described one. Anything already modelled is therefore replaced, exactly
      // as Apply Template does — `generated_only`, so a hand-edited object is
      // still never silently discarded.
      if (modeledIds.has(component.id)) {
        dropped += store.replaceComponentSubgraph(
          component.id,
          subgraph,
          'generated_only',
        ).droppedStale;
      } else {
        store.addSubgraph(subgraph);
      }
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
    if (skipped.length > 0) {
      toast.error(
        `Not built — no such template: ${skipped.join(', ')}. Pick an architecture for these in the Templates panel. / 找不到模板，未建立：${skipped.join('、')}。請在架構模板面板重新選擇。`,
      );
      return;
    }
    // Every enabled component was just rebuilt from its current data, which is
    // exactly what the review flag was asking for. It used to clear only on
    // Save & Continue — and since the network saves itself, nobody pressed it,
    // so "Linked parameters changed" on 05 and "Network review required" on 04
    // stayed up after the network had already been regenerated.
    useNetworkStore.getState().setRequiresReview(false);
    if (dropped > 0) {
      toast.warning(
        `Network generated — ${dropped} hand-made object(s) removed, their nodes are not in the current templates. / 已產生網路，${dropped} 個手繪物件因目前模板已無對應節點而移除。`,
      );
      return;
    }
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
   * It lives here with the other effects, which run ABOVE the view's loading
   * and error returns, because hooks must run in the same order on every
   * render. Placed below them it ran only once the project had loaded — so the
   * first render after a page reload, which starts in the loading state, called
   * one hook fewer than the next one and React tore the whole screen down.
   */
  useEffect(() => {
    if (readOnly || !selection || !editing) return;

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
  }, [readOnly, selection, editing]);

  return {
    projectId,
    navigate,
    canvasRef,
    pendingSourceRef,
    draft,
    projectStatus,
    readOnly,
    materials,
    components,
    network,
    staleEdges,
    requiresReview,
    past,
    future,
    solverState,
    step,
    setStep,
    openPanel,
    setOpenPanel,
    prefs,
    setPrefs,
    selectedComponentId,
    setSelectedComponentId,
    selection,
    setSelection,
    focusField,
    setFocusField,
    tool,
    setTool,
    editing,
    setEditing,
    layoutMode,
    setLayoutMode,
    zoom,
    setZoom,
    showPorts,
    setShowPorts,
    showLabels,
    setShowLabels,
    fullscreen,
    setFullscreen,
    componentVisibilityOpen,
    setComponentVisibilityOpen,
    hiddenComponentIds,
    setHiddenComponentIds,
    explorer,
    toggleComponentVisible,
    structurePreset,
    setStructurePreset,
    showGenerate,
    setShowGenerate,
    rebuildFor,
    setRebuildFor,
    confirmEntireRebuild,
    setConfirmEntireRebuild,
    qtyWarning,
    setQtyWarning,
    contextMenu,
    setContextMenu,
    addNodeDraft,
    setAddNodeDraft,
    warningConfirm,
    setWarningConfirm,
    handleSave,
    enabledComponents,
    modeledIds,
    modeledComponents,
    hiddenModeledComponentIds,
    scenarioBoundaryEdges,
    displayValidation,
    kpis,
    selectedComponent,
    selectedPref,
    manualObjectsFor,
    applyTemplate,
    handleApplyTemplate,
    handlePrefChange,
    handleGenerate,
    handleApplyPreset,
    handleAddZone,
    handleAddSpreading,
    handleConnect,
    autoConnectSuggested,
    focusIssue,
  };
}

export type ThermalPathBuilder = ReturnType<typeof useThermalPathBuilder>;
