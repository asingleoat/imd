// voicings.js — Transforms abstract interval sets into concrete MIDI note arrays.
// All inputs/outputs are MIDI note numbers.

const KEYBOARD_LOW = 48;  // C3
const KEYBOARD_HIGH = 95; // B6

// Clamp notes into the rendered keyboard range by octave shifting
function clampToKeyboard(notes) {
  return notes.map(n => {
    while (n < KEYBOARD_LOW) n += 12;
    while (n > KEYBOARD_HIGH) n -= 12;
    return n;
  }).sort((a, b) => a - b);
}

// Close/root position: stack intervals above root
function rootPosition(intervals, rootMidi) {
  return intervals.map(i => rootMidi + i);
}

// Inversion N: rotate bottom N notes up an octave
function inversion(intervals, rootMidi, n) {
  const notes = rootPosition(intervals, rootMidi);
  for (let i = 0; i < n && i < notes.length - 1; i++) {
    notes[i] += 12;
  }
  notes.sort((a, b) => a - b);
  return notes;
}

// Drop-2: from close position, drop 2nd-from-top note down an octave
function drop2(intervals, rootMidi) {
  const notes = rootPosition(intervals, rootMidi);
  if (notes.length < 4) return notes;
  const idx = notes.length - 2;
  notes[idx] -= 12;
  notes.sort((a, b) => a - b);
  return notes;
}

// Drop-3: from close position, drop 3rd-from-top note down an octave
function drop3(intervals, rootMidi) {
  const notes = rootPosition(intervals, rootMidi);
  if (notes.length < 4) return notes;
  const idx = notes.length - 3;
  notes[idx] -= 12;
  notes.sort((a, b) => a - b);
  return notes;
}

// Drop-2-4: drop 2nd and 4th from top down an octave
function drop24(intervals, rootMidi) {
  const notes = rootPosition(intervals, rootMidi);
  if (notes.length < 4) return notes;
  notes[notes.length - 2] -= 12;
  if (notes.length >= 4) notes[notes.length - 4] -= 12;
  notes.sort((a, b) => a - b);
  return notes;
}

// Open/spread: drop every other note (starting from 2nd lowest) down an octave
function spread(intervals, rootMidi) {
  const notes = rootPosition(intervals, rootMidi);
  for (let i = 1; i < notes.length; i += 2) {
    notes[i] -= 12;
  }
  notes.sort((a, b) => a - b);
  return notes;
}

// Re-voice as stacked perfect 4ths from root
function quartalVoicing(intervals, rootMidi) {
  // Extract unique pitch classes, voice them as stacked 4ths
  const pcs = [...new Set(intervals.map(i => i % 12))].sort((a, b) => a - b);
  const notes = pcs.map((_, i) => rootMidi + i * 5);
  return notes;
}

const VOICING_FNS = {
  'Root position': (iv, r) => rootPosition(iv, r),
  'Close':         (iv, r) => rootPosition(iv, r),
  'Inversion 1':   (iv, r) => inversion(iv, r, 1),
  'Inversion 2':   (iv, r) => inversion(iv, r, 2),
  'Inversion 3':   (iv, r) => inversion(iv, r, 3),
  'Inversion 4':   (iv, r) => inversion(iv, r, 4),
  'Inversion 5':   (iv, r) => inversion(iv, r, 5),
  'Inversion 6':   (iv, r) => inversion(iv, r, 6),
  'Drop-2':        (iv, r) => drop2(iv, r),
  'Drop-3':        (iv, r) => drop3(iv, r),
  'Drop-2-4':      (iv, r) => drop24(iv, r),
  'Open/Spread':   (iv, r) => spread(iv, r),
  'Quartal':       (iv, r) => quartalVoicing(iv, r),
};

export function availableVoicings(intervals) {
  const n = intervals.length;
  const voicings = ['Root position'];

  // Inversions: up to n-1
  for (let i = 1; i < n; i++) {
    voicings.push(`Inversion ${i}`);
  }

  if (n >= 4) {
    voicings.push('Drop-2', 'Drop-3');
  }
  if (n >= 5) {
    voicings.push('Drop-2-4');
  }

  voicings.push('Open/Spread');

  if (n >= 3) {
    voicings.push('Quartal');
  }

  return voicings;
}

export function applyVoicing(intervals, rootMidi, voicingName) {
  const fn = VOICING_FNS[voicingName];
  if (!fn) return clampToKeyboard(rootPosition(intervals, rootMidi));
  return clampToKeyboard(fn(intervals, rootMidi));
}
