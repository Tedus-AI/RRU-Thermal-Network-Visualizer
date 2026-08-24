/**
 * Bessel functions of the first kind, J₀ and J₁, and the zeros of J₁.
 *
 * Here for one reason: Lee's spreading resistance has an exact solution as an
 * infinite series over the zeros of J₁, and the algebraic correlation that is
 * usually quoted instead of it under-predicts by 3–21% in exactly the geometry
 * this tool models — a thin, wide heat-sink base. See `spreading.ts`.
 *
 * Two branches, as is standard: the ascending power series near the origin and
 * the Hankel asymptotic expansion for large argument. The crossover at x = 18
 * is where both are comfortably converged, so neither is being pushed.
 */

/** Ascending series. Exact in the limit; used where it converges quickly. */
function seriesJ(nu: 0 | 1, x: number): number {
  // ν is 0 or 1, so Γ(ν+1) is 1 either way.
  let term = nu === 0 ? 1 : x / 2;
  let sum = term;
  const quarterSq = (x * x) / 4;
  for (let k = 1; k <= 400; k += 1) {
    term *= -quarterSq / (k * (k + nu));
    sum += term;
    if (Math.abs(term) < 1e-18 * Math.max(Math.abs(sum), 1e-300)) break;
  }
  return sum;
}

/** Hankel asymptotic expansion, for x beyond the series' comfortable range. */
function asymptoticJ(nu: 0 | 1, x: number): number {
  const mu = 4 * nu * nu;
  const chi = x - (nu / 2 + 0.25) * Math.PI;
  let p = 1;
  let q = 0;
  let term = 1;
  for (let k = 1; k < 12; k += 1) {
    term *= (mu - (2 * k - 1) ** 2) / (k * 8 * x);
    if (k % 2 === 1) q += k % 4 === 1 ? term : -term;
    else p += k % 4 === 2 ? -term : term;
  }
  return Math.sqrt(2 / (Math.PI * x)) * (p * Math.cos(chi) - q * Math.sin(chi));
}

const SERIES_LIMIT = 18;

export function besselJ0(x: number): number {
  const ax = Math.abs(x);
  return ax < SERIES_LIMIT ? seriesJ(0, ax) : asymptoticJ(0, ax);
}

export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  const value = ax < SERIES_LIMIT ? seriesJ(1, ax) : asymptoticJ(1, ax);
  // J₁ is odd.
  return x < 0 ? -value : value;
}

/**
 * The positive zeros of J₁, ascending. x = 0 is a zero of J₁ but not an
 * eigenvalue of the problem, so it is not in this list.
 *
 * McMahon's asymptotic gives the starting point and Newton refines it, using
 * J₁'(x) = J₀(x) − J₁(x)/x.
 */
function computeJ1Zeros(count: number): number[] {
  const zeros: number[] = new Array<number>(count);
  for (let s = 1; s <= count; s += 1) {
    const beta = (s + 0.25) * Math.PI;
    let x = beta - 3 / (8 * beta);
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const f = besselJ1(x);
      const derivative = besselJ0(x) - besselJ1(x) / x;
      const step = f / derivative;
      x -= step;
      if (Math.abs(step) < 1e-14 * Math.abs(x)) break;
    }
    zeros[s - 1] = x;
  }
  return zeros;
}

/**
 * Cached eigenvalues and the J₀(λₙ)² each series term divides by.
 *
 * Neither depends on the geometry, so they are computed once for the whole
 * session rather than per edge. The cache grows if a caller ever asks for more.
 */
let cachedCount = 0;
let cachedZeros: number[] = [];
let cachedJ0Squared: number[] = [];

export function j1Eigenvalues(count: number): {
  zeros: readonly number[];
  j0Squared: readonly number[];
} {
  if (count > cachedCount) {
    cachedZeros = computeJ1Zeros(count);
    cachedJ0Squared = new Array<number>(count);
    for (let n = 0; n < count; n += 1) {
      const j0 = besselJ0(cachedZeros[n]);
      cachedJ0Squared[n] = j0 * j0;
    }
    cachedCount = count;
  }
  return { zeros: cachedZeros, j0Squared: cachedJ0Squared };
}
