/**
 * Component inspector: what it works out from one component before drawing
 * a tab.
 *
 * The spec slices, the patch helpers that write them back, the option lists,
 * and the faces and areas the geometry rules derive. Recomputed on every
 * render; each tab reads the parts it shows.
 */

import {
  PACKAGE_TYPES,
  PACKAGE_TYPE_HINTS,
  GEOMETRY_RULES,
  cavityFilterBodyPrefill,
  isBodySourced,
  metalBaseExposedAreaMm2,
  metalBaseParameters,
  sourceAreaMm2,
  sourceFaceMm,
  spreadAreaMm2,
  spreadFaceMm,
  UNASSIGNED_ZONE,
  type Component,
  type ComponentGeometry,
  mountSpec,
  mountHasBlock,
  type MountSpec,
} from '@/domain/component';
import {
  coinAreaMm2,
  defaultMaterials,
  resolveTim,
  type MaterialDefaults,
} from '@/domain/materials';
import type { ProjectContext } from '@/domain/project';
import { completenessOf, completenessScore, validateComponent } from '@/domain/componentReadiness';
import { presetZones } from '@/thermal/graph/sharedStructure';

/** Writes a patch to one component; `fields` names what changed. */
export type PatchComponent = (id: string, patch: Partial<Component>, fields: string[]) => void;

export function deriveInspector(
  component: Component,
  onPatch: PatchComponent,
  projectMaterials: MaterialDefaults | undefined,
  projectContext: ProjectContext | undefined,
) {
  const spec = component.thermal_spec;
  const prep = component.architecture_prep;
  const materials = projectMaterials ?? defaultMaterials();
  const issues = validateComponent(component);
  const completeness = completenessOf(component);
  const score = completenessScore(completeness);

  const patchSpec = (patch: Partial<Component['thermal_spec']>, fields: string[]) =>
    onPatch(component.id, { thermal_spec: { ...spec, ...patch } }, fields);

  const patchGeometry = (patch: Partial<ComponentGeometry>) =>
    patchSpec({ geometry: { ...spec.geometry, ...patch } }, ['geometry']);

  /*
     A spec change that can turn this part into a body-based cavity filter, with
     the heat sink's own outline filled into the blank body L and W.

     A machined filter bolts down across most of the base, so those two numbers
     start out as Screen 01's and get trimmed from there. Retyping them is how
     the two come to disagree. It only ever fills a BLANK — a stated size is the
     engineer speaking, and is never overwritten.
  */
  const patchSpecPrefillingCavityFilter = (
    patch: Partial<Component['thermal_spec']>,
    fields: string[],
  ) => {
    const next = { ...spec, ...patch };
    const prefill = cavityFilterBodyPrefill(next, {
      L_mm: materials.hsk_base_L_mm?.value,
      W_mm: materials.hsk_base_W_mm?.value,
    });
    if (!prefill) {
      patchSpec(patch, fields);
      return;
    }
    onPatch(
      component.id,
      { thermal_spec: { ...next, geometry: { ...next.geometry, ...prefill } } },
      [...fields, 'geometry'],
    );
  };

  const patchHeatPathParameters = (
    patch: Record<string, number | string | boolean | null>,
    fields: string[],
  ) =>
    patchSpec(
      {
        heat_path: {
          ...spec.heat_path,
          parameters: { ...spec.heat_path.parameters, ...patch },
        },
      },
      fields,
    );

  const patchPrep = (patch: Partial<Component['architecture_prep']>) =>
    onPatch(component.id, { architecture_prep: { ...prep, ...patch } }, ['architecture_prep']);

  const zones = presetZones(projectContext?.base_structure ?? 'SINGLE_MAIN_BASE');
  const zoneOptions = [
    { value: UNASSIGNED_ZONE, label: 'Unassigned / 未指定' },
    ...zones.map((zone) => ({ value: zone.key, label: `${zone.name} / ${zone.zh}` })),
  ];
  // A structure change can orphan a zone a component still points at; showing
  // it keeps the select honest about what the component actually says.
  const zoneOrphaned =
    prep.preferred_base_zone !== UNASSIGNED_ZONE &&
    !zones.some((zone) => zone.key === prep.preferred_base_zone);
  if (zoneOrphaned) {
    zoneOptions.push({
      value: prep.preferred_base_zone,
      label: `${prep.preferred_base_zone} — not in this structure / 不屬於目前基座結構`,
    });
  }

  const heatPath = spec.heat_path.type;
  const metalBase = heatPath === 'DirectMetal';
  const metalBaseModel = metalBaseParameters(spec);
  const envelopeLabels = metalBase
    ? {
        L: { en: 'Body / Base Outer L', zh: '本體／底面外框長' },
        W: { en: 'Body / Base Outer W', zh: '本體／底面外框寬' },
        H: { en: 'Body H', zh: '本體高度' },
      }
    : {
        L: { en: 'Package L', zh: '封裝長' },
        W: { en: 'Package W', zh: '封裝寬' },
        H: { en: 'Package H', zh: '封裝高' },
      };
  // Rjc applies unless the dissipation is referenced to the surface itself.
  // This used to be `moduleSurface || ...`; ModuleSurface folded into
  // DirectMetal, and SurfaceBodyBased is the accurate test — a JunctionBased
  // metal face (a flanged transistor) does have an Rjc. The heat path is no
  // longer part of the test: a ferrite circulator taken out through board vias
  // is one isothermal body just as much as a filter bolted to a metal land.
  const surfaceReferenced = isBodySourced(spec);

  // SOT and QFP are no longer offered, but a project that stored one keeps it:
  // it is appended as an off-list row so the select shows the truth instead of
  // silently snapping to another package.
  const PACKAGE_TYPE_SET: ReadonlySet<string> = new Set<string>(PACKAGE_TYPES);
  const packageOptions = [
    ...PACKAGE_TYPES.map((type) => ({
      value: type,
      label: type,
      hint: `${PACKAGE_TYPE_HINTS[type].en}\n${PACKAGE_TYPE_HINTS[type].zh}`,
    })),
    ...(spec.package_type != null && !PACKAGE_TYPE_SET.has(spec.package_type)
      ? [
          {
            value: spec.package_type,
            label: `${spec.package_type} — no longer listed / 已不在清單`,
            hint: 'Stored by an earlier version. Pick the closest current package when you next review this part.\n由舊版存下的封裝型式。下次檢核這顆零件時，請改選目前清單中最接近的型式。',
          },
        ]
      : []),
  ];

  // How this part reaches the shared structure. Orthogonal to the heat path:
  // the same boss or heat pipe can sit under a coin, a via or a metal face.
  const mount = mountSpec(spec);
  const mountBlock = mountHasBlock(mount.type);
  /*
     What this pair of numbers actually is, which differs by mount.

     For a block it is the block's own footprint. For a heat pipe it is the
     CONDENSER's footprint where it meets the base — how much of the pipe is
     flattened or saddled in — and that has nothing to do with how big the part
     is: a 30x30 FPGA can feed a 6 mm pipe whose condenser section is 8 x 60.
     The field was labelled "Joint L/W" for both, which invited exactly that
     confusion.

     Either way it is the area the base spreads from, which is why it is the
     one number in the mount that always matters.
  */
  const mountFootprint =
    mount.type === 'VaporChamber'
      ? {
          label: 'Chamber',
          zh: '均熱板',
          tooltip:
            '均熱板貼在底座上的外形尺寸。這是底座擴散的起算面積 —— 均熱板的價值就在這裡，跟元件多大無關。',
        }
      : mount.type === 'EmbeddedHeatPipe'
        ? {
            label: 'Pipe under source',
            zh: '熱源下方熱管',
            tooltip:
              '熱管在熱源正下方那一段的壓平尺寸：長 = 穿越熱源的長度，寬 = 單一根管子壓平後的寬度（根數另外填）。長 × 寬 × 根數就是銅，會從熱源接觸面裡扣掉，剩下的才是走鋁底座擴散的那條並聯支路。',
          }
        : {
            label: 'Mount',
            zh: '接合面',
            tooltip: '凸台／小基座貼在底座上的外形尺寸。這是底座擴散的起算面積。',
          };
  const patchMount = (patch: Partial<MountSpec>) =>
    patchSpec({ mount: { ...mount, ...patch } }, ['mount']);
  const rule = GEOMETRY_RULES[heatPath];
  const resolvedTim = resolveTim(spec.tim, materials);
  const projectCoin = {
    L: materials.coin_L_mm?.value ?? null,
    W: materials.coin_W_mm?.value ?? null,
  };
  const sourceFace = sourceFaceMm(spec.geometry, heatPath);
  const spreadFace = spreadFaceMm(spec.geometry, heatPath, projectCoin);
  const sourceArea = sourceAreaMm2(spec.geometry, heatPath, spec.heat_path.parameters);
  const spreadArea = spreadAreaMm2(
    spec.geometry,
    heatPath,
    coinAreaMm2(materials),
    spec.heat_path.parameters,
  );
  const exposedArea = metalBaseExposedAreaMm2(spec);
  // Blank BLT means "use the material's"; a stored one means the build was
  // measured. The radio below is just that distinction, made visible.
  const bltCustom = spec.tim.blt_mm != null;

  const SOURCE_ORIGIN = {
    Coin: '= Package outline (soldered across its base) / 等於封裝外形（整個底面焊接）',
    TopSurface: '= Package outline (the case top) / 等於封裝外形（Case 上表面）',
    ModuleSurface:
      '= Package outline (specified module surface) / 等於封裝外形（原廠指定散熱面）',
  } as const;
  const spreadOrigin =
    rule.spread === 'project_coin'
      ? coinAreaMm2(materials) == null
        ? 'Needs the project coin size (Screen 01) / 需先於 Screen 01 設定銅塊尺寸'
        : 'From the project coin size / 取自專案銅塊尺寸'
      : rule.spread === 'board_spread'
        ? 'Derived: (L + board thickness) × (W + board thickness) / 由 45° 擴散推導'
        : 'No spreading on this path — heat leaves the face it entered / 此路徑無擴散，等於熱源面';

  return {
    spec,
    prep,
    materials,
    issues,
    completeness,
    score,
    patchSpec,
    patchGeometry,
    patchSpecPrefillingCavityFilter,
    patchHeatPathParameters,
    patchPrep,
    zoneOptions,
    heatPath,
    metalBase,
    metalBaseModel,
    envelopeLabels,
    surfaceReferenced,
    packageOptions,
    mount,
    mountBlock,
    mountFootprint,
    patchMount,
    rule,
    resolvedTim,
    sourceFace,
    spreadFace,
    sourceArea,
    spreadArea,
    exposedArea,
    bltCustom,
    SOURCE_ORIGIN,
    spreadOrigin,
  };
}

export type InspectorDerived = ReturnType<typeof deriveInspector>;

/** What every tab is given. */
export interface InspectorTabProps {
  component: Component;
  readOnly: boolean;
  onPatch: PatchComponent;
  derived: InspectorDerived;
}
