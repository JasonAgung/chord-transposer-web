import { detectKeyFromContent, isChordLine, transposeChart, transposeChordToken } from './chords';

describe('transposeChordToken', () => {
  it('should correctly transpose basic chords', () => {
    expect(transposeChordToken('C', 'C', 'G')).toBe('G');
    expect(transposeChordToken('Am', 'C', 'G')).toBe('Em');
    expect(transposeChordToken('G7', 'G', 'D')).toBe('D7');
  });

  it('should correctly transpose B chords', () => {
    expect(transposeChordToken('Bm', 'C', 'G')).toBe('F#m');
    expect(transposeChordToken('B7', 'B', 'C')).toBe('C7');
  });

  it('should correctly transpose major 7th chords', () => {
    expect(transposeChordToken('CM7', 'C', 'F')).toBe('FM7');
    expect(transposeChordToken('Cmaj7', 'C', 'F')).toBe('Fmaj7');
  });

  it('should correctly transpose extended chords', () => {
    expect(transposeChordToken('C9', 'C', 'D')).toBe('D9');
    expect(transposeChordToken('Cm11', 'C', 'D')).toBe('Dm11');
    expect(transposeChordToken('CM13', 'C', 'D')).toBe('DM13');
  });

  it('should correctly transpose altered chords with alternative notation', () => {
    expect(transposeChordToken('Co', 'C', 'E')).toBe('Eo');
    expect(transposeChordToken('C+', 'C', 'E')).toBe('E+');
  });

  it('should correctly transpose half-diminished and other altered chords', () => {
    expect(transposeChordToken('Cm7b5', 'C', 'G')).toBe('Gm7b5');
    expect(transposeChordToken('C7#5', 'C', 'G')).toBe('G7#5');
    expect(transposeChordToken('C7b9', 'C', 'G')).toBe('G7b9');
  });

  it('should correctly transpose special chords', () => {
    expect(transposeChordToken('Csus4', 'C', 'A')).toBe('Asus4');
    expect(transposeChordToken('Cadd9', 'C', 'A')).toBe('Aadd9');
    expect(transposeChordToken('C/E', 'C', 'G')).toBe('G/B');
    expect(transposeChordToken('C5', 'C', 'G')).toBe('G5');
  });

  it('should not transpose text that is not a chord', () => {
    expect(transposeChordToken('Chorus', 'C', 'G')).toBe('Chorus');
    expect(transposeChordToken('Verse', 'C', 'G')).toBe('Verse');
  });
});

describe('isChordLine', () => {
  it('accepts busy chord lines with few beat dots', () => {
    expect(isChordLine('| Cmaj7/E Am7/G | Dm7/C G7sus4 |')).toBe(true);
    expect(isChordLine('Intro : | C . . . | F . . . |')).toBe(true);
  });

  it('rejects lyric lines that happen to contain bars or chord letters', () => {
    expect(isChordLine('| Amazing grace how sweet |')).toBe(false);
    expect(isChordLine('| A great day to sing |')).toBe(false);
    expect(isChordLine('Do = C')).toBe(false);
  });
});

describe('transposeChordToken', () => {
  it('transposes chord forms the old pattern missed', () => {
    expect(transposeChordToken('C6/9', 'C', 'D')).toBe('D6/9');
    expect(transposeChordToken('C°7', 'C', 'D')).toBe('D°7');
    expect(transposeChordToken('Cø7', 'C', 'D')).toBe('Dø7');
    expect(transposeChordToken('CΔ7', 'C', 'D')).toBe('DΔ7');
    expect(transposeChordToken('C7(b9)', 'C', 'D')).toBe('D7(b9)');
    expect(transposeChordToken('Cm(maj7)', 'C', 'D')).toBe('Dm(maj7)');
    expect(transposeChordToken('F(up high)', 'C', 'D')).toBe('G(up high)');
  });

  it('spells borrowed chords by their role in the key', () => {
    expect(transposeChordToken('Ab', 'C', 'D')).toBe('Bb');
    expect(transposeChordToken('Bb', 'C', 'E')).toBe('D');
    expect(transposeChordToken('Eb', 'C', 'A')).toBe('C');
    expect(transposeChordToken('G#m', 'C', 'Bb')).toBe('F#m');
    expect(transposeChordToken('D/F#', 'G', 'F')).toBe('C/E');
  });

  it('falls back to a plain sharp or flat instead of E#, B#, Fb or Cb', () => {
    expect(transposeChordToken('A#', 'F', 'G')).toBe('C');
    expect(transposeChordToken('B', 'C', 'F#')).toBe('F');
  });

  it('keeps the writer\'s flat and sharp symbols', () => {
    expect(transposeChordToken('A♭', 'C', 'D')).toBe('B♭');
    expect(transposeChordToken('F♯m', 'D', 'E')).toBe('G♯m');
  });
});

describe('transposeChart', () => {
  it('transposes every chord on busy lines and leaves notes in parentheses alone', () => {
    const chart = 'Do = C\n| Cmaj7/E Am7/G | Dm7/C G7sus4 |\n| C(Bass only) . . . | Ab . Bb . |';
    expect(transposeChart(chart, 'C', 'D')).toBe('Do = D\n| Dmaj7/F# Bm7/A | Em7/D A7sus4 |\n| D(Bass only) . . . | Bb . C . |');
  });

  it('leaves lyric lines unchanged', () => {
    expect(transposeChart('| A great day to sing |', 'C', 'D')).toBe('| A great day to sing |');
  });
});

describe('detectKeyFromContent', () => {
  it('reads keys written with flat and sharp symbols', () => {
    expect(detectKeyFromContent('Do = B♭')).toBe('Bb');
    expect(detectKeyFromContent('Do = F♯')).toBe('F#');
  });
});
