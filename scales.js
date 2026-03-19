// scales.js — Scale definitions and diatonic chord construction

export const SCALES = [
  { name: 'Major (Ionian)',     steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian',             steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian',           steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian',             steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian',         steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Natural Minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian',            steps: [0, 1, 3, 5, 6, 8, 10] },
  { name: 'Harmonic Minor',     steps: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Melodic Minor',      steps: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'Whole Tone',         steps: [0, 2, 4, 6, 8, 10] },
  { name: 'Diminished (HW)',    steps: [0, 1, 3, 4, 6, 7, 9, 10] },
  { name: 'Diminished (WH)',    steps: [0, 2, 3, 5, 6, 8, 9, 11] },
  { name: 'Pentatonic Major',   steps: [0, 2, 4, 7, 9] },
  { name: 'Pentatonic Minor',   steps: [0, 3, 5, 7, 10] },
  { name: 'Blues',              steps: [0, 3, 5, 6, 7, 10] },
];

export const COMPLEXITIES = [
  { name: 'Diatonic 2nd',   stackCount: 2, stackType: 'step' },
  { name: 'Diatonic 3rd',   stackCount: 2, stackType: 'tertian' },
  { name: 'Diatonic 4th',   stackCount: 2, stackType: 'quartal' },
  { name: 'Diatonic 5th',   stackCount: 2, stackType: 'quintal' },
  { name: 'Diatonic 6th',   stackCount: 2, stackType: 'sextal' },
  { name: 'Diatonic 7th',   stackCount: 2, stackType: 'septimal' },
  { name: 'Triad',          stackCount: 3, stackType: 'tertian' },
  { name: '7th',            stackCount: 4, stackType: 'tertian' },
  { name: '9th',            stackCount: 5, stackType: 'tertian' },
  { name: '11th',           stackCount: 6, stackType: 'tertian' },
  { name: '13th',           stackCount: 7, stackType: 'tertian' },
  { name: 'Quartal Triad',  stackCount: 3, stackType: 'quartal' },
  { name: 'Quartal 4-note', stackCount: 4, stackType: 'quartal' },
  { name: 'Quartal 5-note', stackCount: 5, stackType: 'quartal' },
];

const DEGREE_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export { DEGREE_NAMES };

// Build a diatonic chord from a scale.
// degree: 0-based scale degree (0 = I, 1 = II, ...)
// scale: { steps: number[] }
// complexity: { stackCount, stackType }
// Returns intervals in semitones from the chord root.
// Scale degree skip per stack type (how many scale degrees to jump per voice)
const STACK_SKIPS = {
  step:     1,  // diatonic 2nds
  tertian:  2,  // diatonic 3rds
  quartal:  3,  // diatonic 4ths
  quintal:  4,  // diatonic 5ths
  sextal:   5,  // diatonic 6ths
  septimal: 6,  // diatonic 7ths
};

export function diatonicChord(degree, scale, complexity) {
  const steps = scale.steps;
  const n = steps.length;
  const { stackCount, stackType } = complexity;
  const skip = STACK_SKIPS[stackType] || 2;

  const intervals = [0];
  for (let i = 1; i < stackCount; i++) {
    const scaleIdx = degree + i * skip;
    const octaves = Math.floor(scaleIdx / n);
    const semitones = steps[scaleIdx % n] + octaves * 12 - steps[degree];
    intervals.push(semitones);
  }

  return intervals;
}
