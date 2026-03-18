// audio.js — Web Audio synthesis engine
// Uses the Tuning module for MIDI→Hz conversion.

export class AudioEngine {
  constructor(tuning) {
    this._tuning = tuning;
    this._ctx = null;
    this._activeNodes = [];
    this._masterGain = null;
    this._compressor = null;
    this._totalVoiceCount = 0; // tracks total polyphony across all calls
  }

  _ensureContext() {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') this._ctx.resume();
      return;
    }
    this._ctx = new AudioContext();
    this._compressor = this._ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -18;
    this._compressor.knee.value = 12;
    this._compressor.ratio.value = 12;
    this._compressor.attack.value = 0.003;
    this._compressor.release.value = 0.1;
    this._compressor.connect(this._ctx.destination);

    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = 0.35;
    this._masterGain.connect(this._compressor);
  }

  setTuning(tuning) {
    this._tuning = tuning;
  }

  // Inform the engine how many total voices will play (chord + products)
  // so per-note gain can be scaled globally. Call before playChord/playFrequencies.
  setExpectedVoices(count) {
    this._totalVoiceCount = count;
  }

  playChord(midiNotes, duration = 2.0, gainMul = 1.0) {
    this._ensureContext();
    this.stopAll();
    const freqs = midiNotes.map(m => this._tuning.noteFrequency(m));
    this._playFreqs(freqs, gainMul, 0, duration, 'sine');
  }

  // Play arbitrary frequencies with a gain multiplier and start offset.
  // Does NOT call stopAll — layers on top of whatever is already playing.
  // Uses sine waves for cleaner mixing at high polyphony.
  playFrequencies(freqs, gainMul = 1.0, startOffset = 0, duration = 2.0) {
    this._ensureContext();
    this._playFreqs(freqs, gainMul, startOffset, duration, 'sine');
  }

  _playFreqs(freqs, gainMul, startOffset, duration, waveform) {
    const now = this._ctx.currentTime + startOffset;
    const attack = 0.01;
    const decay = 0.12;
    const sustainLevel = 0.5;
    const release = 0.4;
    const sustainEnd = now + duration - release;

    // Scale per-note gain by total expected polyphony
    const totalVoices = Math.max(freqs.length, this._totalVoiceCount);
    const noteGain = Math.min(1.0, 2.0 / Math.sqrt(totalVoices)) * gainMul;

    const useDualOsc = waveform === 'sawtooth';

    for (const freq of freqs) {
      if (freq < 20 || freq > 20000) continue;

      const osc1 = this._ctx.createOscillator();
      osc1.type = waveform;
      osc1.frequency.value = freq;

      let warmth = 0;
      let osc2 = null;
      if (useDualOsc) {
        osc2 = this._ctx.createOscillator();
        osc2.type = waveform;
        osc2.frequency.value = freq;
        osc1.detune.value = -warmth;
        osc2.detune.value = warmth;
      }

      // Low-pass filter
      const filter = this._ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.min(freq * 4, 8000);
      filter.Q.value = 0.7;

      // Gain envelope
      const env = this._ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(noteGain, now + attack);
      env.gain.linearRampToValueAtTime(noteGain * sustainLevel, now + attack + decay);
      env.gain.setValueAtTime(noteGain * sustainLevel, sustainEnd);
      env.gain.linearRampToValueAtTime(0, sustainEnd + release);

      osc1.connect(filter);
      if (osc2) osc2.connect(filter);
      filter.connect(env);
      env.connect(this._masterGain);

      osc1.start(now);
      osc1.stop(sustainEnd + release + 0.05);
      if (osc2) {
        osc2.start(now);
        osc2.stop(sustainEnd + release + 0.05);
      }

      this._activeNodes.push({ osc1, osc2, filter, env });
    }
  }

  stopAll() {
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    for (const node of this._activeNodes) {
      try {
        node.env.gain.cancelScheduledValues(now);
        node.env.gain.setValueAtTime(node.env.gain.value, now);
        node.env.gain.linearRampToValueAtTime(0, now + 0.05);
        node.osc1.stop(now + 0.06);
        if (node.osc2) node.osc2.stop(now + 0.06);
      } catch (e) {
        // Already stopped
      }
    }
    this._activeNodes = [];
    this._totalVoiceCount = 0;
  }
}
