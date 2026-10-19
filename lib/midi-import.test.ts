import { isChordLine, parseChord, TOKEN_RE } from './chords';
import { detectKey, midiToChart, nameChord, parseMidi, spellNote } from './midi-import';

const PPQ = 480;

function varLen(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

// A one-track MIDI file. Chords are [start, length] in quarter notes plus their pitches.
function midiFile(chords: [number, number, number[]][], meta: number[][] = []): Uint8Array {
  const events: { tick: number; bytes: number[] }[] = [];
  for (const [start, length, pitches] of chords) {
    for (const p of pitches) {
      events.push({ tick: start * PPQ, bytes: [0x90, p, 100] });
      events.push({ tick: (start + length) * PPQ, bytes: [0x80, p, 64] });
    }
  }
  // Note-offs before note-ons at the same tick, like a real sequencer
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] === 0x80 ? -1 : 1));
  const track: number[] = [];
  for (const m of meta) track.push(0, ...m);
  let tick = 0;
  for (const e of events) {
    track.push(...varLen(e.tick - tick), ...e.bytes);
    tick = e.tick;
  }
  track.push(0, 0xff, 0x2f, 0);
  const u32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  return new Uint8Array([
    ...[0x4d, 0x54, 0x68, 0x64], ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 0xff,
    ...[0x4d, 0x54, 0x72, 0x6b], ...u32(track.length), ...track,
  ]);
}

const TEMPO_101 = [0xff, 0x51, 3, 0x09, 0x10, 0x8b];
const FOUR_FOUR = [0xff, 0x58, 4, 4, 2, 24, 8];
const C_MAJOR_SIGNATURE = [0xff, 0x59, 2, 0, 0];

// Voicings as Logic writes them: root doubled in the bass
const Bbmaj7 = [46, 58, 62, 65, 69];
const A7 = [45, 57, 61, 64, 67];
const Dm7 = [50, 62, 65, 69, 72];
const Gm = [43, 55, 58, 62];
const F = [41, 53, 57, 60];

describe('nameChord', () => {
  it('names chords with the bass as root', () => {
    expect(nameChord(Bbmaj7, 'F')).toBe('Bbmaj7');
    expect(nameChord(A7, 'F')).toBe('A7');
    expect(nameChord(Dm7, 'F')).toBe('Dm7');
    expect(nameChord([50, 62, 67, 69, 72], 'F')).toBe('D7sus4');
    expect(nameChord([48, 60, 65, 67], 'F')).toBe('Csus4');
    expect(nameChord([45, 57, 61, 67, 77], 'F')).toBe('A7#5');
  });

  it('accepts seventh chords without a fifth', () => {
    expect(nameChord([43, 53, 59], 'C')).toBe('G7');
  });

  it('names inversions and chords over another bass note', () => {
    expect(nameChord([33, 41, 53, 57, 60], 'F')).toBe('F/A');
    expect(nameChord([40, 48, 60, 64, 67], 'F')).toBe('C/E');
    expect(nameChord([42, 50, 62, 66, 69], 'F')).toBe('D/F#');
    expect(nameChord([38, 60, 64, 67], 'C')).toBe('C/D');
  });

  it('returns null for notes that are not a known chord', () => {
    expect(nameChord([60, 61, 62], 'C')).toBeNull();
    expect(nameChord([], 'C')).toBeNull();
  });
});

describe('spellNote', () => {
  it('spells by the role in the key', () => {
    expect(spellNote(10, 'F')).toBe('Bb');
    expect(spellNote(8, 'E')).toBe('G#');
    expect(spellNote(3, 'F')).toBe('Eb');
  });
});

describe('detectKey', () => {
  it('finds the major key of a minor-key progression', () => {
    const chords = [Bbmaj7, A7, Dm7, Gm, F].map((pitches) => ({ pitches, duration: 1 }));
    expect(detectKey(chords)).toBe('F');
  });

  it('finds a plain major key', () => {
    const chords = [[48, 52, 55], [41, 45, 48], [43, 47, 50], [48, 52, 55]].map((pitches) => ({ pitches, duration: 1 }));
    expect(detectKey(chords)).toBe('C');
  });
});

describe('parseMidi', () => {
  it('reads notes, tempo, time signature and key signature', () => {
    const song = parseMidi(midiFile([[0, 2, [60, 64]]], [TEMPO_101, FOUR_FOUR, C_MAJOR_SIGNATURE]));
    expect(song.ppq).toBe(PPQ);
    expect(Math.round(song.bpm!)).toBe(101);
    expect(song.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(song.keySharps).toBe(0);
    expect(song.notes).toEqual([
      { pitch: 60, start: 0, end: 960 },
      { pitch: 64, start: 0, end: 960 },
    ]);
  });

  it('handles running status and note-on with velocity 0 as note-off', () => {
    const track = [0, 0x90, 60, 100, 0, 64, 100, 0x83, 0x60, 60, 0, 0, 64, 0, 0, 0xff, 0x2f, 0];
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track,
    ]);
    expect(parseMidi(bytes).notes).toEqual([
      { pitch: 60, start: 0, end: 480 },
      { pitch: 64, start: 0, end: 480 },
    ]);
  });

  it('rejects files that are not MIDI', () => {
    expect(() => parseMidi(new TextEncoder().encode('| C . . . |'))).toThrow('Not a MIDI file.');
  });
});

describe('midiToChart', () => {
  const song = midiFile(
    [
      // Pushed an eighth early into bar 2, like Logic's detected chords
      [3.5, 2, Bbmaj7],
      [5.5, 2, A7],
      [7.5, 8, Dm7],
      // Two beats of silence, then a chord pushed into beat 3
      [17.5, 2.5, Gm],
      [20, 4, F],
    ],
    [TEMPO_101, FOUR_FOUR, C_MAJOR_SIGNATURE],
  );
  const chart = midiToChart(song, { title: 'Test Song' });

  it('writes the header with the detected key, ignoring a default C major signature', () => {
    expect(chart.split('\n').slice(0, 5)).toEqual(['Test Song', 'Do = F', 'Time Signature = 4/4', 'Tempo (1/4) = 101 BPM', '']);
  });

  it('marks pushed chords (up) on the next beat and repeats held chords at each bar', () => {
    expect(chart.split('\n').slice(5)).toEqual([
      '| Bbmaj7(up) . A7(up) . | Dm7(up) . . . | Dm7 . . . | N.C. . Gm(up) . |',
      '| F . . . |',
    ]);
  });

  it('rounds chords played only slightly early without marking them', () => {
    const early = midiFile([[0, 3.95, Bbmaj7], [3.95, 4, A7]]);
    expect(midiToChart(early, { title: 'T', key: 'F' })).toContain('| Bbmaj7 . . . | A7 . . . |');
  });

  it('writes only lines the rest of the app reads as chord lines', () => {
    for (const line of chart.split('\n').slice(5)) {
      expect(isChordLine(line)).toBe(true);
      for (const token of line.match(TOKEN_RE) ?? []) {
        expect(token === '.' || token === 'N.C.' || parseChord(token) !== null).toBe(true);
      }
    }
  });

  it('uses the key passed in', () => {
    expect(midiToChart(song, { title: 'T', key: 'Bb' })).toContain('Do = Bb');
  });

  it('marks chords it cannot name', () => {
    expect(midiToChart(midiFile([[0, 4, [60, 61, 62]]]), { title: 'T', key: 'C' })).toContain('| C(?) . . . |');
  });

  it('explains an export without notes', () => {
    expect(() => midiToChart(midiFile([], [TEMPO_101]), { title: 'T' })).toThrow(/no notes/);
  });
});
