// ratios.js — Just intonation ratio dictionary
//
// Generates and manages a dictionary of "interesting" JI ratios
// for use in persistence barcode matching.

import { gcd } from './fraction.js';

// Check if all prime factors of n are within the given set
function isPrimeConstrained(n, primes) {
  if (n <= 1) return true;
  for (const p of primes) {
    while (n % p === 0) n /= p;
  }
  return n === 1;
}

// Standard interval names for common JI ratios
const RATIO_NAMES = new Map([
  ['1/1', 'unison'],
  ['16/15', 'minor 2nd'],
  ['9/8', 'major 2nd'],
  ['6/5', 'minor 3rd'],
  ['5/4', 'major 3rd'],
  ['4/3', 'perfect 4th'],
  ['45/32', 'tritone'],
  ['7/5', 'septimal tritone'],
  ['3/2', 'perfect 5th'],
  ['8/5', 'minor 6th'],
  ['5/3', 'major 6th'],
  ['7/4', 'harmonic 7th'],
  ['9/5', 'minor 7th'],
  ['15/8', 'major 7th'],
  ['2/1', 'octave'],
  ['9/4', 'major 9th'],
  ['12/5', 'minor 10th'],
  ['5/2', 'major 10th'],
  ['8/3', 'perfect 11th'],
  ['3/1', 'perfect 12th'],
]);

// Generate a dictionary of JI ratios.
// maxDen: maximum denominator
// maxRatio: maximum ratio value (e.g., 4.0 for two octaves)
// primeLimit: array of allowed prime factors (e.g., [2,3,5] for 5-limit)
export function generateDictionary(maxDen = 16, maxRatio = 4.0, primeLimit = [2, 3, 5]) {
  const ratios = [];
  const seen = new Set();

  for (let den = 1; den <= maxDen; den++) {
    if (!isPrimeConstrained(den, primeLimit)) continue;
    for (let num = den; num <= Math.ceil(maxRatio * den); num++) {
      if (!isPrimeConstrained(num, primeLimit)) continue;
      const g = gcd(BigInt(num), BigInt(den));
      const rNum = Number(BigInt(num) / g);
      const rDen = Number(BigInt(den) / g);
      const key = `${rNum}/${rDen}`;
      if (seen.has(key)) continue;
      if (rNum / rDen > maxRatio) continue;
      seen.add(key);

      const cents = 1200 * Math.log2(rNum / rDen);
      ratios.push({
        num: rNum,
        den: rDen,
        value: rNum / rDen,
        cents,
        key,
        name: RATIO_NAMES.get(key) || null,
      });
    }
  }

  ratios.sort((a, b) => a.value - b.value);
  return ratios;
}

// Precomputed standard dictionaries
export const FIVE_LIMIT = generateDictionary(16, 4.0, [2, 3, 5]);
export const SEVEN_LIMIT = generateDictionary(16, 4.0, [2, 3, 5, 7]);

// Find the closest dictionary ratio to a given frequency ratio.
// Returns { ratio, centsDiff } or null if nothing within tolerance.
export function findClosest(value, dict = FIVE_LIMIT, toleranceCents = 10) {
  const cents = 1200 * Math.log2(value);
  let best = null;
  let bestDiff = Infinity;

  for (const r of dict) {
    const diff = Math.abs(cents - r.cents);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }

  if (best && bestDiff <= toleranceCents) {
    return { ratio: best, centsDiff: bestDiff };
  }
  return null;
}

// Convert a chord's semitone intervals to JI ratio targets.
// Uses the standard 5-limit JI mapping for each interval.
const SEMITONE_TO_JI = [
  [1, 1],     // 0: unison
  [16, 15],   // 1: minor 2nd
  [9, 8],     // 2: major 2nd
  [6, 5],     // 3: minor 3rd
  [5, 4],     // 4: major 3rd
  [4, 3],     // 5: perfect 4th
  [45, 32],   // 6: tritone
  [3, 2],     // 7: perfect 5th
  [8, 5],     // 8: minor 6th
  [5, 3],     // 9: major 6th
  [9, 5],     // 10: minor 7th
  [15, 8],    // 11: major 7th
];

export function semitonesToJIRatios(intervals) {
  return intervals.map(i => {
    const pc = ((i % 12) + 12) % 12;
    const octaves = Math.floor(i / 12);
    const [num, den] = SEMITONE_TO_JI[pc];
    const octMul = Math.pow(2, octaves);
    if (octMul >= 1) {
      return { num: num * octMul, den, value: (num / den) * octMul };
    } else {
      // Negative octaves: multiply denominator instead
      const invMul = Math.round(1 / octMul);
      return { num, den: den * invMul, value: num / (den * invMul) };
    }
  });
}

export { SEMITONE_TO_JI };
