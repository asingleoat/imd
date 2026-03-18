// chords.js — Chord definitions as interval sets (semitones from root)
// Jazz terminology throughout. Intervals are abstract pitch-classes;
// voicing/octave placement is handled by voicings.js.

export const CATEGORIES = [
  'Triads',
  '7ths',
  '6ths',
  '9ths',
  '11ths',
  '13ths',
  'Altered dominants',
  'Quartal',
  'Double stops',
  'Power',
];

export const CHORD_TYPES = [
  // --- Triads ---
  { symbol: 'maj',  name: 'Major',         category: 'Triads', intervals: [0, 4, 7] },
  { symbol: 'min',  name: 'Minor',         category: 'Triads', intervals: [0, 3, 7] },
  { symbol: 'dim',  name: 'Diminished',    category: 'Triads', intervals: [0, 3, 6] },
  { symbol: 'aug',  name: 'Augmented',     category: 'Triads', intervals: [0, 4, 8] },
  { symbol: 'sus2', name: 'Suspended 2nd', category: 'Triads', intervals: [0, 2, 7] },
  { symbol: 'sus4', name: 'Suspended 4th', category: 'Triads', intervals: [0, 5, 7] },

  // --- 7ths ---
  { symbol: 'maj7',      name: 'Major 7th',           category: '7ths', intervals: [0, 4, 7, 11] },
  { symbol: '7',         name: 'Dominant 7th',         category: '7ths', intervals: [0, 4, 7, 10] },
  { symbol: 'min7',      name: 'Minor 7th',            category: '7ths', intervals: [0, 3, 7, 10] },
  { symbol: 'min(maj7)', name: 'Minor-Major 7th',      category: '7ths', intervals: [0, 3, 7, 11] },
  { symbol: 'dim7',      name: 'Diminished 7th',       category: '7ths', intervals: [0, 3, 6, 9] },
  { symbol: 'ø7',        name: 'Half-Diminished 7th',  category: '7ths', intervals: [0, 3, 6, 10] },
  { symbol: 'aug7',      name: 'Augmented 7th',        category: '7ths', intervals: [0, 4, 8, 10] },
  { symbol: 'aug(maj7)', name: 'Augmented Major 7th',  category: '7ths', intervals: [0, 4, 8, 11] },
  { symbol: '7sus4',     name: 'Dominant 7th sus4',    category: '7ths', intervals: [0, 5, 7, 10] },

  // --- 6ths ---
  { symbol: '6',    name: 'Major 6th', category: '6ths', intervals: [0, 4, 7, 9] },
  { symbol: 'min6', name: 'Minor 6th', category: '6ths', intervals: [0, 3, 7, 9] },

  // --- 9ths ---
  { symbol: '9',    name: 'Dominant 9th', category: '9ths', intervals: [0, 4, 7, 10, 14] },
  { symbol: 'maj9', name: 'Major 9th',    category: '9ths', intervals: [0, 4, 7, 11, 14] },
  { symbol: 'min9', name: 'Minor 9th',    category: '9ths', intervals: [0, 3, 7, 10, 14] },
  { symbol: 'add9', name: 'Add 9',        category: '9ths', intervals: [0, 4, 7, 14] },
  { symbol: '6/9',  name: 'Six-Nine',     category: '9ths', intervals: [0, 4, 7, 9, 14] },

  // --- 11ths ---
  { symbol: '11',    name: 'Dominant 11th', category: '11ths', intervals: [0, 4, 7, 10, 14, 17] },
  { symbol: 'maj11', name: 'Major 11th',    category: '11ths', intervals: [0, 4, 7, 11, 14, 17] },
  { symbol: 'min11', name: 'Minor 11th',    category: '11ths', intervals: [0, 3, 7, 10, 14, 17] },

  // --- 13ths ---
  { symbol: '13',    name: 'Dominant 13th', category: '13ths', intervals: [0, 4, 7, 10, 14, 17, 21] },
  { symbol: 'maj13', name: 'Major 13th',    category: '13ths', intervals: [0, 4, 7, 11, 14, 17, 21] },
  { symbol: 'min13', name: 'Minor 13th',    category: '13ths', intervals: [0, 3, 7, 10, 14, 17, 21] },

  // --- Altered dominants ---
  { symbol: '7♯9',  name: 'Dominant 7th ♯9 (Hendrix)',  category: 'Altered dominants', intervals: [0, 4, 7, 10, 15] },
  { symbol: '7♭9',  name: 'Dominant 7th ♭9',            category: 'Altered dominants', intervals: [0, 4, 7, 10, 13] },
  { symbol: '7♯11', name: 'Dominant 7th ♯11 (Lydian)',  category: 'Altered dominants', intervals: [0, 4, 7, 10, 18] },
  { symbol: '7♭13', name: 'Dominant 7th ♭13',           category: 'Altered dominants', intervals: [0, 4, 7, 10, 20] },
  { symbol: '7alt', name: 'Altered Dominant',            category: 'Altered dominants', intervals: [0, 4, 10, 13, 15, 18] },
  { symbol: '7♯9♭13', name: 'Dom 7th ♯9♭13',           category: 'Altered dominants', intervals: [0, 4, 7, 10, 15, 20] },

  // --- Quartal ---
  { symbol: 'Q3',      name: 'Quartal Triad',       category: 'Quartal', intervals: [0, 5, 10] },
  { symbol: 'Q4',      name: 'Quartal 4-note',      category: 'Quartal', intervals: [0, 5, 10, 15] },
  { symbol: 'Q5',      name: 'Quartal 5-note',      category: 'Quartal', intervals: [0, 5, 10, 15, 20] },
  { symbol: 'So What', name: 'So What (4ths + 3rd)', category: 'Quartal', intervals: [0, 5, 10, 15, 19] },

  // --- Double stops ---
  { symbol: 'm2',  name: 'Minor 2nd',     category: 'Double stops', intervals: [0, 1] },
  { symbol: 'M2',  name: 'Major 2nd',     category: 'Double stops', intervals: [0, 2] },
  { symbol: 'm3',  name: 'Minor 3rd',     category: 'Double stops', intervals: [0, 3] },
  { symbol: 'M3',  name: 'Major 3rd',     category: 'Double stops', intervals: [0, 4] },
  { symbol: 'P4',  name: 'Perfect 4th',   category: 'Double stops', intervals: [0, 5] },
  { symbol: 'TT',  name: 'Tritone',       category: 'Double stops', intervals: [0, 6] },
  { symbol: 'P5',  name: 'Perfect 5th',   category: 'Double stops', intervals: [0, 7] },
  { symbol: 'm6',  name: 'Minor 6th',     category: 'Double stops', intervals: [0, 8] },
  { symbol: 'M6',  name: 'Major 6th',     category: 'Double stops', intervals: [0, 9] },
  { symbol: 'm7',  name: 'Minor 7th',     category: 'Double stops', intervals: [0, 10] },
  { symbol: 'M7',  name: 'Major 7th',     category: 'Double stops', intervals: [0, 11] },
  { symbol: 'P8',  name: 'Octave',        category: 'Double stops', intervals: [0, 12] },

  // --- Power ---
  { symbol: '5', name: 'Power Chord', category: 'Power', intervals: [0, 7] },
];

export function chordsByCategory() {
  const map = new Map();
  for (const cat of CATEGORIES) {
    map.set(cat, CHORD_TYPES.filter(c => c.category === cat));
  }
  return map;
}

export function findChord(symbol) {
  return CHORD_TYPES.find(c => c.symbol === symbol) || null;
}

// Identify a chord from a set of semitone intervals from root.
// intervals: array of semitones (not necessarily starting with 0).
// Returns { symbol, name, category, extra } where extra is leftover intervals not in the match,
// or null if no match.
export function identifyChord(intervals) {
  // Normalise: ensure 0 is present, reduce to unique pitch classes, sort
  const pcs = [...new Set(intervals.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  if (pcs.length === 0) return null;

  // Try to match against all chord types, preferring the longest (most specific) match
  let bestMatch = null;
  let bestSize = 0;
  let bestExtra = Infinity;

  for (const chord of CHORD_TYPES) {
    const chordPcs = [...new Set(chord.intervals.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b);

    // Check if all chord pitch classes are present in our set
    const allPresent = chordPcs.every(pc => pcs.includes(pc));
    if (!allPresent) continue;

    const extraCount = pcs.length - chordPcs.length;
    // Prefer: largest chord that matches, then fewest extra notes
    if (chordPcs.length > bestSize || (chordPcs.length === bestSize && extraCount < bestExtra)) {
      bestMatch = chord;
      bestSize = chordPcs.length;
      bestExtra = extraCount;
    }
  }

  if (!bestMatch) return null;

  const matchedPcs = new Set(bestMatch.intervals.map(i => ((i % 12) + 12) % 12));
  const extra = pcs.filter(pc => !matchedPcs.has(pc));

  return {
    symbol: bestMatch.symbol,
    name: bestMatch.name,
    category: bestMatch.category,
    extra,
  };
}
