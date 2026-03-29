// inverse.js — Inverse lookup: find input notes that produce a target chord
//              when combined with their distortion products.
//
// Supports two modes:
//   'just' — inputs are JI ratios from the dictionary (exact rational arithmetic)
//   'tet'  — inputs are 12-TET semitones (irrational, then approximated)

import { harmonic, intermodulation } from './distortion.js';
import { computeBarcode, barcodeFingerprint } from './barcode.js';
import { FIVE_LIMIT, semitonesToJIRatios, SEMITONE_TO_JI } from './ratios.js';

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
// Returns sorted array of all resulting frequency ratios.
export function computeSpectrum(freqRatios, distortionConfig = {}) {
  const {
    doHarmonic = true,
    doIMD = true,
    maxHarmonic = 2,
    depth = 1,
  } = distortionConfig;

  const fundamentals = freqRatios.map(f => ({ freq: f, order: 0 }));
  const allFreqs = new Set(freqRatios);

  if (doHarmonic || doIMD) {
    let currentInputs = fundamentals;
    const seen = new Map();

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
        const key = Math.round(p.freq * 10000); // dedup at 0.0001 resolution
        if (!seen.has(key) || p.order < seen.get(key).order) {
          seen.set(key, p);
        }
      }

      currentInputs = [...fundamentals, ...seen.values()];
    }

    for (const p of seen.values()) {
      allFreqs.add(p.freq);
    }
  }

  return [...allFreqs].filter(f => f > 0).sort((a, b) => a - b);
}

// --- Scoring ---

export function matchScore(barcode, targetRatios, maxDen = 64) {
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
      // Reward high persistence (death - birth). Infinity persistence is best.
      // Invert so lower score = better: subtract persistence from maxDen.
      const persistence = fp.persistence === Infinity ? maxDen : Math.min(fp.persistence, maxDen);
      score += maxDen - persistence;
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
  score += extraKeys.length * 5;

  return { score, matched, total: targetRatios.length, matchedKeys, missingKeys, extraKeys };
}

// --- Main entry point ---

// Find input note combinations whose distortion products match a target chord.
//
// targetIntervals: semitone intervals (e.g., [0, 4, 7] for major triad)
//   — these are always mapped to JI ratios for matching
//
// Options:
//   mode: 'just' or 'tet' (default 'just')
//   maxExtra: max additional notes beyond root (default 3)
//   range: semitone range for TET mode (default 24)
//   distortionConfig: { doHarmonic, doIMD, maxHarmonic, depth }
//   dict: JI ratio dictionary (default FIVE_LIMIT)
//   toleranceCents: cents tolerance for barcode matching (default 10)
//   maxDen: max denominator for barcode sweep (default 64)
//   maxResults: max results to return (default 20)
//   onProgress: callback(done, total)
export function findInputsForChord(targetIntervals, options = {}) {
  const {
    mode = 'just',
    maxExtra = 3,
    range = 24,
    distortionConfig = {},
    dict = FIVE_LIMIT,
    toleranceCents = 10,
    maxDen = 64,
    maxResults = 20,
    onProgress = null,
  } = options;

  const targetRatios = semitonesToJIRatios(targetIntervals);
  const results = [];
  let done = 0;
  const total = countInputs(mode, maxExtra, { range, dict });

  for (const input of enumerateInputs(mode, maxExtra, { range, dict })) {
    const spectrum = computeSpectrum(input.ratios, distortionConfig);
    const barcode = computeBarcode(spectrum, dict, toleranceCents, maxDen);
    const result = matchScore(barcode, targetRatios);

    results.push({
      labels: input.labels,
      ratios: input.ratios,
      ...result,
    });

    done++;
    if (onProgress && done % 500 === 0) {
      onProgress(done, total);
    }
  }

  if (onProgress) onProgress(total, total);

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, maxResults);
}
