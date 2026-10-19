import { renderChart } from './render';

const chart = 'Do = C\n| C . . . | Am . . . | F . . . | G7 . . . |';

describe('renderChart', () => {
  it('writes major chords as upper-case and minor as lower-case Roman numerals', () => {
    expect(renderChart(chart, 'C', 'roman')).toBe('Do = C\n| I . . . | vi . . . | IV . . . | V7 . . . |');
  });

  it('writes diminished chords as lower-case Roman numerals', () => {
    expect(renderChart('Do = C\n| Bdim . . . | C . . . |', 'C', 'roman')).toBe('Do = C\n| viidim . . . | I . . . |');
  });

  it('transposes before converting, so the target key is kept', () => {
    expect(renderChart(chart, 'D', 'default')).toBe('Do = D\n| D . . . | Bm . . . | G . . . | A7 . . . |');
    expect(renderChart(chart, 'D', 'arabic')).toBe('Do = D\n| 1 . . . | 6m . . . | 4 . . . | 57 . . . |');
  });

  it('leaves the chart unchanged when the target key is the original key', () => {
    const borrowed = 'Do = C\n| Bb . . . | C . . . |';
    expect(renderChart(borrowed, 'C', 'default')).toBe(borrowed);
  });

  it('returns null when the chart has no "Do =" line', () => {
    expect(renderChart('| C . . . |', 'D', 'default')).toBeNull();
  });
});

describe('number notation', () => {
  it('keeps notes in parentheses as written', () => {
    expect(renderChart('Do = C\n| C(Bass only) . . . | F . . . |', 'C', 'arabic')).toBe('Do = C\n| 1(Bass only) . . . | 4 . . . |');
  });

  it('writes minor extensions once and names borrowed chords by their degree', () => {
    expect(renderChart('Do = C\n| Am7 . . . | Bm7b5 . . . | Ab . Bb . | G/B . . . |', 'C', 'arabic'))
      .toBe('Do = C\n| 6m7 . . . | 7m7b5 . . . | b6 . b7 . | 5/7 . . . |');
    expect(renderChart('Do = C\n| Am7 . . . | Ab . Bb . | G/B . . . |', 'C', 'roman'))
      .toBe('Do = C\n| vi7 . . . | bVI . bVII . | V/VII . . . |');
  });
});
