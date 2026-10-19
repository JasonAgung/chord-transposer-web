// PDF rendering for chord charts, shared by Export PDF and the Advanced Export preview.

import { PageSizes, PDFDocument, PDFFont, PDFPage, RGB, rgb, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { isChordLine } from "./chords"

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
const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.5, 0.5, 0.5)

// The chosen family is used for every line, chord lines included. Only Courier keeps Smart Format's
// bar alignment; in Helvetica the letters have different widths, so bars drift apart.
interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

interface Row {
  text: string
  font: PDFFont
  size: number
  color: RGB
  gapBefore: number
  advance: number
}

// A run of rows kept in one column when possible; a spacer is a blank line
type Block = { spacer: true } | { spacer: false; rows: Row[] }

async function fetchFont(file: string): Promise<ArrayBuffer> {
  const res = await fetch(`/fonts/${file}`)
  if (!res.ok) throw new Error(`Could not load font ${file}`)
  return res.arrayBuffer()
}

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
    }
  }

  pdfDoc.registerFontkit(fontkit)
  const embed = async (file: string) => pdfDoc.embedFont(await loadFont(file), { subset: true })
  return {
    regular: await embed(mono ? "DejaVuSansMono.ttf" : "DejaVuSans.ttf"),
    bold: await embed(mono ? "DejaVuSansMono-Bold.ttf" : "DejaVuSans-Bold.ttf"),
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

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let current: string | null = null
  for (const word of text.split(" ")) {
    if (current === null) {
      current = word
      continue
    }
    const candidate: string = `${current} ${word}`
    if (current.trim() !== "" && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  lines.push(current ?? "")
  return lines
}

// Splits a chord line evenly into lineCount lines between bars, repeating the bar line at each break:
// "| C | F |" -> "| C |", "| F |"
function splitBars(text: string, lineCount: number): string[] {
  const bars = text.split(/(?=\|)/)
  const closing = bars.length > 1 && bars[bars.length - 1].trim() === "|" ? bars.pop()! : ""
  const perLine = Math.ceil(bars.length / lineCount)
  const lines: string[] = []
  for (let i = 0; i < bars.length; i += perLine) {
    const chunk = bars.slice(i, i + perLine).join("")
    lines.push(i + perLine < bars.length ? chunk + "|" : chunk + closing)
  }
  return lines
}

function barCount(text: string): number {
  return text.split(/(?=\|)/).filter((bar) => bar.trim() !== "|").length
}

// Wraps a chord line into as few evenly split lines as fit the column
function wrapBars(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const fits = (t: string) => font.widthOfTextAtSize(t, size) <= maxWidth
  for (let lineCount = 1; lineCount <= barCount(text); lineCount++) {
    const lines = splitBars(text, lineCount)
    if (lines.every(fits)) return lines
  }
  // A single bar wider than the column falls back to word wrapping
  return wrapText(text, font, size, maxWidth)
}

// One size for every chord line, so bars stay aligned across the whole chart. Picks the fewest
// line splits that fit when shrunk by at most MIN_CHORD_SCALE: a 4-bar line that is a little too wide
// is shrunk, one that is far too wide is split 2+2 (and shrunk a little if the halves still don't fit).
function chordFontSize(lines: string[], font: PDFFont, fontSize: number, colWidth: number, charsets: Map<PDFFont, Set<number>>) {
  const chordLines = lines.filter((line) => isChordLine(line)).map((line) => sanitize(line, font, charsets))
  const maxBars = Math.max(1, ...chordLines.map(barCount))
  for (let lineCount = 1; lineCount <= maxBars; lineCount++) {
    const widest = Math.max(
      0,
      ...chordLines.flatMap((line) => splitBars(line, lineCount)).map((part) => font.widthOfTextAtSize(part, fontSize)),
    )
    const scale = colWidth / widest
    if (scale >= 1) return fontSize
    // Slightly under the exact fit, so rounding never pushes a line over the column width
    if (scale >= MIN_CHORD_SCALE) return fontSize * scale * 0.999
  }
  return fontSize
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
  const chordSize = chordFontSize(lines, fonts.regular, fontSize, colWidth, charsets)

  lines.forEach((line, i) => {
    if (line.trim() === "") {
      flush()
      blocks.push({ spacer: true })
      return
    }

    const isTitle = i === 0
    const isSection = !isTitle && SECTION_RE.test(line)
    // The title and each section header start a new block, so a section is kept together
    if (isTitle || isSection) flush()

    const isChord = !isTitle && !isSection && isChordLine(line)
    const font = isTitle || isSection ? fonts.bold : fonts.regular
    const size = isTitle ? fontSize + 5 : isChord ? chordSize : fontSize
    const color = METADATA_RE.test(line) ? GREY : BLACK
    const text = sanitize(line, font, charsets)
    const wrapped = isChord ? wrapBars(text, font, size, colWidth) : wrapText(text, font, size, colWidth)
    wrapped.forEach((text, j) => {
      current.push({
        text,
        font,
        size,
        color,
        gapBefore: isSection && j === 0 ? lineHeight / 2 : 0,
        advance: isTitle ? fontSize + 14 : lineHeight,
      })
    })
    if (isTitle) flush()
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

// Draws text, turning "Chord(note)" into the chord followed by a small subscript note.
// The note takes up the same width as the original "Chord(note)" text, so aligned bars stay aligned.
function drawTextWithAnnotations(page: PDFPage, row: Row, x: number, y: number) {
  const options = { font: row.font, size: row.size, color: row.color }
  const subscriptSize = row.size * 0.7
  const subscriptY = y - row.size * 0.3
  let currentX = x
  let lastIndex = 0

  const draw = (text: string, size: number, atY: number) => {
    if (!text) return
    page.drawText(text, { ...options, size, x: currentX, y: atY })
    currentX += row.font.widthOfTextAtSize(text, size)
  }

  for (const match of row.text.matchAll(ANNOTATION_RE)) {
    draw(row.text.substring(lastIndex, match.index), row.size, y)
    const end = currentX + row.font.widthOfTextAtSize(match[0], row.size)
    draw(match[1], row.size, y)
    draw(match[2], subscriptSize, subscriptY)
    currentX = end
    lastIndex = match.index! + match[0].length
  }
  draw(row.text.substring(lastIndex), row.size, y)
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
    // Move a block that would be split to the next column, unless it is taller than a whole column
    if (y !== top && !blockFits(block.rows, y) && blockFits(block.rows, top)) nextColumn()

    for (const row of block.rows) {
      if (y - row.gapBefore < MARGIN) nextColumn()
      y -= row.gapBefore
      drawTextWithAnnotations(page, row, MARGIN + column * (colWidth + COLUMN_GAP), y)
      y -= row.advance
    }
  }

  return pdfDoc.save()
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
