/**
 * Natural convection from a flat exposed surface.
 *
 * On the form for a flat wall — h, area, emissivity, view factor — three of the
 * four are things an engineer knows. The area is off the drawing, the
 * emissivity is off the finish, the view factor is geometry you can reason
 * about. `h` is the one nobody can state: it depends on how far the buoyant
 * layer has run, which is a length, and on how hard it is being driven, which
 * is a temperature difference nobody has yet solved for.
 *
 * So it gets computed and the other three stay stated. That is the opposite
 * split from a fin array, where the geometry sets all four — and it is the
 * right one here, because a flat plate really does have an area you can measure
 * and a view factor you can draw.
 *
 * ---------------------------------------------------------------------------
 * These are textbook correlations, not fits
 *
 * Churchill–Chu for the vertical plate, and the McAdams pair for a horizontal
 * one. They carry their own uncertainty — 10–20% is normal for natural
 * convection — but they are not calibrated to any particular product, so they
 * do not silently stop applying outside the geometry someone fitted them on.
 * That matters here: the fin correlation next door IS a fit, and copying its
 * 6.23 W/m²K onto a flat wall (where these give about 4.8) is exactly the kind
 * of transfer this module exists to stop.
 * ---------------------------------------------------------------------------
 */

/** Which way the surface faces, which decides how the plume leaves it. */
export const PLATE_ORIENTATIONS = ['Vertical', 'HorizontalUp', 'HorizontalDown'] as const;
export type PlateOrientation = (typeof PLATE_ORIENTATIONS)[number];

export const PLATE_ORIENTATION_LABELS: Record<
  PlateOrientation,
  { en: string; zh: string; note: string }
> = {
  Vertical: {
    en: 'Vertical',
    zh: '垂直',
    note: '浮力沿表面向上帶走熱，特徵長度為垂直方向的高度。',
  },
  HorizontalUp: {
    en: 'Horizontal, facing up',
    zh: '水平朝上',
    note: '熱面朝上，熱空氣直接升起，散熱最好。特徵長度為面積除以周長。',
  },
  HorizontalDown: {
    en: 'Horizontal, facing down',
    zh: '水平朝下',
    note: '熱面朝下，熱空氣被表面擋住只能橫向流出，約為朝上的一半。',
  },
};

const GRAVITY = 9.81;

/**
 * Dry air at one atmosphere, as power laws in the film temperature.
 *
 * Anchored at 300 K and checked against tables at 350 K and 400 K, where they
 * land within about 2% — comfortably inside the correlations' own uncertainty,
 * and far tighter than the difference between using them and guessing.
 */
function airProperties(filmTemperature_C: number) {
  const T = filmTemperature_C + 273.15;
  const ratio = T / 300;
  const kinematicViscosity = 1.589e-5 * ratio ** 1.75;
  const thermalDiffusivity = 2.25e-5 * ratio ** 1.75;
  const conductivity = 0.0263 * ratio ** 0.85;
  return {
    kinematicViscosity,
    thermalDiffusivity,
    conductivity,
    prandtl: kinematicViscosity / thermalDiffusivity,
  };
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The length the buoyant layer runs along.
 *
 * A vertical plate's is its height — the horizontal dimension does not enter,
 * because each column of fluid rises independently. A horizontal one's is area
 * over perimeter, which is how a square and a long strip of the same area come
 * out differently.
 */
export function plateCharacteristicLength_m(
  orientation: PlateOrientation,
  height_mm: number | null | undefined,
  width_mm: number | null | undefined,
): number | null {
  const height = positive(height_mm);
  const width = positive(width_mm);
  if (height == null) return null;
  if (orientation === 'Vertical') return height / 1000;
  if (width == null) return null;
  const h = height / 1000;
  const w = width / 1000;
  return (h * w) / (2 * (h + w));
}

export interface FlatPlateInput {
  orientation: PlateOrientation;
  /** Along the buoyant flow for a vertical plate; one side of a horizontal one. */
  height_mm: number | null | undefined;
  /** The other side. Only a horizontal plate needs it. */
  width_mm?: number | null;
  /** Pre-solve surface guess — Screen 07 solves the real one. */
  surfaceTemperature_C: number | null | undefined;
  ambientTemperature_C: number | null | undefined;
}

export interface FlatPlateResult {
  characteristicLength_m: number;
  rayleigh: number;
  nusselt: number;
  h_conv_W_m2K: number;
  /** The temperature difference the coefficient was evaluated at. */
  deltaT_C: number;
}

/**
 * Plate-average convection coefficient. Null when an input is missing, or when
 * the surface is not hotter than the air — at ΔT ≤ 0 there is no buoyant plume
 * to correlate and the honest answer is "this model does not apply", not a
 * number rounded up from zero.
 */
export function flatPlateConvection(input: FlatPlateInput): FlatPlateResult | null {
  const surface = input.surfaceTemperature_C;
  const ambient = input.ambientTemperature_C;
  if (typeof surface !== 'number' || !Number.isFinite(surface)) return null;
  if (typeof ambient !== 'number' || !Number.isFinite(ambient)) return null;

  const deltaT = surface - ambient;
  if (!(deltaT > 0)) return null;

  const length = plateCharacteristicLength_m(input.orientation, input.height_mm, input.width_mm);
  if (length == null) return null;

  const film = (surface + ambient) / 2;
  const air = airProperties(film);
  const beta = 1 / (film + 273.15);
  const rayleigh =
    (GRAVITY * beta * deltaT * length ** 3) / (air.kinematicViscosity * air.thermalDiffusivity);
  if (!Number.isFinite(rayleigh) || rayleigh <= 0) return null;

  const nusselt = nusseltFor(input.orientation, rayleigh, air.prandtl);
  if (nusselt == null || !Number.isFinite(nusselt) || nusselt <= 0) return null;

  return {
    characteristicLength_m: length,
    rayleigh,
    nusselt,
    h_conv_W_m2K: (nusselt * air.conductivity) / length,
    deltaT_C: deltaT,
  };
}

function nusseltFor(
  orientation: PlateOrientation,
  rayleigh: number,
  prandtl: number,
): number | null {
  switch (orientation) {
    case 'Vertical': {
      // Churchill–Chu, the form valid across laminar and turbulent alike, so
      // there is no branch to fall off at the transition.
      const denominator = (1 + (0.492 / prandtl) ** (9 / 16)) ** (8 / 27);
      return (0.825 + (0.387 * rayleigh ** (1 / 6)) / denominator) ** 2;
    }
    case 'HorizontalUp':
      // McAdams. The plume leaves freely, and the exponent steps up once the
      // layer goes turbulent.
      return rayleigh <= 1e7 ? 0.54 * rayleigh ** 0.25 : 0.15 * rayleigh ** (1 / 3);
    case 'HorizontalDown':
      // Hot face down: the fluid has to travel sideways to escape, so this
      // stays laminar far longer and is roughly half the facing-up value.
      return 0.27 * rayleigh ** 0.25;
    default:
      return null;
  }
}

/**
 * Whether a stated view factor is plausible for a surface open to the
 * environment.
 *
 * An outer wall of a pole-mounted unit sees the sky and the ground across most
 * of its hemisphere, so its view factor is near 1. A markedly low one is
 * usually not a view factor at all — it is an area ratio, or a fin
 * correlation's radiation term, that has been pushed into the only field that
 * would take it. That is worth naming, because the two errors it usually comes
 * with cancel just enough to look reasonable.
 */
export const OPEN_SURFACE_VIEW_FACTOR_FLOOR = 0.5;
