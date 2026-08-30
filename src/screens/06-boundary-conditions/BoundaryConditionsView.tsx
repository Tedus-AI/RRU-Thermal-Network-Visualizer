/**
 * Screen 06 — Boundary Conditions.
 * Specification: 06_Boundary_Conditions.md (source of truth), laid out after
 * 06.png.
 *
 * What this screen does: attaches SCENARIO-SPECIFIC ambient, convection,
 * radiation, solar, fixed-temperature and adiabatic conditions to the boundary
 * ports Screen 05 left open, and says whether the result is ready to solve.
 *
 * What it never does (06 §3.2, §3.3): create or delete a node or an edge, run
 * the solver, or display a solved temperature, an edge heat flow, a ΔT or a
 * bottleneck rank. Every number here is an input.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Copy,
  Save,
  Sparkles,
  Sun,
  Thermometer,
  TriangleAlert,
  Waves,
  Wind,
  XCircle,
} from 'lucide-react';

import { ScreenWorkspace } from '@/app/ScreenWorkspace';
import { projectPath } from '@/app/navigation';
import { useShellActions } from '@/app/shellActions';
import { Badge, Button, Modal, Skeleton } from '@/ui/primitives';
import { biTitle } from '@/ui/FieldLabel';
import { toast } from '@/ui/toast';

import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { useNetworkStore } from '@/data/networkStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { useSolverStore } from '@/data/solverStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useSolutionStore } from '@/data/solutionStore';
import { surfaceGroupsOf } from '@/thermal/boundary/boundaryPorts';
import {
  BOUNDARY_TYPE_LABELS,
  type BoundaryConditionProfile,
  type BoundaryConditionType,
} from '@/thermal/boundary/types';

import { BOUNDARY_STEPS, BoundaryStepper, type BoundaryStep } from './BoundaryStepper';
import { SurfacePropertiesPanel } from './SurfacePropertiesPanel';
import { BoundaryInspector, BoundaryInspectorEmpty } from './BoundaryInspector';
import { BoundarySummaryCard } from './BoundarySummaryCard';
import { FixedTemperaturePanel, type FixedTemperatureRow } from './FixedTemperaturePanel';
import { type ReadinessCheck } from './BoundaryValidationPanel';
import {
  ThermalGraphCanvas,
  type CanvasHandle,
  type GraphSelection,
} from '@/screens/05-thermal-path-builder/ThermalGraphCanvas';
import type { CanvasTool } from '@/screens/05-thermal-path-builder/GraphToolbar';
import { BoundaryGraphToolbar } from './BoundaryGraphToolbar';
import { BoundaryValidationOverlay } from './BoundaryValidationOverlay';
import {
  PORT_STATUS_LABELS,
  REPRESENTATION_FOR,
  formatNumber,
  portStatus,
  profilesForPort,
  summarize,
} from './boundaryViewModel';
import { T06 } from './tooltips';

// --- small building blocks -------------------------------------------------

function KpiTile({
  icon,
  label,
  zh,
  value,
  status,
  tone = 'text-ink-900',
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  zh: string;
  value: string;
  status?: string;
  tone?: string;
  tooltip: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-line bg-surface px-2 py-2"
      title={`${label} / ${zh} — ${tooltip}`}
    >
      <span className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-semibold text-ink-900">
        <span className="shrink-0 text-ink-400">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={`shrink-0 pl-2 font-bold tabular ${tone}`}>{value}</span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-ink-400">
        <span className="min-w-0 flex-1 truncate">{zh}</span>
        {status && <span className="shrink-0 truncate text-[10px]">{status}</span>}
      </span>
    </div>
  );
}

function SidebarSection({
  id,
  index,
  title,
  zh,
  open,
  onToggle,
  children,
}: {
  id: string;
  index: number;
  title: string;
  zh: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-accent-600 text-[11px] font-bold text-white tabular">
          {index}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink-900">
          {title} <span className="font-semibold text-ink-400">/ {zh}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-400 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div id={id} className="max-h-[28rem] overflow-auto border-t border-line p-3">
          {children}
        </div>
      )}
    </section>
  );
}

type BoundaryPanelId = 'surface' | 'conditions' | 'summary' | 'fixed';
const EMPTY_HIDDEN_COMPONENTS = new Set<string>();

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

// --- screen ----------------------------------------------------------------

export function BoundaryConditionsView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const draft = useProjectStore((s) => s.draft);
  const projectStatus = useProjectStore((s) => s.status);
  const readOnly = useProjectStore((s) => s.isReadOnly());

  const network = useNetworkStore((s) => s.network);
  const activeScenarioId = useScenarioStore((s) => s.activeScenarioId);
  const solverState = useSolverStore((s) => s.state);

  const sets = useBoundaryStore((s) => s.sets);
  const activeKey = useBoundaryStore((s) => s.activeKey);
  const ports = useBoundaryStore((s) => s.ports);
  const dirty = useBoundaryStore((s) => s.dirty);

  const [step, setStep] = useState<BoundaryStep>('scenario');
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [preferredProfileId, setPreferredProfileId] = useState<string | null>(null);
  const [warningConfirm, setWarningConfirm] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<BoundaryPanelId, boolean>>({
    surface: true,
    conditions: true,
    summary: false,
    fixed: false,
  });
  const [selection, setSelection] = useState<GraphSelection>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [layoutMode, setLayoutMode] = useState('Auto');
  const [zoom, setZoom] = useState(1);
  const [showPorts, setShowPorts] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const canvasRef = useRef<CanvasHandle | null>(null);
  const pendingSourceRef = useRef<string | null>(null);

  const set = activeKey ? (sets[activeKey] ?? null) : null;

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
    // Restores the global lifecycle badge on direct routes; Screen 06 still
    // never reads or renders solved temperatures or heat flows.
    useSolutionStore.getState().loadFor(projectId, scenarioId);
  }, [projectId]);

  // Switching scenario loads that scenario's own boundary set (06 §5 step 1).
  useEffect(() => {
    if (!projectId) return;
    useBoundaryStore.getState().loadFor(projectId, activeScenarioId);
    useSolutionStore.getState().loadFor(projectId, activeScenarioId);
    setSelectedPortId(null);
    setPreferredProfileId(null);
  }, [projectId, activeScenarioId]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => canvasRef.current?.fit());
    return () => window.cancelAnimationFrame(frame);
  }, [fullscreen, sidebarCollapsed]);

  const handleSave = () => {
    if (!projectId || readOnly || !set) return;
    useBoundaryStore.getState().save(projectId);
    useScenarioStore.getState().persist(projectId);
    toast.success('Boundary set saved / 邊界條件已儲存');
  };

  const setSaveHandler = useShellActions((s) => s.setSaveHandler);
  useEffect(() => {
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, readOnly, activeKey]);

  const summary = useMemo(() => summarize(set, ports), [set, ports]);
  const surfaceGroups = useMemo(() => surfaceGroupsOf(ports), [ports]);
  const selectedPort = ports.find((port) => port.id === selectedPortId) ?? null;
  const validation = set?.validation ?? { status: 'blocked' as const, errors: [], warnings: [], infos: [] };
  const solarEnabled = Boolean(
    set?.site.solar_enabled && (set.site.solar_irradiance_W_m2 ?? 0) > 0,
  );

  const editScenarioSettings = () => {
    navigate(`${projectPath(projectId!, 'info')}#scenario-settings`);
  };

  const fixedPortIds = useMemo(() => {
    if (!set) return new Set<string>();
    return new Set(
      set.assignments
        .filter((assignment) =>
          assignment.profile_ids.some(
            (id) =>
              set.profiles.find((profile) => profile.id === id)?.type ===
              'fixed_temperature_boundary',
          ),
        )
        .map((assignment) => assignment.boundary_port_id),
    );
  }, [set]);

  const fixedRows: FixedTemperatureRow[] = useMemo(() => {
    if (!set) return [];
    return set.assignments.flatMap((assignment) => {
      const port = ports.find((entry) => entry.id === assignment.boundary_port_id);
      if (!port) return [];
      return assignment.profile_ids.flatMap((id) => {
        const profile = set.profiles.find((entry) => entry.id === id);
        return profile?.type === 'fixed_temperature_boundary' ? [{ port, profile }] : [];
      });
    });
  }, [set, ports]);

  const fixedCandidates = useMemo(
    () =>
      ports.filter(
        (port) =>
          port.allowed_boundary_types.includes('fixed_temperature_boundary') &&
          !fixedPortIds.has(port.id),
      ),
    [ports, fixedPortIds],
  );

  // --- actions -----------------------------------------------------------

  /** Adds a profile of `type` to the selected port and assigns it. */
  const addProfileToPort = (portId: string, type: BoundaryConditionType) => {
    const port = ports.find((entry) => entry.id === portId);
    if (!port || !set) return;
    if (type === 'solar_load' && !solarEnabled) {
      toast.warning('SCR01 日照負載為 0 W/m²，無法啟用太陽熱負載。');
      return;
    }

    const surface = set.surface_properties.find(
      (entry) => entry.surface_group_id === port.surface_group_id,
    );

    const id = `BCP_${portId}_${type.toUpperCase()}`;
    const parameters: BoundaryConditionProfile['parameters'] = {};
    if (type === 'convection_to_ambient' || type === 'combined_convection_radiation') {
      parameters.area_m2 = port.area_m2;
    }
    if (
      type === 'radiation_to_surroundings' ||
      type === 'combined_convection_radiation'
    ) {
      parameters.emissivity = surface?.emissivity ?? null;
      parameters.area_m2 = port.area_m2;
      parameters.radiationTemperature_C =
        set.ambient.radiation_surrounding_C ?? set.ambient.external_ambient_C;
    }
    if (type === 'solar_load') {
      parameters.irradiance_W_m2 = set.site.solar_irradiance_W_m2;
      parameters.absorptivity = surface?.absorptivity ?? null;
      parameters.receivingArea_m2 = port.area_m2;
    }
    if (type === 'ambient_reservoir') {
      parameters.temperature_C = set.ambient.external_ambient_C;
    }

    const profile: BoundaryConditionProfile = {
      id,
      name: `${port.name} — ${BOUNDARY_TYPE_LABELS[type].label}`,
      type,
      representation: REPRESENTATION_FOR[type],
      parameters,
      source: 'manual',
      confidence: 'medium',
      provenance: { source_label: 'Screen 06 boundary input' },
      external_mappings: { import_status: 'deferred' },
    };

    const store = useBoundaryStore.getState();
    store.upsertProfile(profile);
    const existing = profilesForPort(store.current(), portId).map((entry) => entry.id);
    store.assignProfiles(portId, [...new Set([...existing, id])]);
    toast.success(`${BOUNDARY_TYPE_LABELS[type].label} added / 已新增邊界條件`);
  };

  const removeProfile = (profileId: string) => {
    useBoundaryStore.getState().removeProfile(profileId);
  };

  /** 06 §16 — copies the selected port's profiles onto every similar surface. */
  const applyToSimilar = () => {
    if (!selectedPort || !set) return;
    const source = profilesForPort(set, selectedPort.id);
    if (source.length === 0) return;

    const store = useBoundaryStore.getState();
    let applied = 0;
    for (const port of ports) {
      if (port.id === selectedPort.id) continue;
      if (port.orientation !== selectedPort.orientation) continue;

      const copies = source.map((profile) => ({
        ...profile,
        id: `${profile.id}_FOR_${port.id}`,
        name: `${port.name} — ${BOUNDARY_TYPE_LABELS[profile.type].label}`,
        parameters: { ...profile.parameters, area_m2: port.area_m2 },
      }));
      copies.forEach((copy) => store.upsertProfile(copy));
      store.assignProfiles(
        port.id,
        copies.map((copy) => copy.id),
      );
      applied++;
    }

    toast[applied > 0 ? 'success' : 'warning'](
      applied > 0
        ? `Applied to ${applied} similar surface(s) / 已套用至相似表面`
        : 'No similar surface found / 沒有相似的表面',
    );
  };

  const selectGraphObject = (next: GraphSelection) => {
    setSelection(next);
    if (next?.kind !== 'node') return;
    const port = ports.find((entry) => entry.connected_node_id === next.id);
    if (!port) return;
    setSelectedPortId(port.id);
    setPreferredProfileId(null);
    setOpenPanels((current) => ({ ...current, conditions: true }));
  };

  const handleValidate = () => {
    useBoundaryStore.getState().revalidate();
    setStep('validate');
    const state = useBoundaryStore.getState().current()?.validation;
    if (!state) {
      toast.warning('Nothing to validate yet / 尚無可驗證的邊界條件');
    } else if (state.errors.length > 0) {
      toast.error(`${state.errors.length} error(s) / 有錯誤`);
    } else if (state.warnings.length > 0) {
      toast.warning(`${state.warnings.length} warning(s) / 有警告`);
    } else {
      toast.success('Boundary conditions are ready for 07 / 可交付 07');
    }
  };

  const createBoundaryProfiles = () => {
    const store = useBoundaryStore.getState();
    const { created, firstCreatedPortId } = store.generateDefaults();
    const latest = store.current();
    const firstError = latest?.validation.errors[0];
    const errorPortId =
      firstError?.boundary_port_id ??
      (firstError?.profile_id
        ? latest?.assignments.find((assignment) =>
            assignment.profile_ids.includes(firstError.profile_id!),
          )?.boundary_port_id
        : undefined);
    const targetPortId = firstCreatedPortId ?? errorPortId ?? null;
    const targetProfileId =
      firstError?.profile_id ??
      (targetPortId
        ? latest?.assignments.find(
            (assignment) => assignment.boundary_port_id === targetPortId,
          )?.profile_ids[0]
        : undefined) ??
      null;

    if (targetPortId) {
      const targetPort = ports.find((port) => port.id === targetPortId);
      setSelectedPortId(targetPortId);
      setPreferredProfileId(targetProfileId);
      setOpenPanels((current) => ({ ...current, conditions: true }));
      if (targetPort) {
        setSelection({ kind: 'node', id: targetPort.connected_node_id });
        canvasRef.current?.center(targetPort.connected_node_id);
      }
      requestAnimationFrame(() => {
        document
          .getElementById('boundary-panel-conditions')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('bc-param-h_W_m2K')?.focus();
      });
    }

    if (created > 0) {
      toast.success(
        `${created} boundary profile(s) created — complete h and other required inputs / 已建立條件，請完成 h 等必要輸入`,
      );
    } else if (targetPortId) {
      toast.warning(
        'Profiles already exist — complete the highlighted required inputs / Profile 已存在，請完成必要輸入',
      );
    } else {
      toast.success('All boundary profiles are complete / 所有邊界條件皆已完成');
    }
  };

  // --- guards ------------------------------------------------------------

  if (!projectId || projectStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-danger-500/30 bg-surface p-7 text-center">
          <XCircle size={22} className="mx-auto mb-3 text-danger-600" />
          <h1 className="text-[15px] font-bold text-ink-900">
            Unable to load boundary conditions.
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">無法載入邊界條件。</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/')}>
            Return to Project Info
          </Button>
        </div>
      </div>
    );
  }

  if (projectStatus === 'loading' || !draft) return <LoadingState />;

  const hasTopology = Boolean(network && Object.keys(network.nodes).length > 0);
  const blockingErrors = validation.errors.length;

  const completedSteps: BoundaryStep[] = [];
  if (activeScenarioId) completedSteps.push('scenario');
  if (set?.ambient.external_ambient_C != null) completedSteps.push('ambient');
  if (summary.portsAssigned > 0) completedSteps.push('surfaces');
  if (summary.convectionProfiles > 0) completedSteps.push('convection');
  if (summary.radiationProfiles > 0 || summary.solarLoads > 0) completedSteps.push('radiation');
  if (blockingErrors === 0 && hasTopology) completedSteps.push('validate');

  const checks: ReadinessCheck[] = [
    {
      label: 'Environment parameters are valid.',
      zh: '環境參數有效。',
      passed: set?.ambient.external_ambient_C != null,
    },
    {
      label: 'At least one convection path to ambient exists.',
      zh: '存在至少一條通往環境的對流路徑。',
      passed: summary.convectionProfiles > 0,
    },
    {
      label: 'Surface properties are assigned.',
      zh: '已指派表面性質。',
      passed: (set?.surface_properties.length ?? 0) > 0,
    },
    {
      label: 'Every boundary port has a condition.',
      zh: '所有邊界端口皆已指定條件。',
      passed: summary.portsTotal > 0 && summary.portsAssigned === summary.portsTotal,
    },
    {
      label: 'No invalid numeric values detected.',
      zh: '未偵測到無效數值。',
      passed: blockingErrors === 0,
    },
  ];

  const handleContinue = () => {
    if (blockingErrors > 0 || !set) return;
    handleSave();
    if (validation.warnings.length > 0) {
      setWarningConfirm(validation.warnings.length);
      return;
    }
    navigate(projectPath(projectId, 'network'));
  };

  // --- blocked state: no topology from Screen 05 (06 §15.3) ---------------

  if (!hasTopology) {
    return (
      <ScreenWorkspace
        title="Boundary Conditions"
        titleZh="邊界條件"
        descriptionZh="為已儲存的熱網路設定此情境的環境溫度、對流、輻射、太陽負載與固定溫度邊界。"
      >
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <Waves size={24} className="mx-auto mb-3 text-ink-400" />
            <p className="text-[14px] font-semibold text-ink-700">
              Boundary Conditions require a saved thermal graph topology.
            </p>
            <p className="mt-1 text-[12px] text-ink-400">
              邊界條件需要 05 已儲存的熱網路拓樸。
            </p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => navigate(projectPath(projectId, 'thermal-path'))}
            >
              Open 05 Thermal Path Builder / 前往 05
            </Button>
          </div>
        </div>
      </ScreenWorkspace>
    );
  }

  return (
    <ScreenWorkspace
      title="Boundary Conditions"
      titleZh="邊界條件"
      descriptionZh="為已儲存的熱網路設定此情境的邊界條件。拓樸在此唯讀，本畫面不進行求解。"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && <Badge tone="accent">READ ONLY / 唯讀</Badge>}
          <Badge tone={set?.status === 'ready_for_solve' ? 'ok' : 'warn'}>
            {(set?.status ?? 'draft').replace(/_/g, ' ').toUpperCase()}
          </Badge>
          <Badge tone={solverState === 'DIRTY' ? 'warn' : 'neutral'}>Solver {solverState}</Badge>
        </div>
      }
      metrics={
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile
            icon={<Sparkles size={13} />}
            label="Scenario Boundary Set"
            zh="情境邊界集"
            tooltip={T06.kpi.boundarySet}
            value={(set?.status ?? 'draft').replace(/_/g, ' ')}
            tone={set?.status === 'ready_for_solve' ? 'text-ok-600' : 'text-warn-600'}
          />
          <KpiTile
            icon={<Waves size={13} />}
            label="Boundary Ports"
            zh="邊界端口"
            tooltip={T06.kpi.boundaryPorts}
            value={`${summary.portsAssigned} / ${summary.portsTotal}`}
            status="assigned / 已指定"
            tone={
              summary.portsAssigned === summary.portsTotal ? 'text-ok-600' : 'text-warn-600'
            }
          />
          <KpiTile
            icon={<Thermometer size={13} />}
            label="Ambient"
            zh="環境溫度"
            tooltip={T06.kpi.ambient}
            value={formatNumber(set?.ambient.external_ambient_C, 1, '°C')}
            status="external / 外部"
          />
          <KpiTile
            icon={<Wind size={13} />}
            label="Convection"
            zh="對流"
            tooltip={T06.kpi.convection}
            value={`${summary.convectionProfiles} profiles`}
            status={`${summary.convectionMissingInputs} missing input`}
            tone={summary.convectionMissingInputs > 0 ? 'text-warn-600' : 'text-ink-900'}
          />
          <KpiTile
            icon={<Sun size={13} />}
            label="Radiation / Solar"
            zh="輻射 / 太陽"
            tooltip={T06.kpi.radiationSolar}
            value={`${summary.radiationProfiles} / ${summary.solarLoads}`}
            status="radiation / solar loads"
          />
          <KpiTile
            icon={<CircleCheck size={13} />}
            label="Solve Readiness"
            zh="求解就緒度"
            tooltip={T06.kpi.solveReadiness}
            value={
              blockingErrors > 0
                ? 'Blocked'
                : validation.warnings.length > 0
                  ? 'Warnings'
                  : 'Ready for 07'
            }
            status={`${summary.readinessPct}% complete`}
            tone={
              blockingErrors > 0
                ? 'text-danger-600'
                : validation.warnings.length > 0
                  ? 'text-warn-600'
                  : 'text-ok-600'
            }
          />
        </div>
      }
      stepper={
        <BoundaryStepper current={step} completed={completedSteps} onSelect={setStep} />
      }
      actionBar={
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-3">
          <Button
            icon={<ArrowLeft size={15} />}
            title={biTitle('Back to 05 Thermal Path Builder', '回到 05 熱路徑設定')}
            onClick={() => navigate(projectPath(projectId, 'thermal-path'))}
          >
            Back to 05
          </Button>
          <Button
            icon={<Sparkles size={15} />}
            disabled={readOnly}
            title={biTitle(
              'Create missing boundary profiles and open the first incomplete one',
              '建立缺少的邊界條件，並開啟第一個未完成項目',
            )}
            onClick={createBoundaryProfiles}
          >
            Create Boundary Profiles
          </Button>
          <Button
            disabled={readOnly || !selectedPort}
            title={biTitle('Apply to similar surfaces', '套用到方位相同的表面')}
            onClick={applyToSimilar}
          >
            Apply to Similar
          </Button>

          {blockingErrors > 0 && (
            <span className="text-[12px] font-medium text-danger-600">
              {blockingErrors} blocking error{blockingErrors > 1 ? 's' : ''} must be fixed before
              Screen 07 / 需先修正錯誤
            </span>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              icon={<Save size={15} />}
              disabled={readOnly || !dirty}
              title={biTitle('Save boundary set', '儲存邊界條件')}
              onClick={handleSave}
            >
              Save Boundary Set
            </Button>
            <Button
              variant="primary"
              trailingIcon={<ArrowRight size={15} />}
              disabled={blockingErrors > 0}
              title={biTitle('Continue to 07 Thermal Network', '前往 07 熱網路求解')}
              onClick={handleContinue}
            >
              Continue to 07
            </Button>
          </div>
        </div>
      }
    >
      <div
        className={`flex min-h-[30rem] flex-1 flex-col gap-3 lg:flex-row ${
          fullscreen ? 'fixed inset-0 z-30 min-h-0 bg-canvas p-3' : ''
        }`}
      >
        {!fullscreen && sidebarCollapsed && (
          <button
            type="button"
            title={biTitle('Expand boundary panels', '展開邊界條件面板')}
            aria-label={biTitle('Expand boundary panels', '展開邊界條件面板')}
            onClick={() => setSidebarCollapsed(false)}
            className="hidden min-h-24 shrink-0 items-start justify-center rounded-lg border border-line bg-surface pt-3 text-ink-500 hover:text-accent-600 lg:flex lg:w-10"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {!fullscreen && !sidebarCollapsed && (
          <aside className="relative flex w-full shrink-0 flex-col gap-2 overflow-y-auto pr-1 lg:w-[29.333rem]">
            <button
              type="button"
              title={biTitle('Collapse boundary panels', '向左收合邊界條件面板')}
              aria-label={biTitle('Collapse boundary panels', '向左收合邊界條件面板')}
              onClick={() => setSidebarCollapsed(true)}
              className="absolute top-2 right-3 z-10 hidden size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-400 shadow-sm hover:text-accent-600 lg:flex"
            >
              <ChevronLeft size={13} />
            </button>

            <SidebarSection
              id="boundary-panel-surface"
              index={1}
              title="Surface Properties"
              zh="表面性質"
              open={openPanels.surface}
              onToggle={() =>
                setOpenPanels((current) => ({ ...current, surface: !current.surface }))
              }
            >
              <SurfacePropertiesPanel
                groups={surfaceGroups}
                properties={set?.surface_properties ?? []}
                solarEnabled={solarEnabled}
                solarIrradiance_W_m2={set?.site.solar_irradiance_W_m2 ?? null}
                readOnly={readOnly}
                onChange={(property) => useBoundaryStore.getState().setSurfaceProperty(property)}
              />
            </SidebarSection>

            <SidebarSection
              id="boundary-panel-conditions"
              index={2}
              title="Boundary Conditions"
              zh="邊界條件"
              open={openPanels.conditions}
              onToggle={() =>
                setOpenPanels((current) => ({ ...current, conditions: !current.conditions }))
              }
            >
              <div className="mb-3 max-h-36 overflow-auto rounded-md border border-line p-1.5">
                <p className="px-1.5 pb-1 text-[10px] font-bold text-ink-500">
                  Boundary Ports / 邊界端口
                </p>
                {ports.map((port) => {
                  const status = portStatus(set, port);
                  const label = PORT_STATUS_LABELS[status];
                  return (
                    <button
                      key={port.id}
                      type="button"
                      onClick={() => {
                        setSelectedPortId(port.id);
                        setPreferredProfileId(null);
                        setSelection({ kind: 'node', id: port.connected_node_id });
                        canvasRef.current?.center(port.connected_node_id);
                      }}
                      title={biTitle(port.name, label.zh)}
                      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] ${
                        selectedPortId === port.id
                          ? 'bg-accent-100 font-semibold text-accent-700'
                          : 'text-ink-700 hover:bg-surface-muted'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{port.name}</span>
                      <Badge tone={label.tone as 'ok'}>{label.label}</Badge>
                    </button>
                  );
                })}
              </div>
              {selectedPort && set ? (
                <BoundaryInspector
                  port={selectedPort}
                  status={portStatus(set, selectedPort)}
                  profiles={profilesForPort(set, selectedPort.id)}
                  preferredProfileId={preferredProfileId}
                  preview={set.derived_preview.find(
                    (entry) => entry.boundary_port_id === selectedPort.id,
                  )}
                  validation={validation}
                  ambientTemperature_C={set.ambient.external_ambient_C}
                  solarEnabled={solarEnabled}
                  readOnly={readOnly}
                  onEditAmbient={editScenarioSettings}
                  onUpsertProfile={(profile) => useBoundaryStore.getState().upsertProfile(profile)}
                  onRemoveProfile={removeProfile}
                  onAddProfile={(type) => addProfileToPort(selectedPort.id, type)}
                />
              ) : (
                <BoundaryInspectorEmpty />
              )}
            </SidebarSection>

            <SidebarSection
              id="boundary-panel-summary"
              index={3}
              title="Boundary Summary"
              zh="邊界條件摘要"
              open={openPanels.summary}
              onToggle={() =>
                setOpenPanels((current) => ({ ...current, summary: !current.summary }))
              }
            >
              {set ? <BoundarySummaryCard set={set} summary={summary} /> : null}
            </SidebarSection>

            <SidebarSection
              id="boundary-panel-fixed"
              index={4}
              title="Fixed Temperature (optional)"
              zh="固定溫度（選填）"
              open={openPanels.fixed}
              onToggle={() =>
                setOpenPanels((current) => ({ ...current, fixed: !current.fixed }))
              }
            >
              <p className="mb-2 text-[10px] leading-relaxed text-ink-400">
                Advanced validation input for a known-temperature cold plate, chamber fixture or
                test interface. Normal outdoor operation should use ambient and convection.
                <span className="block">
                  用於已知溫度的冷板、環境箱治具或測試介面；一般戶外運作請使用環境與對流條件。
                </span>
              </p>
              <FixedTemperaturePanel
                rows={fixedRows}
                candidatePorts={fixedCandidates}
                readOnly={readOnly}
                onAdd={(portId) => addProfileToPort(portId, 'fixed_temperature_boundary')}
                onPatch={(profile) => useBoundaryStore.getState().upsertProfile(profile)}
                onRemove={removeProfile}
              />
            </SidebarSection>
          </aside>
        )}

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-surface ${
            fullscreen ? 'rounded-none' : 'rounded-lg'
          }`}
        >
          <BoundaryGraphToolbar
            tool={tool}
            layoutMode={layoutMode}
            zoom={zoom}
            showPorts={showPorts}
            showLabels={showLabels}
            fullscreen={fullscreen}
            onTool={setTool}
            onLayoutMode={(mode) => {
              setLayoutMode(mode);
              canvasRef.current?.runLayout(mode);
            }}
            onAutoLayout={() => canvasRef.current?.runLayout(layoutMode)}
            onFit={() => canvasRef.current?.fit()}
            onZoom={(delta) => canvasRef.current?.zoomBy(delta)}
            onValidate={handleValidate}
            onTogglePorts={() => setShowPorts((value) => !value)}
            onToggleLabels={() => setShowLabels((value) => !value)}
            onToggleFullscreen={() => setFullscreen((value) => !value)}
          />
          <div className="relative min-h-0 flex-1">
            <ThermalGraphCanvas
              ref={canvasRef}
              network={network!}
              selection={selection}
              tool={tool}
              showPorts={showPorts}
              showLabels={showLabels}
              layoutMode={layoutMode}
              readOnly
              hiddenComponentIds={EMPTY_HIDDEN_COMPONENTS}
              onSelect={selectGraphObject}
              onNodeMoved={() => undefined}
              onConnect={() => undefined}
              onContextMenu={() => undefined}
              onZoomChange={setZoom}
              onLayout={() => undefined}
              pendingSourceRef={pendingSourceRef}
            />

            {ports.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/80 p-6 text-center">
                <div>
                  <p className="text-[13px] font-semibold text-ink-700">
                    The current topology has no boundary ports.
                  </p>
                  <p className="mt-1 text-[12px] text-ink-400">
                    此拓樸沒有邊界端口，請先於 05 建立外部邊界。
                  </p>
                </div>
              </div>
            )}

            <BoundaryValidationOverlay
              validation={validation}
              checks={checks}
              onFocus={(message) => {
                if (!message.boundary_port_id) return;
                const port = ports.find((entry) => entry.id === message.boundary_port_id);
                setSelectedPortId(message.boundary_port_id);
                setPreferredProfileId(message.profile_id ?? null);
                setOpenPanels((current) => ({ ...current, conditions: true }));
                if (port) {
                  setSelection({ kind: 'node', id: port.connected_node_id });
                  canvasRef.current?.center(port.connected_node_id);
                }
              }}
            />
          </div>
        </section>
      </div>

      {warningConfirm != null && (
        <Modal
          title="Continue with warnings? / 有警告，仍要繼續？"
          description={`${warningConfirm} boundary assumption(s) remain. Screen 07 will solve with them as entered. / 尚有 ${warningConfirm} 項假設，07 會依現有設定求解。`}
          onClose={() => setWarningConfirm(null)}
          footer={
            <>
              <Button onClick={() => setWarningConfirm(null)}>Stay / 留在本頁</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setWarningConfirm(null);
                  navigate(projectPath(projectId, 'network'));
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

/** Steps whose panel the workspace scrolls to — kept for the stepper contract. */
export const BOUNDARY_STEP_IDS = BOUNDARY_STEPS.map((step) => step.id);
export { Copy as CopyIcon, TriangleAlert as WarnIcon };
