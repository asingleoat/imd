// app.js — Orchestrator: wires UI controls to chord/voicing/audio/piano modules

import { equalTemperament } from './tuning.js';
import { CHORD_TYPES, CATEGORIES, chordsByCategory } from './chords.js';
import { availableVoicings, applyVoicing } from './voicings.js';
import { AudioEngine } from './audio.js';
import { PianoKeyboard, midiToNoteName } from './piano.js';
import { harmonic, intermodulation } from './distortion.js';

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
for (let oct = 2; oct <= 5; oct++) {
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

  // Play chord first (stopAll clears previous sounds)
  if (play) {
    audio.playChord(midiNotes);
  }

  // Then layer distortion products on top
  updateDistortionProducts(play);
}

// --- Distortion ---
const harmonicToggle = document.getElementById('harmonic-toggle');
const imdToggle = document.getElementById('imd-toggle');
const delayToggle = document.getElementById('delay-toggle');
const distortionVolume = document.getElementById('distortion-volume');
const distortionVolumeLabel = document.getElementById('distortion-volume-label');

function getDistortionProducts() {
  const doHarmonic = harmonicToggle.checked;
  const doIMD = imdToggle.checked;
  if (!doHarmonic && !doIMD) return [];

  const inputs = currentMidiNotes.map(m => ({ freq: tuning.noteFrequency(m), order: 0 }));

  let products = [];
  if (doHarmonic) {
    const harmonics = harmonic(inputs, 2).filter(p => p.order > 0);
    products.push(...harmonics);
  }
  if (doIMD) {
    products.push(...intermodulation(inputs));
  }
  return products;
}

function updateDistortionProducts(play = false) {
  const products = getDistortionProducts();

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

harmonicToggle.addEventListener('change', () => updateDistortionProducts());
imdToggle.addEventListener('change', () => updateDistortionProducts());
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
