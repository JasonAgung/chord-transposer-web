import { renderToStaticMarkup } from 'react-dom/server';
import ChartPreview from './chart-preview';
import { renderChart } from '@/lib/render';

// Bars for a time signature of `beats` beats, written with one token per beat, and how many dots they need
function dotBars(beats: number) {
  const bar = (tokens: Record<number, string>) => Array.from({ length: beats }, (_, i) => tokens[i] ?? '.').join(' ');
  const half = Math.ceil(beats / 2);
  const bars = [
    { text: bar({ 0: 'C', [half]: 'G' }), dots: beats - 2 }, // a change in the middle
    { text: bar({ 0: 'C', 1: 'D' }), dots: beats - 2 }, // chords on beats next to each other
    { text: bar({ 1: 'Am' }), dots: beats - 1 }, // one chord off the downbeat
    { text: bar({ 0: 'Dm7b5/F#(up)', [half]: 'Bbmaj7(up)' }), dots: beats - 2 }, // long chords
    { text: bar({ 0: 'F' }), dots: 0 }, // one chord on beat 1: no dots needed
  ];
  return { line: `| ${bars.map((b) => b.text).join(' | ')} |`, dots: bars.reduce((sum, b) => sum + b.dots, 0) };
}

describe('ChartPreview', () => {
  it.each(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'])(
    'shows a dot for every empty beat in %s, as chords, Roman numerals and numbers',
    (time) => {
      const { line, dots } = dotBars(parseInt(time, 10));
      const chart = `S\nDo = C\nTime Signature = ${time}\n\nVerse :\n${line}`;
      for (const style of ['default', 'roman', 'arabic'] as const) {
        for (const key of ['C', 'Db', 'F#']) {
          const html = renderToStaticMarkup(<ChartPreview content={renderChart(chart, key, style)!} />);
          expect([style, key, (html.match(/•/g) ?? []).length]).toEqual([style, key, dots]);
        }
      }
    },
  );

  it('asks for a chart when there is none', () => {
    expect(renderToStaticMarkup(<ChartPreview content="" />)).toContain('Your chart appears here as you write it.');
  });
});
