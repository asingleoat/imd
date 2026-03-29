// distortion.js — Harmonic and intermodulation distortion products
//
// Frequencies are represented as { freq: number, order: number } where
// order is an ordinal ranking of volume (lower = louder).

// harmonic : { freq, order }[] -> number -> { freq, order }[]
// For each input frequency, produce harmonics at integer multiples.
// The nth harmonic gets order = input.order + n - 1 (fundamental is n=1).
// maxHarmonic controls how many harmonics per input (default 8).
export function harmonic(inputs, maxHarmonic = 8) {
  const results = [];
  for (const { freq, order } of inputs) {
    for (let n = 1; n <= maxHarmonic; n++) {
      results.push({ freq: freq * n, order: order + n - 1, kind: 'harmonic' });
    }
  }
  return results;
}

// intermodulation : { freq, order }[] -> { freq, order }[]
// For every pair of input frequencies, produce sum and difference frequencies.
// Output order = orderA + orderB (combining two signals costs both their orders).
export function intermodulation(inputs) {
  const results = [];
  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) {
      const a = inputs[i];
      const b = inputs[j];
      const combinedOrder = a.order + b.order;
      results.push({ freq: a.freq + b.freq, order: combinedOrder, kind: 'sum' });
      const diff = Math.abs(a.freq - b.freq);
      if (diff > 0) {
        results.push({ freq: diff, order: combinedOrder, kind: 'difference' });
      }
    }
  }
  return results;
}
