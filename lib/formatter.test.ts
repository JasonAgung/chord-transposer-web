import { SmartFormatter } from './formatter';

const formatter = new SmartFormatter();
const format = (chart: string) => formatter.formatChart(chart);

describe('SmartFormatter', () => {
  it('lines up bars and beats across the lines of a section', () => {
    expect(format('| C . . . | Am7 . . . |\n| Dm7 . G . | C . . . |')).toBe(
      '| C   . . . | Am7 . . . |\n| Dm7 . G . | C   . . . |',
    );
  });

  it('keeps text after the last bar line', () => {
    expect(format('| C . . . | G . . . | x2')).toBe('| C . . . | G . . . | x2');
    expect(format('| C . . . | G . . . | (Repeat 2x)')).toBe('| C . . . | G . . . | (Repeat 2x)');
  });

  it('keeps a label before the first bar line and lines up the bars after it', () => {
    expect(format('Intro : | C . . . | G . . . |\n| Am . . . | F . . . |')).toBe(
      'Intro : | C  . . . | G . . . |\n        | Am . . . | F . . . |',
    );
  });

  it('closes a line that is missing its last bar line', () => {
    expect(format('| C . . . | G . . .\n| Am . . . | F . . . |')).toBe('| C  . . . | G . . . |\n| Am . . . | F . . . |');
  });

  it('spaces a one-bar line like the others', () => {
    expect(format('|C . . .|')).toBe('| C . . . |');
  });

  it('keeps notes in parentheses with their chord', () => {
    expect(format('| C(up) . . . | G . . . |\n| Am . . . | F(soft high) . . . |')).toBe(
      '| C(up) . . . | G            . . . |\n| Am    . . . | F(soft high) . . . |',
    );
  });

  it('gives the same result when run twice', () => {
    const chart = 'Song\nDo = C\n\nVerse :\nIntro : | C . . . | G(up) . . . | x2\n| Am . . . | F . . .\n|C . . .|';
    expect(format(format(chart))).toBe(format(chart));
  });

  it('leaves other lines alone', () => {
    const chart = 'Song\nDo = C\nVerse :\nthese are lyrics | not chords';
    expect(format(chart)).toBe(chart);
  });
});
