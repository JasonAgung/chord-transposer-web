import { transposeChordToken } from './chords';

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
