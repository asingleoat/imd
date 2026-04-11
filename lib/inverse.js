// inverse.js — Inverse lookup: find input notes that produce a target chord
//              when combined with their distortion products.
//
// Supports two modes:
//   'just' — inputs are JI ratios from the dictionary (exact rational arithmetic)
//   'tet'  — inputs are 12-TET semitones (irrational, then approximated)

import { harmonic, intermodulation } from './distortion.js';
import { computeBarcode, barcodeFingerprint } from './barcode.js';
import { FIVE_LIMIT, semitonesToJIRatios, SEMITONE_TO_JI, findClosest } from './ratios.js';
import { rationalApproximations } from './fraction.js';

// --- Combinatorics ---

function* combinations(n, k) {
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.slice();
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) {
      indices[j] = indices[j - 1] + 1;
    }
  }
}

// --- Input enumeration ---

// Build the pool of input ratios for JI mode.
// Each entry is { value: float, label: "num/den", semitone: approx semitone }
// Covers two octaves above and below root from the JI dictionary.
function jiPool(dict = FIVE_LIMIT) {
  const pool = [];
  for (const r of dict) {
    if (r.value === 1.0) continue; // skip unison (root always included)
    pool.push({
      value: r.value,
      label: r.key,
      num: r.num,
      den: r.den,
    });
  }
  pool.sort((a, b) => a.value - b.value);
  return pool;
}

// Build the pool for TET mode: semitones -range..range (excl 0)
function tetPool(range = 24) {
  const pool = [];
  for (let s = -range; s <= range; s++) {
    if (s === 0) continue;
    pool.push({
      value: Math.pow(2, s / 12),
      label: `${s}st`,
      semitone: s,
    });
  }
  return pool;
}

// Enumerate input combinations.
// Yields { ratios: [float], labels: [string] } with root (1.0) always first.
export function* enumerateInputs(mode = 'just', maxExtra = 3, options = {}) {
  const { range = 24, dict = FIVE_LIMIT } = options;
  const pool = mode === 'just' ? jiPool(dict) : tetPool(range);

  // Root alone
  yield { ratios: [1.0], labels: ['1/1'] };

  // Root + 1..maxExtra additional
  for (let k = 1; k <= maxExtra; k++) {
    for (const combo of combinations(pool.length, k)) {
      const entries = combo.map(i => pool[i]);
      yield {
        ratios: [1.0, ...entries.map(e => e.value)].sort((a, b) => a - b),
        labels: ['1/1', ...entries.map(e => e.label)].sort(),
      };
    }
  }
}

export function countInputs(mode = 'just', maxExtra = 3, options = {}) {
  const { range = 24, dict = FIVE_LIMIT } = options;
  const n = mode === 'just' ? jiPool(dict).length : range * 2;
  let total = 1; // root alone
  for (let k = 1; k <= maxExtra; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) {
      c = c * (n - i) / (i + 1);
    }
    total += c;
  }
  return total;
}

// --- Spectrum computation ---

// Compute distortion products for a set of frequency ratios (root = 1.0).
// Returns sorted array of { freq, order } where order is the rank:
//   0 = input note, 1 = product of two inputs, 2 = product involving a rank-1, etc.
export function computeSpectrum(freqRatios, distortionConfig = {}) {
  const {
    doHarmonic = true,
    doIMD = true,
    maxHarmonic = 2,
    depth = 1,
  } = distortionConfig;

  const fundamentals = freqRatios.map(f => ({ freq: f, order: 0 }));

  // All entries keyed by rounded freq, keeping lowest order
  const all = new Map();
  for (const f of fundamentals) {
    all.set(Math.round(f.freq * 10000), f);
  }

  if (doHarmonic || doIMD) {
    let currentInputs = fundamentals;

    for (let d = 0; d < depth; d++) {
      let newProducts = [];
      if (doHarmonic) {
        newProducts.push(
          ...harmonic(currentInputs, maxHarmonic).filter(p => p.order > 0)
        );
      }
      if (doIMD) {
        newProducts.push(...intermodulation(currentInputs));
      }

      for (const p of newProducts) {
        const key = Math.round(p.freq * 10000);
        if (!all.has(key) || p.order < all.get(key).order) {
          all.set(key, p);
        }
      }

      currentInputs = [...fundamentals, ...all.values()];
    }
  }

  return [...all.values()]
    .filter(e => e.freq > 0)
    .sort((a, b) => a.freq - b.freq);
}

// Format a frequency ratio (relative to root) as a small fraction.
// Tries dictionary lookup first, then continued fraction approximation
// with a reasonable cents tolerance.
function formatRatio(value, dict = FIVE_LIMIT) {
  const close = findClosest(value, dict, 25);
  if (close) return close.ratio.key;
  // Fallback: best continued fraction approximation within ~10 cents
  const approxes = rationalApproximations(value);
  for (const a of approxes) {
    if (Math.abs(a.error) <= 10) return `${a.num}/${a.den}`;
  }
  // Last resort
  const last = approxes[approxes.length - 1];
  return last ? `${last.num}/${last.den}` : value.toFixed(3);
}

// --- Scoring ---

// MSE scoring: for each target ratio, find the nearest spectrum entry
// and compute squared relative error in cents, weighted by rank.
// Rank weighting: an interval realized by a rank-r spectrum entry is
// weighted by 1/(1+r)², so rank 0 (input) has weight 1, rank 1 has
// weight 1/4, rank 2 has weight 1/9, etc. The weighted error is
// cents² / weight — higher rank matches contribute more error.
//
// spectrum: array of { freq, order }
export function mseScore(spectrum, targetRatios, extraPenalty = 0) {
  const MISSING_PENALTY_CENTS = 600;
  let sumWeightedSqErr = 0;
  let matched = 0;
  const matchedKeys = [];
  const missingKeys = [];

  // Track which spectrum entries match a target
  const matchedFreqs = new Set();

  for (const target of targetRatios) {
    const key = `${target.num}/${target.den}`;
    const targetValue = target.value;

    let bestCents = Infinity;
    let bestOrder = 0;
    let bestIdx = -1;
    for (let i = 0; i < spectrum.length; i++) {
      const entry = spectrum[i];
      if (entry.freq <= 0) continue;
      const cents = 1200 * Math.log2(entry.freq / targetValue);
      if (Math.abs(cents) < Math.abs(bestCents)) {
        bestCents = cents;
        bestOrder = entry.order;
        bestIdx = i;
      }
    }

    if (Math.abs(bestCents) < 50) {
      matched++;
      matchedKeys.push(key);
      matchedFreqs.add(bestIdx);
      const weight = 1 / ((1 + bestOrder) * (1 + bestOrder));
      sumWeightedSqErr += (bestCents * bestCents) / weight;
    } else {
      missingKeys.push(key);
      sumWeightedSqErr += MISSING_PENALTY_CENTS * MISSING_PENALTY_CENTS;
    }
  }

  // Collect extra spectrum entries not matched to any target.
  // Always populate the list (for display); only add to error if penalty > 0.
  const extraKeys = [];
  for (let i = 0; i < spectrum.length; i++) {
    if (!matchedFreqs.has(i) && spectrum[i].freq > 0) {
      extraKeys.push(formatRatio(spectrum[i].freq));
      if (extraPenalty > 0) {
        sumWeightedSqErr += extraPenalty * extraPenalty;
      }
    }
  }

  const n = targetRatios.length + (extraPenalty > 0 ? extraKeys.length : 0);
  const mse = n > 0 ? sumWeightedSqErr / n : 0;
  return {
    score: mse,
    matched,
    total: targetRatios.length,
    matchedKeys,
    missingKeys,
    extraKeys,
  };
}

export function matchScore(barcode, targetRatios, maxDen = 64, extraPenalty = 5) {
  const fingerprint = barcodeFingerprint(barcode);
  const fpMap = new Map(fingerprint.map(f => [f.key, f]));

  let score = 0;
  let matched = 0;
  const matchedKeys = [];
  const missingKeys = [];

  for (const target of targetRatios) {
    const key = `${target.num}/${target.den}`;
    const fp = fpMap.get(key);
    if (fp) {
      matched++;
      matchedKeys.push(key);
      // Reward high persistence, penalise high order (rank).
      // persistence score: maxDen - persistence (0 = best, maxDen = worst)
      // rank penalty: multiply by (1 + order)² so higher-rank matches cost more
      const persistence = fp.persistence === Infinity ? maxDen : Math.min(fp.persistence, maxDen);
      const rankPenalty = (1 + fp.order) * (1 + fp.order);
      score += (maxDen - persistence) * rankPenalty;
    } else {
      missingKeys.push(key);
      score += 10000;
    }
  }

  // Mild penalty for extra ratios not in target
  const targetKeys = new Set(targetRatios.map(t => `${t.num}/${t.den}`));
  const extraKeys = fingerprint
    .filter(f => !targetKeys.has(f.key))
    .map(f => f.key);
  score += extraKeys.length * extraPenalty;

  return { score, matched, total: targetRatios.length, matchedKeys, missingKeys, extraKeys };
}

// --- Main entry point ---

// Find input note combinations whose distortion products match a target chord.
//
// targetIntervals: semitone intervals (e.g., [0, 4, 7] for major triad)
//   — these are always mapped to JI ratios for matching
//
// Options:
//   scoring: 'barcode' or 'mse' (default 'mse')
//   mode: 'just' or 'tet' (default 'just')
//   maxExtra: max additional notes beyond root (default 3)
//   range: semitone range for TET mode (default 24)
//   distortionConfig: { doHarmonic, doIMD, maxHarmonic, depth }
//   dict: JI ratio dictionary (default FIVE_LIMIT)
//   toleranceCents: cents tolerance for barcode matching (default 10)
//   maxDen: max denominator for barcode sweep (default 64)
//   extraPenalty: penalty per extra interval (default 0 for MSE, 5 for barcode)
//   onProgress: callback(done, total)
export function findInputsForChord(targetIntervals, options = {}) {
  const {
    scoring = 'mse',
    mode = 'just',
    maxExtra = 3,
    range = 24,
    distortionConfig = {},
    dict = FIVE_LIMIT,
    toleranceCents = 10,
    maxDen = 64,
    extraPenalty = null,
    onProgress = null,
  } = options;

  const targetRatios = semitonesToJIRatios(targetIntervals);
  const useBarcode = scoring === 'barcode';
  const results = [];
  let done = 0;
  const total = countInputs(mode, maxExtra, { range, dict });

  for (const input of enumerateInputs(mode, maxExtra, { range, dict })) {
    const spectrum = computeSpectrum(input.ratios, distortionConfig);

    let result;
    const ep = extraPenalty ?? (useBarcode ? 5 : 0);
    if (useBarcode) {
      const barcode = computeBarcode(spectrum, dict, toleranceCents, maxDen);
      result = matchScore(barcode, targetRatios, maxDen, ep);
    } else {
      result = mseScore(spectrum, targetRatios, ep);
    }

    results.push({
      labels: input.labels,
      ratios: input.ratios,
      score: result.score,
      ...result,
    });

    done++;
    if (onProgress && done % 500 === 0) {
      onProgress(done, total);
    }
  }

  if (onProgress) onProgress(total, total);

  results.sort((a, b) => a.score - b.score);
  return results;
}
