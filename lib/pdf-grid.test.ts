import { readFile } from 'fs/promises';
import path from 'path';
import { inflateSync } from 'zlib';
import { PDFArray, PDFDocument, PDFRawStream, PDFRef } from 'pdf-lib';
import { chordSegments, createGridPdf, parseSong, tempoNote } from './pdf-grid';
import { renderChart } from './render';

const loadFont = async (file: string) => {
  const bytes = await readFile(path.join(__dirname, '..', 'public', 'fonts', file));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

// Text drawn in Helvetica on each page, with its position and size. (Text in the DejaVu fallback font is
// written as glyph numbers and comes out garbled here; the tests only look at Helvetica text.)
async function pagesText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const ops = refs
      .map((ref) => {
        const stream = doc.context.lookup(ref as PDFRef) as PDFRawStream;
        return inflateSync(Buffer.from(stream.contents)).toString('latin1');
      })
      .join('\n');
    return [...ops.matchAll(/\/(\S+) ([\d.]+) Tf[\s\S]*?1 0 0 1 ([\d.]+) ([\d.]+) Tm\s*<([0-9A-F]*)> Tj/g)].map((m) => ({
      font: m[1],
      size: +m[2],
      x: +m[3],
      y: +m[4],
      text: Buffer.from(m[5], 'hex').toString('latin1'),
    }));
  });
}

const render = (chart: string, options = {}) => createGridPdf(chart, { loadFont, ...options });

// The beat dots drawn on the first page: each is a filled circle in the dot grey
async function dotCount(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPages()[0].node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const ops = refs.map((ref) => inflateSync(Buffer.from((doc.context.lookup(ref as PDFRef) as PDFRawStream).contents)).toString('latin1')).join('\n');
  return (ops.match(/0\.42 0\.42 0\.46 rg/g) ?? []).length;
}

describe('parseSong', () => {
  const song = parseSong(`My Song
Do = Bb
Time Signature = 3/4
Tempo (1/4) = 72 BPM
Structure = Verse, Chorus

Intro : Drum, Full
| . . . | . . . |
| C . . | G . . | x2

Verse :
| Am . G | F |

| C . . | G
lyrics here
Chorus : | F . . | C . . |`);

  it('reads the header lines', () => {
    expect(song).toMatchObject({ title: 'My Song', key: 'Bb', time: '3/4', tempo: '♩ = 72', structure: 'Verse, Chorus' });
  });

  it('reads sections with their notes, bars with their beats, and what follows the last bar', () => {
    expect(song.items).toEqual([
      { kind: 'section', name: 'Intro', note: 'Drum, Full' },
      { kind: 'chords', bars: [[], []], tail: '' },
      { kind: 'chords', bars: [[{ pos: 0, token: 'C' }], [{ pos: 0, token: 'G' }]], tail: 'x2' },
      { kind: 'gap' },
      { kind: 'section', name: 'Verse', note: undefined },
      { kind: 'chords', bars: [[{ pos: 0, token: 'Am' }, { pos: 2 / 3, token: 'G' }], [{ pos: 0, token: 'F' }]], tail: '' },
      { kind: 'gap' },
      // A line missing its last bar line still has its last bar
      { kind: 'chords', bars: [[{ pos: 0, token: 'C' }], [{ pos: 0, token: 'G' }]], tail: '' },
      { kind: 'text', text: 'lyrics here' },
      // A label written before the bars
      { kind: 'section', name: 'Chorus' },
      { kind: 'chords', bars: [[{ pos: 0, token: 'F' }], [{ pos: 0, token: 'C' }]], tail: '' },
    ]);
  });

  it('cleans up a section note', () => {
    expect(parseSong('S\nChorus : Loss,, Build Up').items[0]).toEqual({ kind: 'section', name: 'Chorus', note: 'Loss, Build Up' });
  });

  it('reads Roman and Arabic numbers as bars', () => {
    expect(parseSong('S\n| I . . . | vi7 . . . |').items[0]).toMatchObject({ kind: 'chords', bars: [[{ token: 'I' }], [{ token: 'vi7' }]] });
  });
});

describe('tempoNote', () => {
  it('shows the note the tempo counts', () => {
    expect(tempoNote('1/4')).toBe('♩');
    expect(tempoNote('1/8')).toBe('♪');
    // Dotted notes, common in 6/8
    expect(tempoNote('3/8')).toBe('♩.');
    expect(tempoNote('1/4.')).toBe('♩.');
    expect(tempoNote('3/16')).toBe('♪.');
    // No symbol in the fonts: written as given
    expect(tempoNote('1/2')).toBe('1/2');
    expect(tempoNote(' 1 / 16 ')).toBe('1/16');
    // No value: quarters
    expect(tempoNote(undefined)).toBe('♩');
  });

  it('reads the tempo line with and without a note value', () => {
    expect(parseSong('S\nTempo (1/8) = 85 BPM').tempo).toBe('♪ = 85');
    expect(parseSong('S\nTempo = 100').tempo).toBe('♩ = 100');
  });
});

describe('chordSegments', () => {
  const parts = (token: string) => chordSegments(token).map((s) => `${s.role}:${s.text}`);

  it('splits a chord into root, accidental, minor, extension, bass and note', () => {
    expect(parts('F#m7(up)')).toEqual(['root:F', 'acc:♯', 'minor:m', 'ext:7', 'note:up']);
    expect(parts('Bbmaj7')).toEqual(['root:B', 'acc:♭', 'ext:maj7']);
    expect(parts('C/D(up)')).toEqual(['root:C', 'slash:/', 'bass:D', 'note:up']);
    expect(parts('Dm7b5/Ab')).toEqual(['root:D', 'minor:m', 'ext:7♭5', 'slash:/', 'bass:A', 'bassAcc:♭']);
  });

  it('keeps parentheses that belong to the chord', () => {
    expect(parts('Am(maj7)')).toEqual(['root:A', 'minor:m', 'ext:(maj7)']);
  });

  it('writes Roman and Arabic numbers the same way, so 57 reads as 5 with a 7', () => {
    expect(parts('bVIImaj7')).toEqual(['acc:♭', 'root:VII', 'ext:maj7']);
    expect(parts('vi7(up)')).toEqual(['root:vi', 'ext:7', 'note:up']);
    expect(parts('6m7')).toEqual(['root:6', 'minor:m', 'ext:7']);
    expect(parts('57')).toEqual(['root:5', 'ext:7']);
    expect(parts('1/3')).toEqual(['root:1', 'slash:/', 'bass:3']);
  });

  it('draws anything else as it is', () => {
    expect(parts('N.C.')).toEqual(['plain:N.C.']);
  });
});

describe('createGridPdf', () => {
  it('draws a chart on one page with the key in the header', async () => {
    const pages = await pagesText(await render('My Song\nDo = D\n\nVerse :\n| D . . . | Em . D/F# . | G . . . | A . . . |'));
    expect(pages).toHaveLength(1);
    const texts = pages[0].map((t) => t.text);
    expect(texts).toEqual(expect.arrayContaining(['My Song', 'VERSE', 'D', 'E', 'G', 'A']));
  });

  it('places a chord on beat 3 halfway into its bar', async () => {
    const [page] = await pagesText(await render('S\n| D . . . | Em . G . | C . . . | C . . . |'));
    const xOf = (text: string) => page.find((t) => t.text === text)!.x;
    // D starts bar 1 and C bar 3, so a bar is half that apart
    const cell = (xOf('C') - xOf('D')) / 2;
    expect(xOf('E') - xOf('D')).toBeCloseTo(cell, 0);
    // The beats are spread over the bar less 24pt kept free at its end
    expect(xOf('G') - xOf('E')).toBeCloseTo((cell - 24) / 2, 0);
  });

  it('makes all chords of a bar smaller by the same amount when the bar is too full', async () => {
    const [page] = await pagesText(await render('S\n| C#m7b5(up) Bbmaj7(up) Ebmaj7(up) Abmaj7(up) |'));
    const sizes = page.filter((t) => ['C', 'B', 'E', 'A'].includes(t.text)).map((t) => t.size);
    expect(sizes).toHaveLength(4);
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeLessThan(13);
  });

  it('keeps crowded chords at full size and moves them apart instead', async () => {
    const [page] = await pagesText(await render('S\n| Bm7(up) . A/C#(up) B/D#(up) | D . . . |'));
    const roots = page.filter((t) => ['B', 'A'].includes(t.text));
    // All the same size (none shrunk on its own), and close to full size: only enough smaller to keep
    // room for the dot after Bm7
    const sizes = roots.map((t) => t.size);
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeGreaterThan(12);
    // Each chord starts after the one before it ends
    const xs = roots.map((t) => t.x);
    expect(xs[1]).toBeGreaterThan(xs[0] + 20);
    expect(xs[2]).toBeGreaterThan(xs[1] + 25);
  });

  it('keeps a section on one page instead of splitting it', async () => {
    const rows = (n: number) => Array.from({ length: n }, () => '| C . . . | F . . . | G . . . | C . . . |').join('\n');
    // Verse fills most of page 1; the chorus doesn't fit below it, so it starts page 2 whole
    const pages = await pagesText(await render(`S\nDo = C\n\nVerse :\n${rows(20)}\n\nChorus :\n${rows(14)}`));
    expect(pages).toHaveLength(2);
    expect(pages[0].map((t) => t.text)).not.toContain('CHORUS');
    expect(pages[1].find((t) => t.text !== 'S')?.text).toBe('CHORUS');
  });

  it('shrinks a little when that saves a page', async () => {
    const rows = (n: number) => Array.from({ length: n }, () => '| C . . . | F . . . | G . . . | C . . . |').join('\n');
    // 26 rows are a bit too tall for one page at full size
    const pages = await pagesText(await render(`S\nDo = C\n\nVerse :\n${rows(26)}`));
    expect(pages).toHaveLength(1);
    expect(pages[0].find((t) => t.text === 'C')!.size).toBeLessThan(13);
  });

  it('uses the chosen font size and three beats in 3/4', async () => {
    const [page] = await pagesText(await render('S\nTime Signature = 3/4\n| C . G | F . . |', { fontSize: 12 }));
    const c = page.find((t) => t.text === 'C')!;
    const g = page.find((t) => t.text === 'G')!;
    expect(c.size).toBeCloseTo(15.6, 1);
    expect(g.x - c.x).toBeGreaterThan(0);
  });

  it('draws characters Helvetica lacks with the fallback font, and never fails on unknown ones', async () => {
    await expect(render('Kidung 愛 B♭ 🎸\nDo = B♭\n\n| B♭ . . . | E♭/G . . . |\n歌詞 lyrics 🎸')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('gives every empty beat its dot, even beside a wide chord in a narrow 6/8 bar', async () => {
    // Db: 2 dots, Bbm: 2 dots (Bbm is wider than Am, which used to push one out)
    expect(await dotCount(await render('S\nTime Signature = 6/8\n| Db . . Bbm . . | C . . . . . |'))).toBe(4);
    // Chords on beats 1 and 2 of 3: one dot for beat 3
    expect(await dotCount(await render('S\nTime Signature = 3/4\n| C D . | F . . |'))).toBe(1);
    // One chord off the downbeat: dots before and after it
    expect(await dotCount(await render('S\nTime Signature = 6/8\n| . . C . . . |'))).toBe(5);
    // A bar crowded with long chords still keeps its dots
    expect(await dotCount(await render('S\nTime Signature = 6/8\n| C#m7b5(up) Bbmaj7(up) Ebmaj7(up) Abmaj7(up) . . |'))).toBe(2);
  });

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

  it.each(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'])('draws a dot for every empty beat in %s, as chords, Roman numerals and numbers', async (time) => {
    const { line, dots } = dotBars(parseInt(time, 10));
    const chart = `S\nDo = C\nTime Signature = ${time}\n\nVerse :\n${line}`;
    for (const style of ['default', 'roman', 'arabic'] as const) {
      for (const key of ['C', 'Db', 'F#']) {
        expect([style, key, await dotCount(await render(renderChart(chart, key, style)!))]).toEqual([style, key, dots]);
      }
    }
  });

  it('draws charts in other time signatures', async () => {
    for (const [time, bar] of [['2/4', '| C . G . |'], ['5/4', '| C . . G . |'], ['7/8', '| C . . . G . . |'], ['12/8', '| C . . . . . G . . . . . |']]) {
      const pages = await pagesText(await render(`S\nTime Signature = ${time}\n${bar}`));
      expect(pages[0].map((t) => t.text)).toEqual(expect.arrayContaining(['C', 'G']));
    }
  });

  it('works in landscape and for an empty chart', async () => {
    await expect(render('S\n| C . . . |', { orientation: 'landscape' })).resolves.toBeInstanceOf(Uint8Array);
    expect(await pagesText(await render(''))).toHaveLength(1);
  });
});
