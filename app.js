// app.js — Orchestrator: wires UI controls to chord/voicing/audio/piano modules

import { equalTemperament } from './tuning.js';
import { CHORD_TYPES, CATEGORIES, chordsByCategory } from './chords.js';
import { availableVoicings, applyVoicing } from './voicings.js';
import { AudioEngine } from './audio.js';
import { PianoKeyboard, midiToNoteName } from './piano.js';
import { harmonic, intermodulation } from './distortion.js';
import { rationalApproximations } from './fraction.js';

// --- State ---
let currentRoot = 60; // C4
let currentChordSymbol = 'maj7';
let currentVoicing = 'Root position';
let currentMidiNotes = [];

// --- Init modules ---
const tuning = equalTemperament(440);
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

// --- Compute and display current chord ---
function updateChord(play = true) {
  const chord = CHORD_TYPES.find(c => c.symbol === currentChordSymbol);
  if (!chord) return;

  const octave = parseInt(octaveSelect.value);
  const rootMidi = (currentRoot % 12) + (octave + 1) * 12; // MIDI: C4 = 60 = (4+1)*12

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
const CENTS_THRESHOLD = 5; // accept first approximation within this many cents

function updateSignature() {
  const el = document.getElementById('rational-signature');

  // Collect all frequencies: chord notes + any active distortion products
  const chordFreqs = currentMidiNotes.map(m => tuning.noteFrequency(m));
  const products = getDistortionProducts();
  const productFreqs = products.map(p => p.freq).filter(f => f >= 20 && f <= 20000);

  const allFreqs = [...chordFreqs, ...productFreqs].sort((a, b) => a - b);
  if (allFreqs.length === 0) { el.textContent = ''; return; }

  // Deduplicate frequencies that are very close (within 1 cent)
  const deduped = [allFreqs[0]];
  for (let i = 1; i < allFreqs.length; i++) {
    const cents = 1200 * Math.log2(allFreqs[i] / allFreqs[i - 1]);
    if (Math.abs(cents) > 1) deduped.push(allFreqs[i]);
  }

  const base = deduped[0];
  const ratios = deduped.map(f => {
    const ratio = f / base;
    if (Math.abs(ratio - 1) < 1e-9) return '1/1';

    // Walk convergents, pick the first one within threshold
    const approxes = rationalApproximations(ratio);
    for (const a of approxes) {
      if (Math.abs(a.error) <= CENTS_THRESHOLD) {
        return `${a.num}/${a.den}`;
      }
    }
    // Fallback: best available
    const best = approxes[approxes.length - 1];
    return `${best.num}/${best.den}`;
  });

  el.textContent = ratios.join('   ');
}

// --- Event listeners ---
rootSelect.addEventListener('change', () => {
  currentRoot = parseInt(rootSelect.value);
  updateChord();
});

octaveSelect.addEventListener('change', () => {
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

// Click a key to set it as the new root and play the chord
keyboard.onNoteClick((midi) => {
  currentRoot = midi;
  rootSelect.value = ROOT_NOTES.find(r => r.midi % 12 === midi % 12)?.midi ?? currentRoot;
  octaveSelect.value = Math.floor(midi / 12) - 1;
  updateChord(true);
});

// --- Initial render ---
refreshVoicings();
updateChord(false); // highlight but don't auto-play on load
