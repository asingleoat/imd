// app.js — Orchestrator: wires UI controls to chord/voicing/audio/piano modules

import { equalTemperament, justIntonation } from './tuning.js';
import { CHORD_TYPES, CATEGORIES, chordsByCategory, identifyChord } from './chords.js';
import { availableVoicings, applyVoicing } from './voicings.js';
import { AudioEngine } from './audio.js';
import { PianoKeyboard, midiToNoteName } from './piano.js';
import { harmonic, intermodulation } from './distortion.js';
import { rationalApproximations } from './fraction.js';

// --- State ---
let currentRoot = 60; // C4
let currentChordSymbol = 'P5';
let currentVoicing = 'Root position';
let currentMidiNotes = [];

// --- Init modules ---
let tuning = equalTemperament(440);
const audio = new AudioEngine(tuning);
const keyboard = new PianoKeyboard(document.getElementById('keyboard'));
const productsKeyboard = new PianoKeyboard(document.getElementById('keyboard-products'));

// --- Root note names ---
const ROOT_NOTES = [
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

// --- Populate root selector ---
const rootSelect = document.getElementById('root-select');
for (const r of ROOT_NOTES) {
  const opt = document.createElement('option');
  opt.value = r.midi;
  opt.textContent = r.name;
  rootSelect.appendChild(opt);
}
rootSelect.value = currentRoot;

// --- Populate octave selector ---
const octaveSelect = document.getElementById('octave-select');
for (let oct = 2; oct <= 7; oct++) {
  const opt = document.createElement('option');
  opt.value = oct;
  opt.textContent = `Octave ${oct}`;
  octaveSelect.appendChild(opt);
}
octaveSelect.value = 4;

// --- Populate chord type selector (grouped by category) ---
const chordSelect = document.getElementById('chord-select');
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
  chordSelect.appendChild(group);
}
chordSelect.value = currentChordSymbol;

// --- Populate voicing selector ---
const voicingSelect = document.getElementById('voicing-select');

function refreshVoicings() {
  const chord = CHORD_TYPES.find(c => c.symbol === currentChordSymbol);
  if (!chord) return;
  const voicings = availableVoicings(chord.intervals);
  voicingSelect.innerHTML = '';
  for (const v of voicings) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    voicingSelect.appendChild(opt);
  }
  // Keep current voicing if still available, else reset
  if (voicings.includes(currentVoicing)) {
    voicingSelect.value = currentVoicing;
  } else {
    currentVoicing = voicings[0];
    voicingSelect.value = currentVoicing;
  }
}

// --- Tuning ---
const tuningSelect = document.getElementById('tuning-select');

let tuningRoot = 60; // independent of played chord root

function updateTuning() {
  if (tuningSelect.value === 'just') {
    tuning = justIntonation(tuningRoot);
  } else {
    tuning = equalTemperament(440);
  }
  audio.setTuning(tuning);
  const rootName = ROOT_NOTES.find(r => r.midi % 12 === tuningRoot % 12)?.name.split('/')[0] || '?';
  document.getElementById('tuning-info').textContent =
    tuningSelect.value === 'just' ? `Just intonation · key of ${rootName}` : '12-TET · A4 = 440 Hz';
}

// --- Compute and display current chord ---
function updateChord(play = true) {
  const chord = CHORD_TYPES.find(c => c.symbol === currentChordSymbol);
  if (!chord) return;

  const rootMidi = currentRoot;

  const midiNotes = applyVoicing(chord.intervals, rootMidi, currentVoicing);
  currentMidiNotes = midiNotes;

  // Update displays
  const rootName = ROOT_NOTES.find(r => r.midi % 12 === currentRoot % 12)?.name.split('/')[0] || '?';
  document.getElementById('chord-display').textContent = `${rootName}${chord.symbol === 'maj' ? '' : chord.symbol}`;
  document.getElementById('notes-display').textContent = midiNotes.map(midiToNoteName).join('  ');

  // Update piano
  keyboard.highlightNotes(midiNotes, rootMidi);

  // Compute total voice count for gain scaling
  const products = getDistortionProducts();
  const productFreqs = products.map(p => p.freq).filter(f => f >= 20 && f <= 20000);
  const totalVoices = midiNotes.length + productFreqs.length;

  // Play chord first (stopAll clears previous sounds)
  if (play) {
    audio.setExpectedVoices(totalVoices);
    const chordGain = parseInt(chordVolume.value) / 100;
    audio.playChord(midiNotes, 2.0, chordGain);
  }

  // Then layer distortion products on top
  updateDistortionProducts(play, products);

  // Update rational signature
  updateSignature();
}

// --- Distortion ---
const chordVolume = document.getElementById('chord-volume');
const chordVolumeLabel = document.getElementById('chord-volume-label');
const harmonicToggle = document.getElementById('harmonic-toggle');
const imdToggle = document.getElementById('imd-toggle');
const delayToggle = document.getElementById('delay-toggle');
const distortionVolume = document.getElementById('distortion-volume');
const distortionVolumeLabel = document.getElementById('distortion-volume-label');
const depthSlider = document.getElementById('depth-slider');
const depthLabel = document.getElementById('depth-label');

function getDistortionProducts() {
  const doHarmonic = harmonicToggle.checked;
  const doIMD = imdToggle.checked;
  if (!doHarmonic && !doIMD) return [];

  const depth = parseInt(depthSlider.value);
  const fundamentals = currentMidiNotes.map(m => ({ freq: tuning.noteFrequency(m), order: 0, kind: 'harmonic' }));

  // Track all products across iterations; use a freq key to deduplicate
  const seen = new Map(); // freq (rounded to 0.1Hz) -> product
  let currentInputs = fundamentals;

  for (let d = 0; d < depth; d++) {
    let newProducts = [];

    if (doHarmonic) {
      const harmonics = harmonic(currentInputs, 2).filter(p => p.order > 0);
      newProducts.push(...harmonics);
    }
    if (doIMD) {
      newProducts.push(...intermodulation(currentInputs));
    }

    // Deduplicate: keep the lowest order for each freq
    const iterNew = [];
    for (const p of newProducts) {
      const key = Math.round(p.freq * 10);
      if (!seen.has(key) || p.order < seen.get(key).order) {
        seen.set(key, p);
        iterNew.push(p);
      }
    }

    // Next iteration: combine fundamentals + all products so far
    currentInputs = [...fundamentals, ...seen.values()];
  }

  return [...seen.values()];
}

function updateDistortionProducts(play = false, products = null) {
  if (!products) products = getDistortionProducts();

  // Always update visualization
  if (products.length > 0) {
    productsKeyboard.highlightFrequencies(products);
  } else {
    productsKeyboard.clearHighlight();
  }

  // Only play when requested
  if (play && products.length > 0) {
    const freqs = products.map(p => p.freq);
    const gainMul = parseInt(distortionVolume.value) / 100;
    const delay = delayToggle.checked ? 0.3 : 0;
    audio.playFrequencies(freqs, gainMul, delay);
  }
}

// --- Rational signature ---
const centsThresholdSlider = document.getElementById('cents-threshold');
const centsThresholdLabel = document.getElementById('cents-threshold-label');

function getCentsThreshold() {
  return parseInt(centsThresholdSlider.value);
}

function ratioString(freq, base) {
  const ratio = freq / base;
  if (Math.abs(ratio - 1) < 1e-9) return '1/1';
  const approxes = rationalApproximations(ratio);
  for (const a of approxes) {
    if (Math.abs(a.error) <= getCentsThreshold()) {
      return `${a.num}/${a.den}`;
    }
  }
  const best = approxes[approxes.length - 1];
  return `${best.num}/${best.den}`;
}

// Nearest note name for an arbitrary frequency
function freqToNoteName(freq, a4 = 440) {
  const midi = Math.round(69 + 12 * Math.log2(freq / a4));
  return midiToNoteName(midi);
}

function renderSigCells(container, texts) {
  container.innerHTML = '';
  for (const t of texts) {
    const span = document.createElement('span');
    span.className = 'sig-cell';
    span.textContent = t;
    container.appendChild(span);
  }
}

function updateSignature() {
  const bottomEl = document.getElementById('sig-bottom');
  const rootEl = document.getElementById('sig-root');
  const namesEl = document.getElementById('sig-names');

  // Collect all frequencies: chord notes + any active distortion products
  const chordFreqs = currentMidiNotes.map(m => tuning.noteFrequency(m));
  const products = getDistortionProducts();
  const productFreqs = products.map(p => p.freq).filter(f => f >= 20 && f <= 20000);

  const allFreqs = [...chordFreqs, ...productFreqs].sort((a, b) => a - b);
  if (allFreqs.length === 0) {
    renderSigCells(bottomEl, []);
    renderSigCells(rootEl, []);
    renderSigCells(namesEl, []);
    return;
  }

  // Deduplicate frequencies that are very close (within 1 cent)
  const deduped = [allFreqs[0]];
  for (let i = 1; i < allFreqs.length; i++) {
    const cents = 1200 * Math.log2(allFreqs[i] / allFreqs[i - 1]);
    if (Math.abs(cents) > 1) deduped.push(allFreqs[i]);
  }

  const noteNames = deduped.map(f => freqToNoteName(f));

  // Bottom-referred signature
  const bottomFreq = deduped[0];
  renderSigCells(bottomEl, deduped.map(f => ratioString(f, bottomFreq)));

  // Root-referred signature (root = the played chord root)
  const rootFreq = tuning.noteFrequency(currentRoot);
  const rootRatios = deduped.map(f => ratioString(f, rootFreq));
  renderSigCells(rootEl, rootRatios);
  renderSigCells(namesEl, noteNames);

  // Identify chord function from root-referred intervals
  const chordNameEl = document.getElementById('sig-chord-name');
  const semitones = deduped.map(f => {
    const cents = 1200 * Math.log2(f / rootFreq);
    return Math.round(cents / 100);
  });
  const identified = identifyChord(semitones);
  if (identified) {
    const rootName = ROOT_NOTES.find(r => r.midi % 12 === currentRoot % 12)?.name.split('/')[0] || '?';
    let label = `${rootName}${identified.symbol === 'maj' ? '' : identified.symbol}`;
    if (identified.extra.length > 0) {
      const extraNames = identified.extra.map(pc => {
        const INTERVAL_NAMES = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
        return INTERVAL_NAMES[pc];
      });
      label += ` (add ${extraNames.join(', ')})`;
    }
    chordNameEl.textContent = label;
  } else {
    chordNameEl.textContent = '';
  }
}

// --- Event listeners ---
tuningSelect.addEventListener('change', () => {
  updateTuning();
  updateChord();
});

rootSelect.addEventListener('change', () => {
  tuningRoot = parseInt(rootSelect.value);
  currentRoot = (tuningRoot % 12) + (parseInt(octaveSelect.value) + 1) * 12;
  updateTuning();
  updateChord();
});

octaveSelect.addEventListener('change', () => {
  currentRoot = (tuningRoot % 12) + (parseInt(octaveSelect.value) + 1) * 12;
  updateChord();
});

chordSelect.addEventListener('change', () => {
  currentChordSymbol = chordSelect.value;
  refreshVoicings();
  updateChord();
});

voicingSelect.addEventListener('change', () => {
  currentVoicing = voicingSelect.value;
  updateChord();
});

document.getElementById('play-btn').addEventListener('click', () => {
  updateChord(true);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    updateChord(true);
  }
});

chordVolume.addEventListener('input', () => {
  chordVolumeLabel.textContent = `${chordVolume.value}%`;
});
harmonicToggle.addEventListener('change', () => { updateDistortionProducts(); updateSignature(); });
imdToggle.addEventListener('change', () => { updateDistortionProducts(); updateSignature(); });
depthSlider.addEventListener('input', () => {
  depthLabel.textContent = depthSlider.value;
  updateDistortionProducts();
  updateSignature();
});
distortionVolume.addEventListener('input', () => {
  distortionVolumeLabel.textContent = `${distortionVolume.value}%`;
});
centsThresholdSlider.addEventListener('input', () => {
  centsThresholdLabel.textContent = `${centsThresholdSlider.value}¢`;
  updateSignature();
});

// Click a key to play the current chord from that note (tuning unchanged)
keyboard.onNoteClick((midi) => {
  currentRoot = midi;
  updateChord(true);
});

// --- Initial render ---
updateTuning();
refreshVoicings();
updateChord(false); // highlight but don't auto-play on load
