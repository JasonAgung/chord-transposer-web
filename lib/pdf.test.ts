import { readFile } from 'fs/promises';
import path from 'path';
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

describe('pdfFileName', () => {
  it('removes characters that are not allowed in file names', () => {
    expect(pdfFileName('[1]. My Song (Book A/B)')).toBe('[1].-my-song-(book-ab).pdf');
    expect(pdfFileName('')).toBe('chord-chart.pdf');
  });
});
