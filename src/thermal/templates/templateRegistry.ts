/**
 * The six V1 architecture templates — 05 §8, §11.
 *
 * Each ends at a PORT, never at a named shared node (05 §10, §61). Step 4 wires
 * `HEAT_OUT` to whichever zone the engineer chooses, so a template is reusable
 * across a single main base, a three-zone base or functional zones.
 */

import type { ThermalTemplate } from './types';
import type { ArchitectureTemplate } from '@/domain/component';

const HEAT_OUT_PORT = {
  kind: 'HEAT_OUT' as const,
  label: 'Heat Out',
  labelZh: '主要散熱出口',
  required: true,
};

/** Junction → Case/EPAD → Solder → Copper Coin → TIM → HEAT_OUT (05 §11). */
const BOTTOM_COOL_COIN: ThermalTemplate = {
  id: 'BOTTOM_COOL_COIN',
  version: '1.0',
  name: 'Bottom Cool + Copper Coin',
  nameZh: '底部散熱 + 銅幣',
  description: 'Heat leaves through the package base into a copper coin, then a TIM.',
  descriptionZh: '熱由封裝底部經銅幣與熱介面材料導出。',
  typicalUse: ['RF devices', 'High power ICs'],
  nodes: [
    { role: 'JUNCTION', label: 'Junction', labelZh: '接面', type: 'junction', heatSource: true },
    { role: 'CASE', label: 'Case', labelZh: '外殼', type: 'case' },
    { role: 'SOLDER', label: 'Solder', labelZh: '焊料', type: 'solder_interface' },
    { role: 'COIN', label: 'Copper Coin', labelZh: '銅幣', type: 'copper_coin' },
    { role: 'TIM', label: 'TIM', labelZh: '介面材料', type: 'tim_interface' },
  ],
  edges: [
    {
      fromRole: 'JUNCTION',
      toRole: 'CASE',
      type: 'package_rjc',
      method: 'direct_rth',
      label: 'Rjc',
      labelZh: '封裝熱阻',
      parameterLinks: { R_C_per_W: 'thermal_spec.r_jc_C_per_W' },
      requiredParameters: ['R_C_per_W'],
    },
    // The preform between the package base and the coin. Voiding derates the
    // joint area, so this is not plain conduction.
    {
      fromRole: 'CASE',
      toRole: 'SOLDER',
      type: 'solder',
      method: 'solder_voiding',
      label: 'Solder',
      labelZh: '焊料層',
      parameterLinks: {
        thickness_mm: 'materials.solder_thickness_mm',
        k_W_mK: 'materials.solder_k_W_mK',
        area_mm2: 'thermal_spec.geometry.source_area',
        voiding: 'materials.solder_voiding',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    // Through the coin itself: heat enters the joint face and leaves the wider
    // heatsink face, so the effective area is the mean of the two.
    {
      fromRole: 'SOLDER',
      toRole: 'COIN',
      type: 'conduction',
      method: 'conduction_LkA',
      label: 'Coin conduction',
      labelZh: '銅幣導熱',
      parameterLinks: {
        length_mm: 'materials.coin_thickness_mm',
        k_W_mK: 'materials.copper_k_W_mK',
        area_mm2: 'thermal_spec.geometry.spreading_area',
      },
      requiredParameters: ['length_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'COIN',
      toRole: 'TIM',
      type: 'tim',
      method: 'tim_thickness_k',
      label: 'TIM',
      labelZh: '熱介面材料',
      parameterLinks: {
        thickness_mm: 'thermal_spec.tim.thickness_mm',
        k_W_mK: 'thermal_spec.tim.k_W_mK',
        // The TIM sits under the coin's heatsink face, not under the joint.
        area_mm2: 'thermal_spec.geometry.spread_area',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'TIM',
      toRole: 'HEAT_OUT',
      type: 'contact',
      method: 'direct_rth',
      label: 'Contact',
      labelZh: '接觸',
      requiredParameters: ['R_C_per_W'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [
    { path: 'thermal_spec.r_jc_C_per_W', label: 'Rjc', labelZh: '接面熱阻' },
    { path: 'thermal_spec.geometry.source_area', label: 'Source area', labelZh: '熱源面積' },
    { path: 'thermal_spec.geometry.spread_area', label: 'Coin area', labelZh: '銅塊面積' },
    { path: 'materials.coin_thickness_mm', label: 'Coin thickness', labelZh: '銅塊厚度' },
    { path: 'thermal_spec.tim.k_W_mK', label: 'TIM k', labelZh: 'TIM 導熱係數' },
    { path: 'thermal_spec.tim.thickness_mm', label: 'TIM thickness', labelZh: 'TIM 厚度' },
  ],
};

/** Junction → Case/EPAD → PCB Thermal Via Region → TIM/Contact → HEAT_OUT. */
const BOTTOM_COOL_VIA: ThermalTemplate = {
  id: 'BOTTOM_COOL_VIA',
  version: '1.0',
  name: 'Bottom Cool + Thermal Via',
  nameZh: '底部散熱 + 導熱孔',
  description: 'Heat leaves through the package base into a PCB thermal via array.',
  descriptionZh: '熱由封裝底部經 PCB 導熱孔陣列導出。',
  typicalUse: ['Digital ICs', 'DDR', 'Low to medium power'],
  nodes: [
    { role: 'JUNCTION', label: 'Junction', labelZh: '接面', type: 'junction', heatSource: true },
    { role: 'EPAD', label: 'EPAD', labelZh: '散熱墊', type: 'epad' },
    { role: 'VIA', label: 'Thermal Via', labelZh: '導熱孔', type: 'thermal_via' },
    { role: 'TIM', label: 'TIM', labelZh: '介面材料', type: 'tim_interface' },
  ],
  edges: [
    {
      fromRole: 'JUNCTION',
      toRole: 'EPAD',
      type: 'package_rjc',
      method: 'direct_rth',
      label: 'Rjc',
      labelZh: '封裝熱阻',
      parameterLinks: { R_C_per_W: 'thermal_spec.r_jc_C_per_W' },
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'EPAD',
      toRole: 'VIA',
      type: 'thermal_via',
      method: 'via_array',
      label: 'Via array',
      labelZh: '導熱孔陣列',
      parameterLinks: {
        thickness_mm: 'thermal_spec.geometry.board_thickness_mm',
        // The array spreads as it conducts, so neither face alone is right.
        area_mm2: 'thermal_spec.geometry.spreading_area',
        effective_k_W_mK: 'materials.via_effective_k_W_mK',
        via_efficiency: 'materials.via_efficiency',
      },
      requiredParameters: ['thickness_mm', 'effective_k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'VIA',
      toRole: 'TIM',
      type: 'tim',
      method: 'tim_thickness_k',
      label: 'TIM',
      labelZh: '熱介面材料',
      parameterLinks: {
        thickness_mm: 'thermal_spec.tim.thickness_mm',
        k_W_mK: 'thermal_spec.tim.k_W_mK',
        area_mm2: 'thermal_spec.geometry.spread_area',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'TIM',
      toRole: 'HEAT_OUT',
      type: 'contact',
      method: 'direct_rth',
      label: 'Contact',
      labelZh: '接觸',
      requiredParameters: ['R_C_per_W'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [
    { path: 'thermal_spec.r_jc_C_per_W', label: 'Rjc', labelZh: '接面熱阻' },
    { path: 'thermal_spec.geometry.board_thickness_mm', label: 'PCB thickness', labelZh: '板厚' },
    { path: 'thermal_spec.geometry.source_area', label: 'E-PAD area', labelZh: 'E-PAD 面積' },
  ],
};

/** Junction → Lid/Case → TIM → HEAT_OUT. */
const TOP_COOL_LID: ThermalTemplate = {
  id: 'TOP_COOL_LID',
  version: '1.1',
  name: 'Top Cool + Lid',
  nameZh: '頂部散熱 + 金屬蓋',
  description: 'Heat leaves through the package lid and TIM to the heat-out interface.',
  descriptionZh: '熱由封裝上蓋經 TIM 導出至主要散熱出口。',
  typicalUse: ['FPGA', 'ASIC', 'Lidded BGA'],
  nodes: [
    { role: 'JUNCTION', label: 'Junction', labelZh: '接面', type: 'junction', heatSource: true },
    { role: 'LID', label: 'Lid', labelZh: '上蓋', type: 'lid' },
    { role: 'TIM', label: 'TIM', labelZh: '介面材料', type: 'tim_interface' },
  ],
  edges: [
    {
      fromRole: 'JUNCTION',
      toRole: 'LID',
      type: 'package_rjc',
      method: 'direct_rth',
      label: 'Rjc',
      labelZh: '封裝熱阻',
      parameterLinks: { R_C_per_W: 'thermal_spec.r_jc_C_per_W' },
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'LID',
      toRole: 'TIM',
      type: 'tim',
      method: 'tim_thickness_k',
      label: 'TIM',
      labelZh: '熱介面材料',
      parameterLinks: {
        thickness_mm: 'thermal_spec.tim.thickness_mm',
        k_W_mK: 'thermal_spec.tim.k_W_mK',
        area_mm2: 'thermal_spec.geometry.spread_area',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'TIM',
      toRole: 'HEAT_OUT',
      type: 'contact',
      method: 'direct_rth',
      label: 'Contact',
      labelZh: '接觸',
      requiredParameters: ['R_C_per_W'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [
    { path: 'thermal_spec.r_jc_C_per_W', label: 'Rjc', labelZh: '接面熱阻' },
    { path: 'thermal_spec.tim.k_W_mK', label: 'TIM k', labelZh: 'TIM 導熱係數' },
  ],
};

/** Manufacturer reference surface/baseplate → TIM → HEAT_OUT. No Rjc applies. */
const MODULE_SURFACE_TIM: ThermalTemplate = {
  id: 'MODULE_SURFACE_TIM',
  version: '1.0',
  name: 'Module Surface + TIM',
  nameZh: '模組散熱面 + TIM',
  description:
    'Dissipation is injected at the manufacturer-defined surface or baseplate, then crosses the installed TIM.',
  descriptionZh: '功耗由原廠指定的散熱面或底板節點注入，再經實際安裝的 TIM 導出。',
  typicalUse: ['Power modules', 'Integrated heatsink modules', 'Baseplate-rated modules'],
  nodes: [
    {
      role: 'MODULE_SURFACE',
      label: 'Surface / Baseplate',
      labelZh: '散熱面／底板',
      type: 'case',
      heatSource: true,
    },
    { role: 'TIM', label: 'TIM', labelZh: '介面材料', type: 'tim_interface' },
  ],
  edges: [
    {
      fromRole: 'MODULE_SURFACE',
      toRole: 'TIM',
      type: 'tim',
      method: 'tim_thickness_k',
      label: 'TIM',
      labelZh: '熱介面材料',
      parameterLinks: {
        thickness_mm: 'thermal_spec.tim.thickness_mm',
        k_W_mK: 'thermal_spec.tim.k_W_mK',
        area_mm2: 'thermal_spec.geometry.spread_area',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'TIM',
      toRole: 'HEAT_OUT',
      type: 'contact',
      method: 'direct_rth',
      label: 'Heat out',
      labelZh: '散熱出口',
      requiredParameters: ['R_C_per_W'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [
    { path: 'thermal_spec.tim.k_W_mK', label: 'TIM k', labelZh: 'TIM 導熱係數' },
    { path: 'thermal_spec.tim.thickness_mm', label: 'TIM thickness', labelZh: 'TIM 厚度' },
    {
      path: 'thermal_spec.geometry.source_area',
      label: 'Surface contact area',
      labelZh: '散熱面接觸面積',
    },
  ],
};

/** Die/Junction → TIM → Pedestal/Base Contact → HEAT_OUT. */
const BARE_DIE: ThermalTemplate = {
  id: 'BARE_DIE',
  version: '1.0',
  name: 'Bare Die',
  nameZh: '裸晶',
  description: 'Die couples directly into a TIM and base contact.',
  descriptionZh: '裸晶直接經 TIM 與基座接觸導熱。',
  typicalUse: ['Bare die', 'Flip chip'],
  nodes: [
    { role: 'DIE', label: 'Die', labelZh: '晶粒', type: 'die', heatSource: true },
    { role: 'TIM', label: 'TIM', labelZh: '介面材料', type: 'tim_interface' },
    { role: 'CONTACT', label: 'Base Contact', labelZh: '基座接觸', type: 'pedestal' },
  ],
  edges: [
    {
      fromRole: 'DIE',
      toRole: 'TIM',
      type: 'tim',
      method: 'tim_thickness_k',
      label: 'TIM',
      labelZh: '熱介面材料',
      parameterLinks: {
        thickness_mm: 'thermal_spec.tim.thickness_mm',
        k_W_mK: 'thermal_spec.tim.k_W_mK',
        area_mm2: 'thermal_spec.geometry.spread_area',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'TIM',
      toRole: 'CONTACT',
      type: 'contact',
      method: 'contact_area',
      label: 'Contact',
      labelZh: '接觸',
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'CONTACT',
      toRole: 'HEAT_OUT',
      type: 'conduction',
      method: 'conduction_LkA',
      label: 'Base conduction',
      labelZh: '基座導熱',
      requiredParameters: ['length_mm', 'k_W_mK', 'area_mm2'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [
    { path: 'thermal_spec.tim.k_W_mK', label: 'TIM k', labelZh: 'TIM 導熱係數' },
    { path: 'thermal_spec.geometry.source_area', label: 'Source area', labelZh: '熱源面積' },
  ],
};

/**
 * Junction → Case → TIM → Small Base, which then branches to a direct base path
 * AND a heat pipe path (05 §11). This is the parallel case the graph must support.
 */
const SMALL_BASE_HEAT_PIPE: ThermalTemplate = {
  id: 'SMALL_BASE_HEAT_PIPE',
  version: '1.0',
  name: 'Small Base + Heat Pipe',
  nameZh: '小基座 + 熱管',
  description: 'Heat reaches a small base, then splits between direct conduction and a heat pipe.',
  descriptionZh: '熱先到小基座，再分流至直接導熱與熱管兩條並聯路徑。',
  typicalUse: ['High power RF', 'Remote heat transport'],
  nodes: [
    { role: 'JUNCTION', label: 'Junction', labelZh: '接面', type: 'junction', heatSource: true },
    { role: 'CASE', label: 'Case', labelZh: '外殼', type: 'case' },
    { role: 'TIM', label: 'TIM', labelZh: '介面材料', type: 'tim_interface' },
    { role: 'SMALL_BASE', label: 'Small Base', labelZh: '小基座', type: 'small_base' },
    { role: 'HP_EVAP', label: 'HP Evaporator', labelZh: '熱管蒸發端', type: 'heat_pipe_evaporator' },
  ],
  edges: [
    {
      fromRole: 'JUNCTION',
      toRole: 'CASE',
      type: 'package_rjc',
      method: 'direct_rth',
      label: 'Rjc',
      labelZh: '封裝熱阻',
      parameterLinks: { R_C_per_W: 'thermal_spec.r_jc_C_per_W' },
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'CASE',
      toRole: 'TIM',
      type: 'tim',
      method: 'tim_thickness_k',
      label: 'TIM',
      labelZh: '熱介面材料',
      parameterLinks: {
        thickness_mm: 'thermal_spec.tim.thickness_mm',
        k_W_mK: 'thermal_spec.tim.k_W_mK',
        area_mm2: 'thermal_spec.geometry.spread_area',
      },
      requiredParameters: ['thickness_mm', 'k_W_mK', 'area_mm2'],
    },
    {
      fromRole: 'TIM',
      toRole: 'SMALL_BASE',
      type: 'conduction',
      method: 'conduction_LkA',
      label: 'Small base',
      labelZh: '小基座導熱',
      requiredParameters: ['length_mm', 'k_W_mK', 'area_mm2'],
    },
    // Branch 1 — direct conduction out of the small base.
    {
      fromRole: 'SMALL_BASE',
      toRole: 'DIRECT_BASE_OUT',
      type: 'conduction',
      method: 'conduction_LkA',
      label: 'Direct conduction',
      labelZh: '直接導熱',
      requiredParameters: ['length_mm', 'k_W_mK', 'area_mm2'],
    },
    // Branch 2 — heat pipe, in parallel with branch 1.
    {
      fromRole: 'SMALL_BASE',
      toRole: 'HP_EVAP',
      type: 'contact',
      method: 'direct_rth',
      label: 'HP contact',
      labelZh: '熱管接觸',
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'HP_EVAP',
      toRole: 'HEAT_PIPE_OUT',
      type: 'heat_pipe',
      method: 'direct_rth',
      label: 'Heat pipe',
      labelZh: '熱管',
      requiredParameters: ['R_C_per_W'],
    },
  ],
  ports: [
    {
      kind: 'DIRECT_BASE_OUT',
      label: 'Direct Base Out',
      labelZh: '直接基座出口',
      required: true,
    },
    { kind: 'HEAT_PIPE_OUT', label: 'Heat Pipe Out', labelZh: '熱管出口', required: true },
  ],
  requiredComponentFields: [
    { path: 'thermal_spec.r_jc_C_per_W', label: 'Rjc', labelZh: '接面熱阻' },
  ],
};

/** Junction/Case → Contact → Metal Mount → HEAT_OUT. */
const DIRECT_METAL: ThermalTemplate = {
  id: 'DIRECT_METAL',
  version: '1.0',
  name: 'Direct Metal Mount',
  nameZh: '直接金屬鎖附',
  description: 'Component is mounted straight onto metal with no board path.',
  descriptionZh: '元件直接鎖附於金屬結構，不經板級路徑。',
  typicalUse: ['Filters', 'Duplexers', 'Mechanical mounts'],
  nodes: [
    { role: 'JUNCTION', label: 'Junction', labelZh: '接面', type: 'junction', heatSource: true },
    { role: 'CONTACT', label: 'Contact', labelZh: '接觸面', type: 'case' },
    { role: 'MOUNT', label: 'Metal Mount', labelZh: '金屬座', type: 'pedestal' },
  ],
  edges: [
    {
      fromRole: 'JUNCTION',
      toRole: 'CONTACT',
      type: 'package_rjc',
      method: 'direct_rth',
      label: 'Rjc',
      labelZh: '封裝熱阻',
      parameterLinks: { R_C_per_W: 'thermal_spec.r_jc_C_per_W' },
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'CONTACT',
      toRole: 'MOUNT',
      type: 'contact',
      method: 'contact_area',
      label: 'Contact',
      labelZh: '接觸熱阻',
      requiredParameters: ['R_C_per_W'],
    },
    {
      fromRole: 'MOUNT',
      toRole: 'HEAT_OUT',
      type: 'conduction',
      method: 'conduction_LkA',
      label: 'Mount conduction',
      labelZh: '金屬座導熱',
      requiredParameters: ['length_mm', 'k_W_mK', 'area_mm2'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [
    { path: 'thermal_spec.r_jc_C_per_W', label: 'Rjc', labelZh: '接面熱阻' },
  ],
};

/** An empty starting point the engineer fills in by hand. */
const CUSTOM: ThermalTemplate = {
  id: 'CUSTOM',
  version: '1.0',
  name: 'Custom',
  nameZh: '自訂',
  description: 'A single heat source node and one port; build the rest by hand.',
  descriptionZh: '只產生一個熱源節點與一個出口，其餘手動建立。',
  typicalUse: ['Unusual architectures'],
  nodes: [
    { role: 'JUNCTION', label: 'Junction', labelZh: '接面', type: 'junction', heatSource: true },
  ],
  edges: [
    {
      fromRole: 'JUNCTION',
      toRole: 'HEAT_OUT',
      type: 'custom',
      method: 'direct_rth',
      label: 'Custom path',
      labelZh: '自訂路徑',
      requiredParameters: ['R_C_per_W'],
    },
  ],
  ports: [HEAT_OUT_PORT],
  requiredComponentFields: [],
};

export const TEMPLATES: Record<string, ThermalTemplate> = {
  BOTTOM_COOL_COIN,
  BOTTOM_COOL_VIA,
  TOP_COOL_LID,
  MODULE_SURFACE_TIM,
  BARE_DIE,
  SMALL_BASE_HEAT_PIPE,
  DIRECT_METAL,
  CUSTOM,
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export function getTemplate(id: ArchitectureTemplate | string): ThermalTemplate | null {
  return TEMPLATES[id] ?? null;
}
