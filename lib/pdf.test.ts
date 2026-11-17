import { readFile } from 'fs/promises';
import path from 'path';
import { inflateSync } from 'zlib';
import { PDFDocument } from 'pdf-lib';
import { createChartPdf, pdfFileName } from './pdf';

const loadFont = jest.fn(async (file: string) => {
  const bytes = await readFile(path.join(__dirname, '..', 'public', 'fonts', file));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
});

const chart = `1. Song
Do = C
Time Signature = 4/4

Verse :
| C . . . | Am(soft) . . . | F . . . | G . . . |`;

const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

// The text pieces drawn on the pages, with their position and size, read from the PDF's content streams
function drawnText(bytes: Uint8Array) {
  const pdf = Buffer.from(bytes).toString('latin1');
  const pieces: { text: string; x: number; y: number; size: number }[] = [];
  for (const [, raw] of pdf.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let data = Buffer.from(raw, 'latin1');
    try {
      data = inflateSync(data);
    } catch {}
    const ops = data.toString('latin1');
    for (const m of ops.matchAll(/\/\S+ ([\d.]+) Tf[\s\S]*?1 0 0 1 ([\d.]+) ([\d.]+) Tm\s*<([0-9A-F]*)> Tj/g)) {
      pieces.push({ size: +m[1], x: +m[2], y: +m[3], text: Buffer.from(m[4], 'hex').toString('latin1') });
    }
  }
  return pieces;
}

// Rows of text as drawn: pieces on the same baseline joined in order, with the x of every bar line
function drawnRows(bytes: Uint8Array) {
  const rows = new Map<number, ReturnType<typeof drawnText>>();
  for (const p of drawnText(bytes)) {
    // Subscripts sit a little below their row; group them with it
    const key = [...rows.keys()].find((y) => Math.abs(y - p.y) < p.size * 0.5) ?? p.y;
    rows.set(key, [...(rows.get(key) ?? []), p]);
  }
  return [...rows.values()].map((pieces) => pieces.sort((a, b) => a.x - b.x));
}

beforeEach(() => loadFont.mockClear());

describe('createChartPdf', () => {
  it('uses the built-in fonts for a plain chart', async () => {
    const bytes = await createChartPdf(chart, { orientation: 'portrait', loadFont });
    expect(await pageCount(bytes)).toBe(1);
    expect(loadFont).not.toHaveBeenCalled();
  });

  it('embeds a Unicode font for flat and sharp symbols instead of failing', async () => {
    const bytes = await createChartPdf(chart + '\n| B♭ . . . | F♯m . . . | CΔ7 . . . |', { orientation: 'landscape', loadFont });
    expect(await pageCount(bytes)).toBe(1);
    expect(loadFont).toHaveBeenCalledWith('DejaVuSans.ttf');
    expect(loadFont).not.toHaveBeenCalledWith('DejaVuSansMono.ttf');
  });

  it('uses the Unicode monospaced font when Courier is chosen', async () => {
    await createChartPdf(chart + '\n| B♭ . . . |', { orientation: 'portrait', fontFamily: 'Courier', loadFont });
    expect(loadFont).toHaveBeenCalledWith('DejaVuSansMono.ttf');
    expect(loadFont).not.toHaveBeenCalledWith('DejaVuSans.ttf');
  });

  it('does not fail on characters no font can draw', async () => {
    await expect(createChartPdf(chart + '\n愛してる 🎸', { orientation: 'portrait', loadFont })).resolves.toBeInstanceOf(Uint8Array);
  });

  it('adds pages for long charts and works at every font family', async () => {
    const long = Array.from({ length: 200 }, (_, i) => `Part ${i} :\n| C . . . | F . . . |\n`).join('\n');
    for (const fontFamily of ['Helvetica', 'Courier'] as const) {
      expect(await pageCount(await createChartPdf(long, { orientation: 'portrait', fontFamily, loadFont }))).toBeGreaterThan(1);
    }
  });
});

describe('chord line layout', () => {
  const pushed = `Song
Do = D
| Gmaj7 . . . | Bm7(up) . . . | Gm7 . . . | C/D(up) . . . |`;

  it('keeps the space before a chord with a note (kerning does not pull it closer)', async () => {
    const pieces = drawnText(await createChartPdf(pushed, { orientation: 'portrait', fontFamily: 'Helvetica' }));
    const before = pieces.find((p) => p.text.endsWith('| '))!;
    const chord = pieces.find((p) => p.text === 'Bm7')!;
    // "| Gmaj7 . . . | " in Helvetica is 5967 units wide glyph by glyph (59.67pt at 10pt), as it is drawn;
    // pdf-lib's own measure subtracts kerning, which put the chord on top of the space
    expect(chord.x - before.x).toBeCloseTo(59.67, 2);
  });

  it('puts the text after a note right behind it in Helvetica, but keeps the "(note)" width in Courier', async () => {
    const gap = async (fontFamily: 'Helvetica' | 'Courier') => {
      const pieces = drawnText(await createChartPdf(pushed, { orientation: 'portrait', fontFamily }));
      const i = pieces.findIndex((p) => p.text === 'up');
      return { note: pieces[i], next: pieces[i + 1] };
    };
    const helvetica = await gap('Helvetica');
    // "up" in Helvetica is 1112 units wide: 7.78pt at the 7pt subscript size
    expect(helvetica.next.x - helvetica.note.x).toBeCloseTo(7.78, 2);
    const courier = await gap('Courier');
    // In Courier "Bm7(up)" is 7 characters of 6pt; the note starts after "Bm7" and the rest after "(up)"
    expect(courier.next.x - courier.note.x).toBeCloseTo(24, 1);
  });

  it('splits wide lines evenly and lines up the bars of the split lines in Courier', async () => {
    const wide = `Song
Do = D
| A7sus4(up) . . . | C#7sus4(up) . . . | Gm7 . . . | C/D(up) . . . |
| D . . . | Em . D/F# . | G . . . | G . . . |`;
    const rows = drawnRows(await createChartPdf(wide, { orientation: 'portrait', fontFamily: 'Courier', fontSize: 11 })).slice(2);
    expect(rows).toHaveLength(4);
    const barXs = rows.map((row) => {
      const xs: number[] = [];
      for (const piece of row) {
        [...piece.text].forEach((c, i) => c === '|' && xs.push(Math.round(piece.x + i * piece.size * 0.6)));
      }
      return xs;
    });
    // Every split line has two bars, and the bar lines sit at the same places on every line
    for (const xs of barXs) expect(xs).toEqual(barXs[0]);
    expect(barXs[0]).toHaveLength(3);
  });

  it('does not leave the first column empty below the title for a long chart without sections', async () => {
    // 33 lines fit in an empty landscape column (35 rows) but not below the title (31), so they used to move whole
    const long = 'Song\nDo = C\n\n' + Array.from({ length: 33 }, () => '| C . . . | F . . . | G . . . | C . . . |').join('\n');
    const rows = drawnRows(await createChartPdf(long, { orientation: 'landscape' }));
    expect(rows.filter((row) => row[0].x < 100).length).toBeGreaterThan(20);
  });
});

describe('pdfFileName', () => {
  it('removes characters that are not allowed in file names', () => {
    expect(pdfFileName('[1]. My Song (Book A/B)')).toBe('[1].-my-song-(book-ab).pdf');
    expect(pdfFileName('')).toBe('chord-chart.pdf');
  });
});
