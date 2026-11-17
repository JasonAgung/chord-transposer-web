import { lintChart, suggestChord } from './chart-lint';

const messages = (chart: string) => lintChart(chart).map((p) => p.message);
const marked = (chart: string) => lintChart(chart).map((p) => chart.slice(p.from, p.to));

describe('lintChart', () => {
  it('finds nothing wrong in a correct chart', () => {
    const chart = `Song
Do = D
Time Signature = 4/4

Intro : Drum, Full
| . . . . | . . . . |
| Gmaj7 . . . | Bm7(up) . A/C#(up) B/D#(up) | Bsus4 B . . | N.C. . . . | x2
Verse : | D . . . | Em . D/F# . |
| C | Am F |
lyrics | with a bar sign`;
    expect(lintChart(chart)).toEqual([]);
  });

  it('marks chords the app cannot read, with a suggestion when there is a likely one', () => {
    const chart = 'Song\nDo = C\n| Cmi7 . . . | Fma7 . . . | C-7 . . . | Hm . . . |';
    expect(marked(chart)).toEqual(['Cmi7', 'Fma7', 'C-7', 'Hm']);
    expect(messages(chart)).toEqual([
      '"Cmi7" isn\'t a chord the app reads. Did you mean Cm7?',
      '"Fma7" isn\'t a chord the app reads. Did you mean Fmaj7?',
      '"C-7" isn\'t a chord the app reads. Did you mean Cm7?',
      '"Hm" isn\'t a chord the app reads.',
    ]);
  });

  it('marks a bar with the wrong number of beats', () => {
    const chart = 'Song\nDo = C\n| C . . . . | G . . |\n| C G Am F Dm |';
    expect(marked(chart)).toEqual(['C . . . . ', 'G . . ', 'C G Am F Dm ']);
    expect(messages(chart)[0]).toBe('This bar has 5 beats; 4/4 has 4.');
  });

  it('counts beats by the time signature', () => {
    expect(lintChart('Song\nDo = C\nTime Signature = 3/4\n| C . . | G . . |')).toEqual([]);
    expect(messages('Song\nDo = C\nTime Signature = 3/4\n| C . . . |')).toEqual(['This bar has 4 beats; 3/4 has 3.']);
  });

  it('warns when the key line is missing', () => {
    expect(messages('Song\n| C . . . |')).toEqual(['No "Do = …" line, so the chart can\'t be transposed. Add one like "Do = C".']);
    expect(lintChart('')).toEqual([]);
  });

  it('accepts Roman and Arabic numbers', () => {
    expect(lintChart('Song\nDo = C\n| I . . . | vi7 . . . | 4maj7 . . . | 5/7 . . . |')).toEqual([]);
  });
});

describe('suggestChord', () => {
  it('fixes common spellings', () => {
    expect(suggestChord('am7')).toBe('Am7');
    expect(suggestChord('BbMaj7')).toBe('Bbmaj7');
    expect(suggestChord('Fma9')).toBe('Fmaj9');
    expect(suggestChord('Xyz')).toBeNull();
  });
});
