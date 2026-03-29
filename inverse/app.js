// app.js — Inverse app: find input notes whose distortion products produce a target chord

import { equalTemperament } from '../lib/tuning.js';
import { CHORD_TYPES, CATEGORIES, chordsByCategory, identifyChord } from '../lib/chords.js';
import { AudioEngine } from '../lib/audio.js';
import { PianoKeyboard, midiToNoteName } from '../lib/piano.js';
import { harmonic, intermodulation } from '../lib/distortion.js';
import { findInputsForChord } from '../lib/inverse.js';

// --- State ---
const tuning = equalTemperament(440);
const audio = new AudioEngine(tuning);
const keyboard = new PianoKeyboard(document.getElementById('keyboard'));
const productsKeyboard = new PianoKeyboard(document.getElementById('keyboard-products'));

let allResults = [];       // full unfiltered results
let currentResults = [];   // filtered view
let currentResultIndex = 0;
let currentKeyMidi = 60; // C4

// --- Note names ---
const KEY_NOTES = [
  { name: 'C',  midi: 60 },
  { name: 'C♯/D♭', midi: 61 },
  { name: 'D',  midi: 62 },
  { name: 'D♯/E♭', midi: 63 },
  { name: 'E',  midi: 64 },
  { name: 'F',  midi: 65 },
  { name: 'F♯/G♭', midi: 66 },
  { name: 'G',  midi: 67 },
  { name: 'G♯/A♭', midi: 68 },
  { name: 'A',  midi: 69 },
  { name: 'A♯/B♭', midi: 70 },
  { name: 'B',  midi: 71 },
];

// --- Populate key selector ---
const keySelect = document.getElementById('key-select');
for (const k of KEY_NOTES) {
  const opt = document.createElement('option');
  opt.value = k.midi;
  opt.textContent = k.name;
  keySelect.appendChild(opt);
}
keySelect.value = 60;

// --- Populate octave selector ---
const octaveSelect = document.getElementById('octave-select');
for (let oct = 2; oct <= 6; oct++) {
  const opt = document.createElement('option');
  opt.value = oct;
  opt.textContent = `Octave ${oct}`;
  octaveSelect.appendChild(opt);
}
octaveSelect.value = 4;

// --- Populate target chord selector ---
const targetSelect = document.getElementById('target-select');
const byCategory = chordsByCategory();
for (const cat of CATEGORIES) {
  const group = document.createElement('optgroup');
  group.label = cat;
  for (const chord of byCategory.get(cat)) {
    const opt = document.createElement('option');
    opt.value = chord.symbol;
    opt.textContent = `${chord.symbol}  —  ${chord.name}`;
    group.appendChild(opt);
  }
  targetSelect.appendChild(group);
}
targetSelect.value = 'min7';

// --- Result selector ---
const resultSelect = document.getElementById('result-select');

// --- Distortion config from UI ---
function getDistortionConfig() {
  return {
    doHarmonic: document.getElementById('harmonic-toggle').checked,
    doIMD: document.getElementById('imd-toggle').checked,
    maxHarmonic: 2,
    depth: parseInt(document.getElementById('depth-slider').value),
  };
}

// --- Solve ---
const solveBtn = document.getElementById('solve-btn');
const statusEl = document.getElementById('status');
const modeSelect = document.getElementById('mode-select');

// LRU cache of solver results keyed by params
const LRU_MAX = 10;
const solveCache = new Map(); // key -> results array (Map preserves insertion order)

function getSolveParams() {
  return JSON.stringify({
    target: targetSelect.value,
    mode: modeSelect.value,
    scoring: scoringSelect.value,
    ...getDistortionConfig(),
  });
}

function checkSolveNeeded() {
  const params = getSolveParams();
  if (solveCache.has(params)) {
    solveBtn.disabled = true;
    // Auto-load cached results
    const cached = solveCache.get(params);
    solveCache.delete(params);
    solveCache.set(params, cached);
    allResults = cached;
    statusEl.textContent = 'Loaded from cache.';
    statusEl.className = '';
    filterResults();
  } else {
    solveBtn.disabled = false;
  }
}

function solve() {
  const chord = CHORD_TYPES.find(c => c.symbol === targetSelect.value);
  if (!chord) return;

  const params = getSolveParams();

  // Check cache first
  if (solveCache.has(params)) {
    // Move to end (most recently used)
    const cached = solveCache.get(params);
    solveCache.delete(params);
    solveCache.set(params, cached);
    allResults = cached;
    statusEl.textContent = 'Loaded from cache.';
    statusEl.className = '';
    solveBtn.disabled = true;
    filterResults();
    return;
  }

  statusEl.textContent = 'Computing...';
  statusEl.className = 'computing';
  solveBtn.disabled = true;

  setTimeout(() => {
    const results = findInputsForChord(chord.intervals, {
      scoring: scoringSelect.value,
      mode: modeSelect.value,
      maxExtra: 3,
      range: 24,
      distortionConfig: getDistortionConfig(),
      toleranceCents: 10,
      maxDen: 64,
      onProgress: (done, total) => {
        statusEl.textContent = `Computing... ${done}/${total}`;
      },
    });

    // Store in cache, evict oldest if over limit
    if (solveCache.size >= LRU_MAX) {
      const oldest = solveCache.keys().next().value;
      solveCache.delete(oldest);
    }
    solveCache.set(params, results);

    allResults = results;
    solveBtn.disabled = true;
    filterResults();
  }, 10);
}

const maxNotesFilter = document.getElementById('max-notes-filter');
const scoringSelect = document.getElementById('scoring-select');

function filterResults() {
  const maxNotes = parseInt(maxNotesFilter.value);
  currentResults = allResults.filter(r => r.ratios.length <= maxNotes).slice(0, 50);
  currentResultIndex = 0;
  populateResults();
  if (currentResults.length > 0) {
    displayResult(0);
  } else {
    keyboard.clearHighlight();
    productsKeyboard.clearHighlight();
    document.getElementById('match-info').innerHTML = '';
  }
  const exact = currentResults.filter(r => r.matched === r.total).length;
  statusEl.textContent = `Showing ${currentResults.length} results (${exact} exact) of ${allResults.length} total`;
  statusEl.className = '';
}

function populateResults() {
  resultSelect.innerHTML = '';
  const isMSE = scoringSelect.value === 'mse';
  for (let i = 0; i < currentResults.length; i++) {
    const r = currentResults[i];
    const opt = document.createElement('option');
    opt.value = i;
    const labels = r.labels.join(', ');
    const matchStr = r.matched === r.total ? '✓' : `${r.matched}/${r.total}`;
    const scoreStr = isMSE ? r.score.toFixed(1) + '¢²' : String(r.score);
    opt.textContent = `#${i + 1} [${labels}] ${matchStr} (${scoreStr})`;
    resultSelect.appendChild(opt);
  }
}

// --- Display a result ---
function getRootMidi() {
  const pc = parseInt(keySelect.value) % 12;
  const oct = parseInt(octaveSelect.value);
  return pc + (oct + 1) * 12;
}

function displayResult(index) {
  if (index < 0 || index >= currentResults.length) return;
  currentResultIndex = index;
  resultSelect.value = index;

  const result = currentResults[index];
  const rootMidi = getRootMidi();

  // Convert ratio labels to MIDI notes relative to root
  // Each ratio is relative to root=1.0, convert to semitones then MIDI
  const inputMidiNotes = result.ratios.map(r => {
    const semitones = 12 * Math.log2(r);
    return rootMidi + Math.round(semitones);
  });

  // Highlight input notes on top keyboard
  keyboard.highlightNotes(inputMidiNotes, rootMidi);

  // Display chord name
  const rootName = KEY_NOTES.find(k => k.midi % 12 === rootMidi % 12)?.name.split('/')[0] || '?';
  const chord = CHORD_TYPES.find(c => c.symbol === targetSelect.value);
  document.getElementById('chord-display').textContent =
    `Target: ${rootName}${chord.symbol === 'maj' ? '' : chord.symbol}`;
  document.getElementById('notes-display').textContent =
    `Input: ${result.labels.join('   ')}  →  ${inputMidiNotes.map(midiToNoteName).join('  ')}`;

  // Compute and display distortion products
  const inputFreqs = inputMidiNotes.map(m => tuning.noteFrequency(m));
  const inputs = inputFreqs.map(f => ({ freq: f, order: 0 }));
  const config = getDistortionConfig();

  let products = [];
  let currentInputs = inputs;
  const seen = new Map();

  for (let d = 0; d < config.depth; d++) {
    let newProducts = [];
    if (config.doHarmonic) {
      newProducts.push(...harmonic(currentInputs, config.maxHarmonic).filter(p => p.order > 0));
    }
    if (config.doIMD) {
      newProducts.push(...intermodulation(currentInputs));
    }
    for (const p of newProducts) {
      const key = Math.round(p.freq * 10);
      if (!seen.has(key) || p.order < seen.get(key).order) {
        seen.set(key, p);
      }
    }
    currentInputs = [...inputs, ...seen.values()];
  }
  products = [...seen.values()];

  if (products.length > 0) {
    productsKeyboard.highlightFrequencies(products);
  } else {
    productsKeyboard.clearHighlight();
  }

  // Match info
  const matchEl = document.getElementById('match-info');
  const parts = [];
  if (result.matchedKeys.length) {
    parts.push(`<span class="matched">Matched: ${result.matchedKeys.join('  ')}</span>`);
  }
  if (result.missingKeys.length) {
    parts.push(`<span class="missing">Missing: ${result.missingKeys.join('  ')}</span>`);
  }
  if (result.extraKeys && result.extraKeys.length) {
    parts.push(`<span class="extra">Extra: ${result.extraKeys.join('  ')}</span>`);
  }
  matchEl.innerHTML = parts.join('<br>');
}

// --- Play ---
function play() {
  if (currentResults.length === 0) return;

  const result = currentResults[currentResultIndex];
  const rootMidi = getRootMidi();

  const inputMidiNotes = result.ratios.map(r => {
    const semitones = 12 * Math.log2(r);
    return rootMidi + Math.round(semitones);
  });

  const chordGain = parseInt(document.getElementById('chord-volume').value) / 100;
  audio.playChord(inputMidiNotes, 2.0, chordGain);

  // Play distortion products
  const inputFreqs = inputMidiNotes.map(m => tuning.noteFrequency(m));
  const inputs = inputFreqs.map(f => ({ freq: f, order: 0 }));
  const config = getDistortionConfig();

  let allProducts = [];
  let currentInputs = inputs;
  const seen = new Map();

  for (let d = 0; d < config.depth; d++) {
    let newProducts = [];
    if (config.doHarmonic) {
      newProducts.push(...harmonic(currentInputs, config.maxHarmonic).filter(p => p.order > 0));
    }
    if (config.doIMD) {
      newProducts.push(...intermodulation(currentInputs));
    }
    for (const p of newProducts) {
      const key = Math.round(p.freq * 10);
      if (!seen.has(key) || p.order < seen.get(key).order) {
        seen.set(key, p);
      }
    }
    currentInputs = [...inputs, ...seen.values()];
  }

  const productFreqs = [...seen.values()].map(p => p.freq).filter(f => f >= 20 && f <= 20000);
  if (productFreqs.length > 0) {
    const productsGain = parseInt(document.getElementById('distortion-volume').value) / 100;
    const delay = document.getElementById('delay-toggle').checked ? 0.3 : 0;
    audio.playFrequencies(productFreqs, productsGain, delay);
  }
}

// --- Navigation ---
function advanceResult(delta) {
  if (currentResults.length === 0) return;
  const next = Math.max(0, Math.min(currentResults.length - 1, currentResultIndex + delta));
  displayResult(next);
  play();
}

// --- Event listeners ---
maxNotesFilter.addEventListener('change', filterResults);
solveBtn.addEventListener('click', solve);

document.getElementById('play-btn').addEventListener('click', play);

document.getElementById('prev-btn').addEventListener('click', () => advanceResult(-1));
document.getElementById('next-btn').addEventListener('click', () => advanceResult(1));
scoringSelect.addEventListener('change', checkSolveNeeded);

resultSelect.addEventListener('change', () => {
  displayResult(parseInt(resultSelect.value));
  play();
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    play();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    advanceResult(-1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    advanceResult(1);
  }
});

document.getElementById('depth-slider').addEventListener('input', (e) => {
  document.getElementById('depth-label').textContent = e.target.value;
  checkSolveNeeded();
});

// Re-enable solve when solver-affecting params change
targetSelect.addEventListener('change', checkSolveNeeded);
modeSelect.addEventListener('change', checkSolveNeeded);
document.getElementById('harmonic-toggle').addEventListener('change', checkSolveNeeded);
document.getElementById('imd-toggle').addEventListener('change', checkSolveNeeded);

document.getElementById('chord-volume').addEventListener('input', (e) => {
  document.getElementById('chord-volume-label').textContent = `${e.target.value}%`;
});

document.getElementById('distortion-volume').addEventListener('input', (e) => {
  document.getElementById('distortion-volume-label').textContent = `${e.target.value}%`;
});

// Click top keyboard to shift root
keyboard.onNoteClick((midi) => {
  keySelect.value = KEY_NOTES.find(k => k.midi % 12 === midi % 12)?.midi ?? keySelect.value;
  octaveSelect.value = Math.floor(midi / 12) - 1;
  if (currentResults.length > 0) {
    displayResult(currentResultIndex);
    play();
  }
});

// --- Initial state ---
statusEl.textContent = 'Press Solve to find input notes for the target chord.';
