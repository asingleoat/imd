// piano.js — Renders an interactive piano keyboard in HTML/CSS

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK_INDICES = new Set([1, 3, 6, 8, 10]); // within octave

// Black key offsets within an octave (% of octave width)
const BLACK_OFFSETS = {
  1: 0.09,   // C#
  3: 0.22,   // D#
  6: 0.55,   // F#
  8: 0.68,   // G#
  10: 0.81,  // A#
};

export class PianoKeyboard {
  constructor(container, lowMidi = 36, highMidi = 107) {
    this._container = container;
    this._low = lowMidi;
    this._high = highMidi;
    this._keys = new Map(); // midi -> element
    this._noteClickCb = null;
    this._render();
  }

  _render() {
    this._container.innerHTML = '';
    this._container.classList.add('piano');

    // Count white keys for sizing
    const whiteKeys = [];
    const blackKeys = [];

    for (let midi = this._low; midi <= this._high; midi++) {
      const pc = midi % 12;
      if (BLACK_INDICES.has(pc)) {
        blackKeys.push(midi);
      } else {
        whiteKeys.push(midi);
      }
    }

    const totalWhite = whiteKeys.length;
    const whiteWidthPct = 100 / totalWhite;

    // Render white keys first
    let whiteIdx = 0;
    for (const midi of whiteKeys) {
      const key = document.createElement('div');
      key.className = 'piano-key white-key';
      key.dataset.midi = midi;
      key.style.left = `${whiteIdx * whiteWidthPct}%`;
      key.style.width = `${whiteWidthPct}%`;

      const label = document.createElement('span');
      label.className = 'key-label';
      const pc = midi % 12;
      const octave = Math.floor(midi / 12) - 1;
      label.textContent = pc === 0 ? `C${octave}` : '';
      key.appendChild(label);

      this._container.appendChild(key);
      this._keys.set(midi, key);
      this._bindClick(key, midi);
      whiteIdx++;
    }

    // Render black keys on top
    for (const midi of blackKeys) {
      const pc = midi % 12;
      // Find the white key just below this black key to position relative to it
      const prevWhiteMidi = midi - 1; // the white key to the left
      // Find which white-key index that corresponds to
      const wIdx = whiteKeys.indexOf(BLACK_INDICES.has((midi - 1) % 12) ? midi - 2 : midi - 1);

      const offsetWithinOctave = BLACK_OFFSETS[pc];
      const octaveStartPc = 0;
      // Find the C of this octave
      const octaveC = midi - pc;
      const octaveCWhiteIdx = whiteKeys.indexOf(octaveC);

      // Next octave C
      const nextOctaveC = octaveC + 12;
      const nextCWhiteIdx = whiteKeys.indexOf(nextOctaveC);
      const octaveWhiteCount = nextCWhiteIdx >= 0
        ? nextCWhiteIdx - octaveCWhiteIdx
        : 7; // default full octave

      const octaveWidthPct = octaveWhiteCount * whiteWidthPct;
      const leftPct = (octaveCWhiteIdx * whiteWidthPct) + (offsetWithinOctave * octaveWidthPct);

      const key = document.createElement('div');
      key.className = 'piano-key black-key';
      key.dataset.midi = midi;
      key.style.left = `${leftPct}%`;
      key.style.width = `${whiteWidthPct * 0.58}%`;

      this._container.appendChild(key);
      this._keys.set(midi, key);
      this._bindClick(key, midi);
    }
  }

  _bindClick(el, midi) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this._noteClickCb) this._noteClickCb(midi);
    });
  }

  highlightNotes(midiNotes, rootMidi = null) {
    this.clearHighlight();
    for (const midi of midiNotes) {
      const el = this._keys.get(midi);
      if (el) {
        el.classList.add('highlighted');
        if (midi === rootMidi || (rootMidi !== null && midi % 12 === rootMidi % 12)) {
          el.classList.add('root');
        }
      }
    }
  }

  // Highlight nearest keys for arbitrary frequencies, showing cent offset labels.
  // entries: array of { freq: Hz, kind: 'harmonic'|'sum'|'difference' }
  // a4: reference frequency for MIDI conversion (default 440)
  highlightFrequencies(entries, a4 = 440) {
    this.clearHighlight();

    // Group entries by nearest MIDI key, octave-shifting into range if needed
    const byKey = new Map(); // midi -> { kinds: Set, cents: [], octaveShifts: Set, minOrder }
    for (const { freq, kind, order } of entries) {
      if (freq < 20 || freq > 20000) continue;
      const exactMidi = 69 + 12 * Math.log2(freq / a4);
      let nearestMidi = Math.round(exactMidi);
      const cents = Math.round((exactMidi - nearestMidi) * 100);

      // Octave-shift into keyboard range if needed
      let octaveShift = 0;
      while (nearestMidi < this._low) { nearestMidi += 12; octaveShift++; }
      while (nearestMidi > this._high) { nearestMidi -= 12; octaveShift--; }

      if (!this._keys.has(nearestMidi)) continue;

      if (!byKey.has(nearestMidi)) {
        byKey.set(nearestMidi, { kinds: new Set(), cents: [], octaveShifts: new Set(), minOrder: Infinity });
      }
      const entry = byKey.get(nearestMidi);
      entry.kinds.add(kind || 'default');
      entry.cents.push(cents);
      if (octaveShift !== 0) entry.octaveShifts.add(octaveShift);
      if (order != null && order < entry.minOrder) entry.minOrder = order;
    }

    // Apply highlights
    for (const [midi, { kinds, cents, octaveShifts, minOrder }] of byKey) {
      const el = this._keys.get(midi);
      el.classList.add('highlighted');
      if (octaveShifts.size > 0) el.classList.add('octave-shifted');
      for (const k of kinds) {
        el.classList.add(`kind-${k}`);
      }

      // Opacity based on order: order 0 = full, higher = more transparent
      if (minOrder !== Infinity && minOrder > 0) {
        el.style.opacity = Math.max(0.25, 1 - minOrder * 0.15);
      }

      // Deduplicate cent values for the badge
      const uniqueCents = [...new Set(cents)].sort((a, b) => a - b);
      const centText = uniqueCents.map(c =>
        c === 0 ? '0¢' : `${c > 0 ? '+' : ''}${c}¢`
      ).join(' ');

      // Octave shift indicator
      let shiftText = '';
      if (octaveShifts.size > 0) {
        const shifts = [...octaveShifts].sort((a, b) => a - b);
        shiftText = shifts.map(s => {
          const abs = Math.abs(s);
          const label = abs === 1 ? '8va' : `${abs * 8}va`;
          return s > 0 ? `↓${label}` : `↑${label}`;
        }).join(' ');
      }

      const badge = document.createElement('span');
      badge.className = 'cent-badge';
      badge.textContent = shiftText ? `${shiftText} ${centText}` : centText;
      el.appendChild(badge);
    }
  }

  clearHighlight() {
    for (const el of this._keys.values()) {
      el.classList.remove('highlighted', 'root', 'kind-harmonic', 'kind-sum', 'kind-difference', 'octave-shifted');
      el.style.opacity = '';
      // Remove any cent badges
      el.querySelectorAll('.cent-badge').forEach(b => b.remove());
    }
  }

  onNoteClick(callback) {
    this._noteClickCb = callback;
  }
}

export function midiToNoteName(midi) {
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}
