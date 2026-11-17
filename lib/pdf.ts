// PDF rendering for chord charts, shared by Export PDF and the Advanced Export preview.

import { PageSizes, PDFDocument, PDFFont, PDFPage, RGB, rgb, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { isChordLine } from "./chords"
import { SmartFormatter } from "./formatter"
import { fetchFont } from "./fonts"
import { createGridPdf } from "./pdf-grid"

export type PdfFontFamily = "Helvetica" | "Courier"

export interface PdfOptions {
  orientation: "portrait" | "landscape"
  fontSize?: number
  fontFamily?: PdfFontFamily
  // Reads a file from /public/fonts. Only called when the chart has characters (♭, ♯, Δ, non-Latin text)
  // that the built-in PDF fonts cannot draw.
  loadFont?: (file: string) => Promise<ArrayBuffer>
}

const MARGIN = 50
const COLUMN_GAP = 20
const METADATA_RE = /^(Do\s*=|Time\s*Signature\s*=|Tempo\s*.*=|Structure\s*=)/
const SECTION_RE = /^([\w\s-]+:)/
const ANNOTATION_RE = /([\w#♭♯/]+)\(([^)]+)\)/g
// Chord lines shrink to fit the column, but never below this share of the chosen font size
const MIN_CHORD_SCALE = 0.75
// A section is moved whole to the next column only when less than this share of the column is left;
// otherwise it starts here and continues in the next column, so no column is left mostly empty
const MOVE_SECTION_BELOW = 0.5
const SUBSCRIPT_SCALE = 0.7
const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.5, 0.5, 0.5)

// The chosen family is used for every line, chord lines included. Only Courier keeps Smart Format's
// bar alignment; in Helvetica the letters have different widths, so bars drift apart.
interface Fonts {
  regular: PDFFont
  bold: PDFFont
  // Every glyph has the same width, so Smart Format's padding lines bars up
  mono: boolean
}

interface Row {
  text: string
  font: PDFFont
  size: number
  mono: boolean
  color: RGB
  gapBefore: number
  advance: number
}

// A run of rows kept in one column when possible; a spacer is a blank line
type Block = { spacer: true } | { spacer: false; rows: Row[] }

async function embedFonts(
  pdfDoc: PDFDocument,
  content: string,
  family: PdfFontFamily,
  loadFont: (file: string) => Promise<ArrayBuffer>,
): Promise<Fonts> {
  const mono = family === "Courier"
  const regular = await pdfDoc.embedFont(mono ? StandardFonts.Courier : StandardFonts.Helvetica)
  const supported = new Set(regular.getCharacterSet())
  const needsUnicode = [...content].some((c) => c !== "\n" && c !== "\r" && !supported.has(c.codePointAt(0)!))

  if (!needsUnicode) {
    return {
      regular,
      bold: await pdfDoc.embedFont(mono ? StandardFonts.CourierBold : StandardFonts.HelveticaBold),
      mono,
    }
  }

  pdfDoc.registerFontkit(fontkit)
  const embed = async (file: string) => pdfDoc.embedFont(await loadFont(file), { subset: true })
  return {
    regular: await embed(mono ? "DejaVuSansMono.ttf" : "DejaVuSans.ttf"),
    bold: await embed(mono ? "DejaVuSansMono-Bold.ttf" : "DejaVuSans-Bold.ttf"),
    mono,
  }
}

// Replace characters the font has no glyph for, so drawing never throws
function sanitize(text: string, font: PDFFont, cache: Map<PDFFont, Set<number>>): string {
  let supported = cache.get(font)
  if (!supported) {
    supported = new Set(font.getCharacterSet())
    cache.set(font, supported)
  }
  const charset = supported
  return [...text.replace(/\t/g, "    ")].map((c) => (charset.has(c.codePointAt(0)!) ? c : "?")).join("")
}

// pdf-lib measures text with kerning but draws it without, so a measured width runs short and the next
// piece of text lands on top of the previous one. Measure glyph by glyph instead, as it is drawn.
const glyphWidths = new WeakMap<PDFFont, Map<string, number>>()

function textWidth(text: string, font: PDFFont, size: number): number {
  let widths = glyphWidths.get(font)
  if (!widths) {
    widths = new Map()
    glyphWidths.set(font, widths)
  }
  let total = 0
  for (const c of text) {
    let w = widths.get(c)
    if (w === undefined) {
      w = font.widthOfTextAtSize(c, 1000)
      widths.set(c, w)
    }
    total += w
  }
  return (total * size) / 1000
}

interface Piece {
  text: string
  x: number
  size: number
  subscript: boolean
}

// Lays out a line, turning "Chord(note)" into the chord followed by a small subscript note.
// In a monospaced font the note keeps the width of "(note)", so Smart Format's bars stay lined up;
// in other fonts nothing lines up anyway, so the text after the note follows it directly.
function layoutLine(text: string, font: PDFFont, size: number, mono: boolean): { pieces: Piece[]; width: number } {
  const pieces: Piece[] = []
  const subscriptSize = size * SUBSCRIPT_SCALE
  let x = 0
  let lastIndex = 0
  const add = (t: string, s: number, subscript = false) => {
    if (!t) return
    pieces.push({ text: t, x, size: s, subscript })
    x += textWidth(t, font, s)
  }
  for (const match of text.matchAll(ANNOTATION_RE)) {
    add(text.substring(lastIndex, match.index), size)
    const start = x
    add(match[1], size)
    add(match[2], subscriptSize, true)
    if (mono) x = Math.max(x, start + textWidth(match[0], font, size))
    lastIndex = match.index! + match[0].length
  }
  add(text.substring(lastIndex), size)
  return { pieces, width: x }
}

const lineWidth = (text: string, font: PDFFont, size: number, mono: boolean) => layoutLine(text, font, size, mono).width

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let current: string | null = null
  for (const word of text.split(" ")) {
    if (current === null) {
      current = word
      continue
    }
    const candidate: string = `${current} ${word}`
    if (current.trim() !== "" && textWidth(candidate, font, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  lines.push(current ?? "")
  return lines
}

// Splits a chord line after every barsPerLine bars, repeating the bar line at each break:
// "| C | F | G |" with 2 -> "| C | F |", "| G |"
function chunkBars(text: string, barsPerLine: number): string[] {
  const bars = text.split(/(?=\|)/)
  const closing = bars.length > 1 && bars[bars.length - 1].trim() === "|" ? bars.pop()! : ""
  const lines: string[] = []
  for (let i = 0; i < bars.length; i += barsPerLine) {
    const chunk = bars.slice(i, i + barsPerLine).join("").trimEnd()
    const end = i + barsPerLine < bars.length ? "|" : closing.trim()
    lines.push(end ? `${chunk} ${end}` : chunk)
  }
  return lines
}

function barCount(text: string): number {
  return text.split(/(?=\|)/).filter((bar) => bar.trim() !== "|").length
}

const formatter = new SmartFormatter()

// Splits each run of chord lines (lines next to each other, as Smart Format groups them) into lines
// of at most barsPerLine bars. In a monospaced font a split run is lined up again, so the bars of
// "| C | F |" + "| G | Am |" stay under each other; a run that needs no split is left as written.
function splitRuns(runs: string[][], barsPerLine: number, mono: boolean): string[][][] {
  return runs.map((run) => {
    const parts = run.map((line) => chunkBars(line, barsPerLine))
    if (!mono || parts.every((p) => p.length === 1)) return parts
    const aligned = formatter.alignBarsInSection(parts.flat())
    let i = 0
    return parts.map((p) => p.map(() => aligned[i++]))
  })
}

// One size and one number of bars per line for every chord line, so bars stay aligned across the chart.
// Uses as few lines as possible, split evenly, shrinking by at most MIN_CHORD_SCALE: a 4-bar line that is
// a little too wide is shrunk, one that is far too wide is split 2+2 (and shrunk a little if still too wide).
function chordLayout(runs: string[][], font: PDFFont, fontSize: number, colWidth: number, mono: boolean) {
  const maxBars = Math.max(1, ...runs.flat().map(barCount))
  for (let lineCount = 1; lineCount <= maxBars; lineCount++) {
    const barsPerLine = Math.ceil(maxBars / lineCount)
    if (lineCount > 1 && barsPerLine === Math.ceil(maxBars / (lineCount - 1))) continue
    const widest = Math.max(0, ...splitRuns(runs, barsPerLine, mono).flat(2).map((part) => lineWidth(part, font, fontSize, mono)))
    const scale = colWidth / widest
    if (scale >= 1) return { barsPerLine, size: fontSize }
    // Slightly under the exact fit, so rounding never pushes a line over the column width
    if (scale >= MIN_CHORD_SCALE) return { barsPerLine, size: fontSize * scale * 0.999 }
  }
  return { barsPerLine: 1, size: fontSize * MIN_CHORD_SCALE }
}

function buildBlocks(content: string, fonts: Fonts, fontSize: number, colWidth: number): Block[] {
  const lineHeight = fontSize * 1.4
  const charsets = new Map<PDFFont, Set<number>>()
  const blocks: Block[] = []
  let current: Row[] = []
  const flush = () => {
    if (current.length) blocks.push({ spacer: false, rows: current })
    current = []
  }

  const lines = content.split("\n").map((line) => line.replace(/\r$/, ""))
  const kinds = lines.map((line, i) => {
    if (line.trim() === "") return "blank"
    if (i === 0) return "title"
    if (SECTION_RE.test(line)) return "section"
    return isChordLine(line) ? "chord" : "text"
  })

  // Runs of chord lines, split into lines that fit the column
  const runs: { start: number; lines: string[] }[] = []
  kinds.forEach((kind, i) => {
    if (kind !== "chord") return
    const text = sanitize(lines[i], fonts.regular, charsets)
    const last = runs[runs.length - 1]
    if (last && kinds[i - 1] === "chord") last.lines.push(text)
    else runs.push({ start: i, lines: [text] })
  })
  const chord = chordLayout(runs.map((r) => r.lines), fonts.regular, fontSize, colWidth, fonts.mono)
  const chordParts = new Map<number, string[]>()
  splitRuns(runs.map((r) => r.lines), chord.barsPerLine, fonts.mono).forEach((run, r) =>
    run.forEach((parts, j) => chordParts.set(runs[r].start + j, parts)),
  )

  lines.forEach((line, i) => {
    const kind = kinds[i]
    if (kind === "blank") {
      flush()
      blocks.push({ spacer: true })
      return
    }

    // The title and each section header start a new block, so a section is kept together
    if (kind === "title" || kind === "section") flush()

    const font = kind === "title" || kind === "section" ? fonts.bold : fonts.regular
    const size = kind === "title" ? fontSize + 5 : kind === "chord" ? chord.size : fontSize
    const color = METADATA_RE.test(line) ? GREY : BLACK
    const fits = (t: string) => lineWidth(t, font, size, fonts.mono) <= colWidth
    const wrapped =
      kind === "chord"
        ? // A single bar wider than the column falls back to word wrapping
          chordParts.get(i)!.flatMap((part) => (fits(part) ? [part] : wrapText(part, font, size, colWidth)))
        : wrapText(sanitize(line, font, charsets), font, size, colWidth)
    wrapped.forEach((text, j) => {
      current.push({
        text,
        font,
        size,
        mono: fonts.mono,
        color,
        gapBefore: kind === "section" && j === 0 ? lineHeight / 2 : 0,
        advance: kind === "title" ? fontSize + 14 : lineHeight,
      })
    })
    if (kind === "title") flush()
  })
  flush()
  return blocks
}

function blockFits(rows: Row[], y: number): boolean {
  for (const row of rows) {
    y -= row.gapBefore
    if (y < MARGIN) return false
    y -= row.advance
  }
  return true
}

function drawRow(page: PDFPage, row: Row, x: number, y: number) {
  for (const piece of layoutLine(row.text, row.font, row.size, row.mono).pieces) {
    page.drawText(piece.text, {
      font: row.font,
      size: piece.size,
      color: row.color,
      x: x + piece.x,
      y: piece.subscript ? y - row.size * 0.3 : y,
    })
  }
}

export async function createChartPdf(content: string, options: PdfOptions): Promise<Uint8Array> {
  const { orientation, fontSize = 10, fontFamily = "Helvetica", loadFont = fetchFont } = options
  const pdfDoc = await PDFDocument.create()
  const fonts = await embedFonts(pdfDoc, content, fontFamily, loadFont)

  const [a4Width, a4Height] = PageSizes.A4
  const [width, height] = orientation === "landscape" ? [a4Height, a4Width] : [a4Width, a4Height]
  const colWidth = (width - MARGIN * 2 - COLUMN_GAP) / 2
  const lineHeight = fontSize * 1.4
  const top = height - MARGIN

  // Two columns per page: fill the left column, then the right, then start a new page
  let page = pdfDoc.addPage([width, height])
  let column = 0
  let y = top
  const nextColumn = () => {
    if (column === 0) {
      column = 1
    } else {
      page = pdfDoc.addPage([width, height])
      column = 0
    }
    y = top
  }

  for (const block of buildBlocks(content, fonts, fontSize, colWidth)) {
    if (block.spacer) {
      if (y !== top) y -= lineHeight
      continue
    }
    // Move a block that would be split to the next column, when it fits there and this column is
    // already more than half full
    const columnHeight = top - MARGIN
    if (
      y !== top &&
      !blockFits(block.rows, y) &&
      blockFits(block.rows, top) &&
      y - MARGIN < columnHeight * MOVE_SECTION_BELOW
    )
      nextColumn()

    for (const row of block.rows) {
      if (y - row.gapBefore < MARGIN) nextColumn()
      y -= row.gapBefore
      drawRow(page, row, MARGIN + column * (colWidth + COLUMN_GAP), y)
      y -= row.advance
    }
  }

  return pdfDoc.save()
}

// "grid" draws each bar as a cell with chords at their beats; "classic" prints the chart text as written
export type PdfStyle = "grid" | "classic"

export function createPdf(content: string, options: PdfOptions & { style: PdfStyle }): Promise<Uint8Array> {
  const { style, ...rest } = options
  return style === "grid" ? createGridPdf(content, rest) : createChartPdf(content, rest)
}

export function pdfFileName(title: string): string {
  const base = (title || "chord-chart").toLowerCase().replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "-")
  return `${base || "chord-chart"}.pdf`
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer], { type: "application/pdf" })
}

export function downloadPdf(bytes: Uint8Array, title: string) {
  const url = URL.createObjectURL(pdfBlob(bytes))
  const link = document.createElement("a")
  link.href = url
  link.download = pdfFileName(title)
  link.click()
  // Give the browser time to start the download before releasing the file
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
