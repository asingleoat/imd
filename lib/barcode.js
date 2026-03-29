// barcode.js — Persistence barcode computation for JI ratio identification
//
// Sweeps denominator bounds in continued fraction approximation to determine
// when each JI ratio "appears" and "disappears" for a given frequency ratio.

import { toContinuedFast, convergentsFast } from './fraction.js';
import { findClosest } from './ratios.js';

// Compute the persistence barcode for a single frequency ratio.
// Returns an array of bars: { ratio, birth, death }
// where birth/death are denominator bounds at which the matched JI ratio
// first appears / is replaced by a different match.
function barcodeForRatio(freqRatio, dict, toleranceCents, maxDen) {
  const cf = toContinuedFast(freqRatio);
  const convs = convergentsFast(cf);

  const bars = [];
  let currentMatch = null;
  let currentBirth = 0;

  for (let i = 0; i < convs.length; i++) {
    const { num, den } = convs[i];
    if (den === 0) continue;
    if (den > maxDen) break;

    const approxValue = num / den;
    const match = findClosest(approxValue, dict, toleranceCents);
    const matchKey = match ? match.ratio.key : null;
    const prevKey = currentMatch ? currentMatch.ratio.key : null;

    if (matchKey !== prevKey) {
      // Close previous bar
      if (currentMatch) {
        bars.push({
          ratio: currentMatch.ratio,
          birth: currentBirth,
          death: den,
          centsDiff: currentMatch.centsDiff,
        });
      }
      // Open new bar
      if (match) {
        currentMatch = match;
        currentBirth = den;
      } else {
        currentMatch = null;
      }
    }
  }

  // Close final bar (persists to maxDen)
  if (currentMatch) {
    bars.push({
      ratio: currentMatch.ratio,
      birth: currentBirth,
      death: Infinity,
      centsDiff: currentMatch.centsDiff,
    });
  }

  return bars;
}

// Compute the full persistence barcode for a set of frequency ratios
// (all relative to root = 1.0).
//
// Returns:
// {
//   bars: [{ ratio, birth, death, centsDiff, sourceIndex }],
//   summary: Map<ratioKey, { birth, death, centsDiff }>
// }
//
// The summary merges across all source ratios: for each JI ratio,
// records the earliest birth and latest death.
// spectrumEntries: array of { freq, order } or plain numbers (order defaults to 0)
export function computeBarcode(spectrumEntries, dict, toleranceCents = 10, maxDen = 64) {
  const allBars = [];

  for (let idx = 0; idx < spectrumEntries.length; idx++) {
    const entry = spectrumEntries[idx];
    const freq = typeof entry === 'number' ? entry : entry.freq;
    const order = typeof entry === 'number' ? 0 : (entry.order || 0);
    if (freq <= 0) continue;
    const bars = barcodeForRatio(freq, dict, toleranceCents, maxDen);
    for (const bar of bars) {
      allBars.push({ ...bar, sourceIndex: idx, order });
    }
  }

  // Build summary: earliest birth, latest death, lowest order per ratio
  const summary = new Map();
  for (const bar of allBars) {
    const key = bar.ratio.key;
    const existing = summary.get(key);
    if (!existing) {
      summary.set(key, {
        ratio: bar.ratio,
        birth: bar.birth,
        death: bar.death,
        centsDiff: bar.centsDiff,
        order: bar.order,
      });
    } else {
      existing.birth = Math.min(existing.birth, bar.birth);
      existing.death = Math.max(existing.death, bar.death);
      existing.centsDiff = Math.min(existing.centsDiff, bar.centsDiff);
      existing.order = Math.min(existing.order, bar.order);
    }
  }

  return { bars: allBars, summary };
}

// Produce a compact fingerprint: sorted array of { key, birth, persistence }
// for all ratios that appear in the barcode.
export function barcodeFingerprint(barcode) {
  const result = [];
  for (const [key, entry] of barcode.summary) {
    result.push({
      key,
      ratio: entry.ratio,
      birth: entry.birth,
      persistence: entry.death - entry.birth,
      centsDiff: entry.centsDiff,
      order: entry.order,
    });
  }
  result.sort((a, b) => a.birth - b.birth || b.persistence - a.persistence);
  return result;
}
