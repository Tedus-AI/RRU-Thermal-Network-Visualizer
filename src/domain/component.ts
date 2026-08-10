/**
 * Component record — mirrors the component data already owned by the
 * 5G RRU Quick Volume Evaluation Tool (00 §5.1), plus the thermal_profile
 * extension (00 §5.3).
 *
 * 00 §5.2: this tool must NOT maintain a second independent component master
 * library. These records are imported (Screen 02) and extended, not re-authored.
 */

export type BoardType = 'RF' | 'DIGITAL' | 'POWER' | 'FILTER' | 'OTHER';

/** Graph-specific extension kept out of the shared component record. */
export interface ThermalProfile {
  architecture: string;
  package_model: 'RJC' | 'RJB' | 'RJA' | 'CUSTOM';
  base_zone: string | null;
  cooling_destination: string | null;
  coin_enabled: boolean;
  thermal_via_enabled: boolean;
  heat_pipe_enabled: boolean;
  template_id: string | null;
}

export interface ComponentRecord {
  id: string;
  component: string;
  qty: number;
  power_W: number;
  height_mm?: number;
  pad_L_mm?: number;
  pad_W_mm?: number;
  thick_mm?: number;
  board_type: BoardType;
  limit_C?: number | null;
  R_jc?: number | null;
  tim_type?: string | null;
  thermal_profile?: ThermalProfile;
}
