// tuning.js — Frequency provider with swappable temperaments
// All other modules use MIDI note numbers; this is the only place Hz are computed.

export class Tuning {
  constructor(name, freqFn) {
    this.name = name;
    this._freqFn = freqFn;
  }

  noteFrequency(midiNote) {
    return this._freqFn(midiNote);
  }
}

export function equalTemperament(a4 = 440) {
  return new Tuning(`12-TET (A4=${a4})`, (midi) => a4 * Math.pow(2, (midi - 69) / 12));
}

// 5-limit just intonation ratios for each pitch class (semitones from root)
const JUST_RATIOS = [
  1/1,       // unison
  16/15,     // minor 2nd
  9/8,       // major 2nd
  6/5,       // minor 3rd
  5/4,       // major 3rd
  4/3,       // perfect 4th
  45/32,     // tritone (augmented 4th)
  3/2,       // perfect 5th
  8/5,       // minor 6th
  5/3,       // major 6th
  9/5,       // minor 7th
  15/8,      // major 7th
];

// Just intonation relative to a given root MIDI note.
// rootMidi determines which pitch class is 1/1; all others are pure ratios from it.
export function justIntonation(rootMidi = 60, a4 = 440) {
  const rootFreq = a4 * Math.pow(2, (rootMidi - 69) / 12);
  return new Tuning(`Just (root=${rootMidi})`, (midi) => {
    const pc = ((midi - rootMidi) % 12 + 12) % 12;
    const octave = Math.floor((midi - rootMidi) / 12);
    return rootFreq * JUST_RATIOS[pc] * Math.pow(2, octave);
  });
}
