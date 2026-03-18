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
