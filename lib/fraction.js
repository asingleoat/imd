// Uses BigInt for exact integer arithmetic. Rationals are [num, den] pairs of BigInt.

// --- Rational helpers ---

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function rat(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  if (d === 0n) return [n, 0n]; // formal rational 1/0 used by algorithm
  const g = gcd(n, d);
  return [n / g, d / g];
}

function ratAdd(a, b) {
  return rat(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
}

function ratMul(a, b) {
  return rat(a[0] * b[0], a[1] * b[1]);
}

function ratEq(a, b) {
  return a[0] * b[1] === b[0] * a[1];
}

function ratToNumber([n, d]) {
  return Number(n) / Number(d);
}

// --- Core functions ---

// convergents : BigInt[] -> { num, den, error }[]
// Produces the sequence of convergents from continued fraction coefficients.
// Each entry includes the relative error vs the value implied by the full expansion.
export function convergents(coeffs, x = null) {
  let h_2 = [0n, 1n]; // 0/1
  let h_1 = [1n, 0n]; // 1/0 (formal)
  let i = 0;
  const raw = [h_1];

  while (i < coeffs.length) {
    const a = BigInt(coeffs[i]);
    const next = rat(
      a * h_1[0] + h_2[0],
      a * h_1[1] + h_2[1]
    );
    raw.push(next);
    h_2 = h_1;
    h_1 = next;
    i++;
  }

  // If x not provided, reconstruct from the final convergent
  const target = x ?? ratToNumber(raw[raw.length - 1]);

  return raw.map(([num, den]) => {
    const approxVal = den === 0n ? Infinity : ratToNumber([num, den]);
    const error = target === 0 ? Infinity : 1200 * Math.log2(approxVal / target);
    return { num, den, error };
  });
}

// toContinued : number -> BigInt[]
// Computes the continued fraction expansion of a real number.
// Stops when the fractional part is negligible (within epsilon).
export function toContinued(x, maxTerms = 50, epsilon = 1e-12) {
  const result = [];
  for (let i = 0; i < maxTerms; i++) {
    const a = Math.floor(x);
    result.push(BigInt(a));
    const b = x - a;
    if (Math.abs(b) < epsilon) break;
    x = 1 / b;
  }
  return result;
}

// upperBounds : BigInt[] -> { num, den, error }[]
// Even-indexed convergents (0th, 2nd, 4th, ...)
export function upperBounds(coeffs, x = null) {
  return convergents(coeffs, x).filter((_, i) => i % 2 === 0);
}

// lowerBounds : BigInt[] -> { num, den, error }[]
// Odd-indexed convergents (1st, 3rd, 5th, ...)
export function lowerBounds(coeffs, x = null) {
  return convergents(coeffs, x).filter((_, i) => i % 2 === 1);
}

// strict : remove consecutive duplicates from an array of { num, den, error }
export function strict(xs) {
  if (xs.length === 0) return [];
  const result = [xs[0]];
  for (let i = 1; i < xs.length; i++) {
    if (!ratEq([xs[i].num, xs[i].den], [xs[i - 1].num, xs[i - 1].den])) {
      result.push(xs[i]);
    }
  }
  return result;
}

// approximateContinued : BigInt -> BigInt[] -> { num, den, error }
// Best rational approximation with denominator <= denom, given continued fraction coefficients.
export function approximateContinued(denom, coeffs) {
  denom = BigInt(denom);
  const convs = strict(convergents(coeffs));
  let best = { num: 1n, den: 0n, error: Infinity };
  for (const c of convs) {
    if (c.den !== 0n && c.den <= denom) {
      best = c;
    } else if (c.den > denom) {
      break;
    }
  }
  return best;
}

// approximate : BigInt|number -> number -> { num, den, error }
// Best rational approximation of x with denominator <= denom.
export function approximate(denom, x) {
  const cf = toContinued(x);
  const result = approximateContinued(denom, cf);
  // Recompute error in cents against original x for full precision
  const approxVal = ratToNumber([result.num, result.den]);
  result.error = x === 0 ? Infinity : 1200 * Math.log2(approxVal / x);
  return result;
}

// rationalApproximations : number -> { num, den, error }[]
// Convenience: all convergents of a real number, with relative errors.
export function rationalApproximations(x) {
  const cf = toContinued(x);
  return convergents(cf, x).slice(1); // skip formal 1/0
}

// --- Convenience ---
export { ratToNumber, rat, gcd };
