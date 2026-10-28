/**
 * Screen 04 heat path panel: what the stack-up drawing and the resistance chain
 * under it show for one component.
 *
 * Nothing here is a second copy of the thermal model. The chain is the subgraph
 * Screen 05 builds for ONE device — `buildComponentSubgraph` for the package
 * side, `buildMountChain` for whatever sits between HEAT_OUT and the base — and
 * each step's number is that edge's own `computeRth`. The panel and 05's edges
 * therefore cannot drift apart; if a formula changes, both move together.
 *
 * What it adds is presentation: which drawn layer each step belongs to, a
 * Chinese name for it, and which input is missing in words an engineer can act
 * on, instead of a parameter key.
 *
 * Two steps are left to the solve on purpose and shown as such: the spreading
 * into the shared base (its domain and Bi come from the whole project) and the
 * fins. The estimate at the bottom — limit minus this part's own rise down to
 * the base surface — is therefore a hand calculation, labelled as one.
 */

import {
  GEOMETRY_RULES,
  TEMPLATE_FOR_HEAT_PATH,
  isBodySourced,
  metalBaseExposedAreaMm2,
  metalBaseParameters,
  mountFootprintMm2,
  mountPipeCount,
  mountSpec,
  normalizeModuleReferenceLocation,
  powerWOf,
  sourceAreaMm2,
  sourceFaceMm,
  spreadAreaMm2,
  spreadFaceMm,
  spreadingDomainOf,
  type Component,
  type HeatPathType,
  type LimitType,
  type MetalBaseParameters,
  type ModuleReferenceLocation,
  type MountSpec,
  type SpreadingDomainSpec,
} from '@/domain/component';
import {
  coinAreaMm2,
  hskBaseAreaMm2,
  resolveTim,
  type MaterialDefaults,
} from '@/domain/materials';
import { valueOf } from '@/domain/sourcedValue';
import { buildComponentSubgraph } from '@/thermal/graph/networkBuilder';
import { MOUNT_ROLE_KEY, buildMountChain } from '@/thermal/graph/componentMount';
import { computeRth } from '@/thermal/resistance/calculators';
import type { ThermalEdge } from '@/thermal/types';

/** One colour each in the drawing, the card chips and the chain bar. */
export type HeatLayer =
  | 'die'
  | 'pkg'
  | 'face'
  | 'solder'
  | 'coin'
  | 'pcb'
  | 'via'
  | 'tim'
  | 'mount'
  | 'joint'
  | 'pipe'
  | 'base'
  | 'spread'
  | 'fins'
  | 'probe'
  | 'exposed';

/** The form cards, top to bottom in the order heat flows through them. */
export type PathCardId = 'src' | 'pkg' | 'face' | 'coin' | 'board' | 'tim' | 'mount' | 'base';

/** Which card answers for which drawn layer: a click on the drawing opens it. */
export const LAYER_CARD: Record<HeatLayer, PathCardId> = {
  die: 'src',
  probe: 'src',
  pkg: 'pkg',
  face: 'face',
  exposed: 'face',
  solder: 'coin',
  coin: 'coin',
  pcb: 'board',
  via: 'board',
  tim: 'tim',
  mount: 'mount',
  joint: 'mount',
  pipe: 'mount',
  base: 'base',
  spread: 'base',
  fins: 'base',
};

/** The layer a card stands for, when the card itself is pointed at. */
export const CARD_LAYER: Record<PathCardId, HeatLayer> = {
  src: 'die',
  pkg: 'pkg',
  face: 'face',
  coin: 'coin',
  board: 'via',
  tim: 'tim',
  mount: 'mount',
  base: 'base',
};

/** Layers that light up together: a die is inside its package, and so on. */
export const RELATED_LAYERS: Record<HeatLayer, HeatLayer[]> = {
  die: ['die', 'pkg'],
  probe: ['probe'],
  pkg: ['pkg', 'die'],
  face: ['face'],
  exposed: ['exposed', 'pkg'],
  solder: ['solder'],
  coin: ['coin', 'solder'],
  pcb: ['pcb', 'via'],
  via: ['via', 'pcb'],
  tim: ['tim'],
  mount: ['mount', 'joint', 'pipe'],
  joint: ['joint'],
  pipe: ['pipe'],
  base: ['base', 'spread'],
  spread: ['spread', 'base'],
  fins: ['fins'],
};

export type SegmentId =
  | 'rjc'
  | 'solder'
  | 'coin'
  | 'via'
  | 'tim'
  | 'block'
  | 'vc'
  | 'joint'
  | 'pipe'
  | 'spread';

export interface ChainSegment {
  id: SegmentId;
  layer: HeatLayer;
  name: string;
  /** °C/W for one device; null while an input is missing. */
  R: number | null;
  /** What has to be filled in before this step has a number. */
  missing: string[];
  /** Solved in 05/07 rather than here. */
  later: boolean;
  /** A second route beside the base, not a step in series with it. */
  parallel: boolean;
  /** A dry metal joint: drawn dark rather than in the TIM colour. */
  dry: boolean;
  note?: string;
}

export type TimKind = 'none' | 'missing' | 'direct' | 'measured' | 'material';

export interface TimView {
  kind: TimKind;
  name: string | null;
  k: number | null;
  /** Bond line actually used: the part's own when stated, else the material's. */
  blt: number | null;
  /** True when the part states its own bond line. */
  custom: boolean;
}

export interface Size2 {
  L: number | null;
  W: number | null;
}

export interface HeatPathView {
  heatPath: HeatPathType;
  mount: MountSpec;
  /** Junction behind an Rjc, or an isothermal body that is itself the source. */
  junction: boolean;
  limitType: LimitType;
  limit: number | null;
  /** Where on the body a surface limit is read, when stated. */
  refLoc: ModuleReferenceLocation | null;
  /** One device's dissipation, W. */
  powerW: number;
  qty: number;
  packageType: string | null;
  pkg: { L: number | null; W: number | null; H: number | null };
  sourceFace: Size2;
  sourceArea: number | null;
  spreadFace: Size2;
  spreadArea: number | null;
  /** The face the TIM covers. */
  timArea: number | null;
  /** The mount's footprint on the base (all pipes for an embedded pipe). */
  mountArea: number | null;
  pipes: number;
  /** Material of the joint under a bolted mount; null for a dry joint. */
  jointTimName: string | null;
  boardThickness: number | null;
  tim: TimView;
  via: { k: number | null; eff: number | null; kCustom: boolean; effCustom: boolean };
  solder: { t: number | null; k: number | null; voiding: number | null };
  coin: { L: number | null; W: number | null; t: number | null; k: number | null };
  base: { L: number | null; W: number | null; t: number | null; k: number | null; area: number | null };
  contactH: number | null;
  spreading: SpreadingDomainSpec;
  metal: MetalBaseParameters;
  exposedArea: number | null;
  segments: ChainSegment[];
  /** Everything missing across the chain, plus the limit. */
  missing: string[];
  /** Series steps from the limit's reference point to the base surface. */
  refR: number | null;
  /** One device's rise across `refR`, °C. */
  dT: number | null;
  /** How hot the base surface may get under this part before it hits its limit. */
  baseMax: number | null;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Positive finite override on the heat path, else null to inherit 01's. */
function viaOverride(component: Component, key: string): number | null {
  const value = component.thermal_spec.heat_path.parameters?.[key];
  return finite(value) && value > 0 ? value : null;
}

function timView(component: Component, materials: MaterialDefaults): TimView {
  const tim = component.thermal_spec.tim;
  const resolved = resolveTim(tim, materials);
  if (resolved.directContact) return { kind: 'direct', name: null, k: null, blt: null, custom: false };
  if (resolved.measuredInterface) {
    return { kind: 'measured', name: null, k: null, blt: null, custom: false };
  }
  if (resolved.missing) return { kind: 'missing', name: null, k: null, blt: null, custom: false };
  if (!resolved.material) return { kind: 'none', name: null, k: null, blt: null, custom: false };
  return {
    kind: 'material',
    name: resolved.material.name,
    k: resolved.k_W_mK,
    blt: resolved.thickness_mm,
    custom: !resolved.inherited,
  };
}

/**
 * Words for a parameter a step is missing. The calculator names keys; the
 * engineer needs the field, and for an area that depends on the path — a coin
 * TIM is missing the coin size, a via TIM is missing the E-PAD.
 */
function missingLabels(
  id: SegmentId,
  keys: string[],
  ctx: {
    heatPath: HeatPathType;
    sourceArea: number | null;
    spreadArea: number | null;
    tim: TimView;
    mount: MountSpec;
  },
): string[] {
  const area = (): string => {
    if (ctx.heatPath === 'DirectMetal') return '接觸面積';
    if (ctx.heatPath === 'Board') return ctx.sourceArea == null ? 'E-PAD 長寬' : '板厚';
    if (ctx.heatPath === 'Coin' && ctx.sourceArea != null) return '銅塊尺寸（01）';
    return '封裝長寬';
  };
  const label = (key: string): string => {
    switch (id) {
      case 'rjc':
        return 'Rjc';
      case 'solder':
        return key === 'area_mm2' ? '封裝長寬' : '焊料參數（01）';
      case 'coin':
        if (key === 'length_mm') return '銅塊厚度（01）';
        if (key === 'k_W_mK') return '銅 k（01）';
        return ctx.sourceArea == null ? '封裝長寬' : '銅塊尺寸（01）';
      case 'via':
        if (key === 'thickness_mm') return '板厚';
        if (key === 'effective_k_W_mK') return '導熱孔 k';
        return area();
      case 'tim':
        if (key === 'R_C_per_W') return '實測熱阻';
        if (key === 'h_c_W_m2K') return '接觸 h（01）';
        if (key === 'area_mm2') return area();
        if (ctx.tim.kind === 'material') return key === 'k_W_mK' ? '材料 k（01）' : '壓合厚度';
        return 'TIM 材料';
      case 'block': {
        const boss = ctx.mount.type === 'Pedestal';
        if (key === 'length_mm' || key === 'thickness_mm') return boss ? '凸台高度' : '基座厚度';
        if (key === 'k_W_mK') return '底座 k（01）';
        return boss ? '凸台長寬' : '基座長寬';
      }
      case 'vc':
        return '均熱板熱阻';
      case 'joint':
        if (key === 'thickness_mm') return '接合面 BLT';
        if (key === 'k_W_mK') return '接合面材料 k';
        if (key === 'h_c_W_m2K') return '接觸 h（01）';
        return ctx.mount.type === 'VaporChamber' ? '均熱板長寬' : '接合件長寬';
      case 'pipe':
        return ctx.mount.type === 'EmbeddedHeatPipe' ? '單根熱管熱阻' : '熱管熱阻';
      case 'spread':
        return '底座尺寸（01）';
    }
  };
  return [...new Set(keys.map(label))];
}

function segmentOf(
  id: SegmentId,
  layer: HeatLayer,
  name: string,
  edge: ThermalEdge,
  ctx: Parameters<typeof missingLabels>[2],
  extra: Partial<ChainSegment> = {},
): ChainSegment {
  // Re-run the edge's own calculator for the keys it lacks; the edge stores
  // only a sentence about them.
  const computed = computeRth(edge.method, edge.parameters ?? {});
  const missing =
    computed.value != null
      ? []
      : computed.missing.length > 0
        ? missingLabels(id, computed.missing, ctx)
        : [`${name}數值需大於 0`];
  return {
    id,
    layer,
    name,
    R: computed.value,
    missing,
    later: false,
    parallel: false,
    dry: false,
    ...extra,
  };
}

/**
 * Everything the heat path panel draws for one component, for one device.
 */
export function heatPathView(component: Component, materials: MaterialDefaults): HeatPathView {
  const spec = component.thermal_spec;
  const heatPath = spec.heat_path.type;
  const parameters = spec.heat_path.parameters;
  const geometry = spec.geometry;
  const mount = mountSpec(spec);
  const junction = !isBodySourced(spec);
  const coinArea = coinAreaMm2(materials);
  const sourceFace = sourceFaceMm(geometry, heatPath);
  const sourceArea = sourceAreaMm2(geometry, heatPath, parameters);
  const spreadFace = spreadFaceMm(geometry, heatPath, {
    L: materials.coin_L_mm?.value ?? null,
    W: materials.coin_W_mm?.value ?? null,
  });
  const spreadArea = spreadAreaMm2(geometry, heatPath, coinArea, parameters);
  const tim = timView(component, materials);
  const ctx = { heatPath, sourceArea, spreadArea, tim, mount };

  // One device: the panel is about this part, not the ×4 it may stand for.
  const templateId = TEMPLATE_FOR_HEAT_PATH[heatPath];
  const subgraph = buildComponentSubgraph(
    { ...component, qty: 1 },
    { templateId, qtyModel: 'AGGREGATE', materials },
  );

  const segments: ChainSegment[] = [];
  let timEdge: ThermalEdge | null = null;
  for (const edge of subgraph?.edges ?? []) {
    switch (edge.type) {
      case 'package_rjc':
        segments.push(segmentOf('rjc', 'die', 'Rjc', edge, ctx));
        break;
      case 'solder':
        segments.push(segmentOf('solder', 'solder', '焊料', edge, ctx));
        break;
      case 'conduction':
        segments.push(segmentOf('coin', 'coin', '銅塊', edge, ctx));
        break;
      case 'thermal_via':
        segments.push(segmentOf('via', 'via', '導熱孔', edge, ctx));
        break;
      case 'tim': {
        timEdge = edge;
        const name =
          tim.kind === 'direct' ? '乾接觸' : tim.kind === 'measured' ? '實測介面' : 'TIM';
        segments.push(segmentOf('tim', 'tim', name, edge, ctx, { dry: tim.kind === 'direct' }));
        break;
      }
      // The exposed surface of a metal body goes to ambient; Screen 06 owns it.
      default:
        break;
    }
  }

  // The mount, exactly as 05 materialises it when the port is connected.
  const portNode = subgraph?.nodes.find((node) => (node.ports?.length ?? 0) > 0);
  const timExit = timEdge?.parameters?.area_mm2;
  const chain = portNode
    ? buildMountChain({
        portNodeId: portNode.id,
        targetNodeId: 'NODE_HSK_BASE',
        componentRef: component.id,
        mount,
        materials,
        sourceAreaMm2: finite(timExit) && timExit > 0 ? timExit : null,
        // A metal body that is its own source reads the patch average; see
        // `spreadingVariant.ts`.
        psiVariant: templateId === 'DIRECT_METAL' && !junction ? 'avg' : 'max',
        partName: component.name,
      })
    : null;
  for (const edge of chain?.edges ?? []) {
    const role = edge.metadata?.[MOUNT_ROLE_KEY];
    if (role === 'BLOCK') {
      const spreads = edge.method === 'spreading_disc';
      segments.push(
        segmentOf('block', 'mount', mount.type === 'Pedestal' ? '凸台' : '小基座', edge, ctx, {
          note: spreads ? '比元件大，以擴散計算' : undefined,
        }),
      );
    } else if (role === 'VAPOR_CHAMBER') {
      segments.push(segmentOf('vc', 'pipe', '均熱板', edge, ctx));
    } else if (role === 'BASE_JOINT') {
      const dry = mount.joint_tim_id == null;
      segments.push(
        segmentOf('joint', 'joint', dry ? '接合面（乾）' : '接合面', edge, ctx, {
          dry,
          // Under a local block the joint is one of two routes into the base.
          parallel: mount.type === 'SmallBaseHeatPipe',
        }),
      );
    } else if (role === 'HEAT_PIPE') {
      const pipes = mountPipeCount(mount);
      segments.push(
        segmentOf(
          'pipe',
          'pipe',
          mount.type === 'EmbeddedHeatPipe' ? `熱管 ×${pipes}` : '熱管',
          edge,
          ctx,
          { parallel: true },
        ),
      );
    }
  }
  segments.push({
    id: 'spread',
    layer: 'base',
    name: '底座擴散',
    R: null,
    missing: [],
    later: true,
    parallel: false,
    dry: false,
    note: '整片底座、擴散範圍與 Bi 由 04／05 一起求解',
  });

  // From where the limit is judged down to the base surface, series only.
  const limitType = spec.limit_type;
  const limit = valueOf(spec.limit_C);
  const series = segments.filter((segment) => !segment.parallel && !segment.later);
  const fromRef = limitType === 'Tj' ? series : series.filter((segment) => segment.id !== 'rjc');
  const refR = fromRef.every((segment) => segment.R != null)
    ? fromRef.reduce((sum, segment) => sum + (segment.R ?? 0), 0)
    : null;
  const powerW = powerWOf(component);
  const dT = refR != null && powerW > 0 ? powerW * refR : null;
  const missing = [...new Set(segments.flatMap((segment) => segment.missing))];
  if (limit == null) missing.unshift('限溫');

  const stated = (key: 'via_effective_k_W_mK' | 'via_efficiency') => viaOverride(component, key);
  return {
    heatPath,
    mount,
    junction,
    limitType,
    limit,
    refLoc: normalizeModuleReferenceLocation(spec.limit_reference_note) ?? null,
    powerW,
    qty: component.qty,
    packageType: spec.package_type,
    pkg: { L: geometry.package_L_mm, W: geometry.package_W_mm, H: geometry.package_H_mm },
    sourceFace,
    sourceArea,
    spreadFace,
    spreadArea,
    timArea: heatPath === 'DirectMetal' ? sourceArea : spreadArea,
    mountArea: mountFootprintMm2(mount),
    pipes: mountPipeCount(mount),
    jointTimName:
      mount.joint_tim_id == null
        ? null
        : (materials.tim.find((entry) => entry.id === mount.joint_tim_id)?.name ?? null),
    boardThickness: GEOMETRY_RULES[heatPath].thickness === 'board' ? geometry.board_thickness_mm : null,
    tim,
    via: {
      k: stated('via_effective_k_W_mK') ?? materials.via_effective_k_W_mK.value,
      eff: stated('via_efficiency') ?? materials.via_efficiency.value,
      kCustom: stated('via_effective_k_W_mK') != null,
      effCustom: stated('via_efficiency') != null,
    },
    solder: {
      t: materials.solder_thickness_mm.value,
      k: materials.solder_k_W_mK.value,
      voiding: materials.solder_voiding.value,
    },
    coin: {
      L: materials.coin_L_mm?.value ?? null,
      W: materials.coin_W_mm?.value ?? null,
      t: materials.coin_thickness_mm?.value ?? null,
      k: materials.copper_k_W_mK.value,
    },
    base: {
      L: materials.hsk_base_L_mm?.value ?? null,
      W: materials.hsk_base_W_mm?.value ?? null,
      t: materials.hsk_base_thickness_mm?.value ?? null,
      k: materials.hsk_base_k_W_mK.value,
      area: hskBaseAreaMm2(materials),
    },
    contactH: materials.contact_conductance_W_m2K.value,
    spreading: spreadingDomainOf(spec),
    metal: metalBaseParameters(spec),
    exposedArea: metalBaseExposedAreaMm2(spec),
    segments,
    missing,
    refR,
    dT,
    baseMax: dT != null && limit != null ? limit - dT : null,
  };
}

/** Resistance as an engineer reads it: more digits the smaller it is. */
export function formatR(R: number | null): string {
  if (R == null || !Number.isFinite(R)) return '—';
  if (R >= 10) return R.toFixed(1);
  if (R >= 1) return R.toFixed(2);
  if (R >= 0.1) return R.toFixed(3);
  return R.toFixed(4);
}

export function formatMm(value: number | null | undefined): string {
  return finite(value) ? String(+value.toFixed(2)) : '—';
}

export function formatArea(area: number | null | undefined): string {
  if (!finite(area)) return '—';
  return area >= 1000 ? Math.round(area).toLocaleString('en-US') : area.toFixed(1);
}
