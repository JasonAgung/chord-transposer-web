// The "grid" PDF style: each bar is a cell of fixed width and each chord is placed at its beat inside the
// cell, so bars line up in any font. Spaces in the text don't matter, only the beats.

import { PageSizes, PDFDocument, PDFFont, PDFPage, RGB, rgb, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { isChordLine, parseChord, TOKEN_RE } from "./chords"
import { fetchFont } from "./fonts"

// ---------------------------------------------------------------- Reading the chart

interface Slot {
  // Where the chord falls in the bar: 0 = beat 1, 0.5 = beat 3 of 4
  pos: number
  token: string
}

export type Item =
  | { kind: "section"; name: string; note?: string }
  | { kind: "chords"; bars: Slot[][]; tail: string }
  | { kind: "text"; text: string }
  | { kind: "gap" }

export interface Song {
  title: string
  key?: string
  time?: string
  // "♩ = 72": the beat the tempo counts and its speed
  tempo?: string
  structure?: string
  items: Item[]
}

// Tokens that only mark beats: ".", "/", "-"
const BEAT_RE = /^(?:[.\/~\-–—]+)$/
const tokensOf = (s: string) => s.match(TOKEN_RE) ?? []
const isBarToken = (t: string) => !!parseChord(t) || BEAT_RE.test(t) || /^(N\.?C\.?|%)$/i.test(t)

function parseBarLine(line: string): { lead: string; bars: Slot[][]; tail: string } {
  const first = line.indexOf("|")
  const barTexts = line.slice(first + 1).split("|")
  let tail = barTexts.pop()!.trim()
  // A line missing its closing bar line: the text after the last "|" is its last bar
  if (tail && tokensOf(tail).every(isBarToken)) {
    barTexts.push(tail)
    tail = ""
  }
  const bars = barTexts.map((text) => {
    const tokens = tokensOf(text)
    return tokens.flatMap((token, i) => (BEAT_RE.test(token) ? [] : [{ pos: i / tokens.length, token }]))
  })
  return { lead: line.slice(0, first).replace(/:\s*$/, "").trim(), bars, tail }
}

// A line of bars: a chord line, empty bars like "| . . . . |", or numbers ("| I . . . | vi . . . |")
const isBarLine = (t: string) => isChordLine(t) || (t.startsWith("|") && t.indexOf("|", 1) > 0)

// The note a tempo counts, from the "(1/8)" in "Tempo (1/8) = 85 BPM": ♩ for quarters, ♪ for eighths,
// a dot after it for dotted notes (3/8 or 1/4. is a dotted quarter, common in 6/8). The fonts have no
// other note symbols, so other values are written as given. No value means quarters.
export function tempoNote(value?: string): string {
  const v = (value ?? "").replace(/\s+/g, "")
  if (!v) return "♩"
  const m = v.match(/^(\d+)\/(\d+)(\.|dotted)?$/i)
  if (!m) return v
  let [num, den] = [Number(m[1]), Number(m[2])]
  let dotted = !!m[3]
  // 3/8 = a dotted quarter, 3/16 = a dotted eighth
  if (num === 3 && !dotted) {
    num = 1
    den /= 2
    dotted = true
  }
  const symbol = num === 1 ? { 4: "♩", 8: "♪" }[den] : undefined
  return symbol ? symbol + (dotted ? "." : "") : v
}

export function parseSong(content: string): Song {
  const lines = content.split("\n").map((l) => l.replace(/\r$/, ""))
  const song: Song = { title: lines[0]?.trim() || "Untitled", items: [] }
  const push = (item: Item) => {
    const last = song.items[song.items.length - 1]
    if (item.kind === "gap" && (!last || last.kind === "gap" || last.kind === "section")) return
    song.items.push(item)
  }
  for (const line of lines.slice(1)) {
    const t = line.trim()
    let m: RegExpMatchArray | null
    if (!t) push({ kind: "gap" })
    else if ((m = t.match(/^Do\s*=\s*(.+)$/i))) song.key = m[1].trim()
    else if ((m = t.match(/^Time\s*Signature\s*=\s*(.+)$/i))) song.time = m[1].trim()
    else if ((m = t.match(/^Tempo\s*(?:\(([^)]*)\))?[^=]*=\s*(.+)$/i))) {
      song.tempo = `${tempoNote(m[1])} = ${m[2].replace(/\s*BPM\s*$/i, "").trim()}`
    }
    else if ((m = t.match(/^Structure\s*=\s*(.+)$/i))) song.structure = m[1].trim()
    else if (isBarLine(t)) {
      const { lead, bars, tail } = parseBarLine(t)
      if (lead) push({ kind: "section", name: lead })
      push({ kind: "chords", bars, tail })
    } else if (!t.includes("|") && (m = t.match(/^([^:]+?)\s*:\s*(.*)$/))) {
      // "Chorus : Loss, Build Up" — a section with a note for the band
      const note = m[2].replace(/\s*,[\s,]*/g, ", ").replace(/,\s*$/, "").trim()
      push({ kind: "section", name: m[1], note: note || undefined })
    } else push({ kind: "text", text: t })
  }
  while (song.items[song.items.length - 1]?.kind === "gap") song.items.pop()
  return song
}

// ---------------------------------------------------------------- Writing a chord

type Role = "root" | "acc" | "minor" | "ext" | "slash" | "bass" | "bassAcc" | "note" | "plain"
export interface Seg {
  text: string
  role: Role
}

const toSymbols = (s: string) =>
  s.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯").replace(/^b$|b$/, "♭").replace(/^#$|#$/, "♯")
// Parenthesised text that is part of the chord, like (maj7) or (b9); anything else is a note like (up)
const CHORDISH_PAREN = /^\((maj|min|add|sus|no|omit|alt|[#b♭♯]?\d)/i
const NUMERAL = "VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|[1-7]"
// Roman or Arabic numbers from the notation converter: "bVIImaj7", "vi7", "6m7", "5/7"
const NUMERAL_RE = new RegExp(`^([b#♭♯]?)(${NUMERAL})(m(?!aj)|min)?(.*?)(?:\\/([b#♭♯]?)(${NUMERAL}))?$`)
const MINOR_RE = /^(m(?!aj)|min(?!or))/

// Splits a chord into the parts that are drawn differently: "F#m7(up)" -> F, ♯, m, 7, up
export function chordSegments(token: string): Seg[] {
  const notes: string[] = []
  const chord = token.replace(/\([^)]*\)/g, (group) => {
    if (CHORDISH_PAREN.test(group)) return group
    notes.push(group.slice(1, -1))
    return ""
  })
  const segs: Seg[] = []
  const p = parseChord(chord)
  const n = p ? null : chord.match(NUMERAL_RE)
  if (p) {
    segs.push({ text: p.root[0], role: "root" })
    if (p.root.length > 1) segs.push({ text: toSymbols(p.root.slice(1)), role: "acc" })
    let quality = p.quality
    const minor = quality.match(MINOR_RE)
    if (minor) {
      segs.push({ text: "m", role: "minor" })
      quality = quality.slice(minor[0].length)
    }
    if (quality) segs.push({ text: toSymbols(quality), role: "ext" })
    if (p.bass) {
      segs.push({ text: "/", role: "slash" }, { text: p.bass[0], role: "bass" })
      if (p.bass.length > 1) segs.push({ text: toSymbols(p.bass.slice(1)), role: "bassAcc" })
    }
  } else if (n) {
    const [, acc, numeral, minor, ext, bassAcc, bass] = n
    if (acc) segs.push({ text: toSymbols(acc), role: "acc" })
    segs.push({ text: numeral, role: "root" })
    if (minor) segs.push({ text: "m", role: "minor" })
    if (ext) segs.push({ text: toSymbols(ext), role: "ext" })
    if (bass) {
      segs.push({ text: "/", role: "slash" })
      if (bassAcc) segs.push({ text: toSymbols(bassAcc), role: "bassAcc" })
      segs.push({ text: bass, role: "bass" })
    }
  } else {
    segs.push({ text: chord, role: "plain" })
  }
  for (const note of notes) segs.push({ text: note, role: "note" })
  return segs
}

// Size, weight and baseline shift of each part of a chord, relative to the chord size
const STYLE: Record<Role, { scale: number; bold: boolean; rise: number; italic?: boolean; grey?: boolean }> = {
  root: { scale: 1, bold: true, rise: 0 },
  acc: { scale: 0.72, bold: true, rise: 0.36 },
  minor: { scale: 0.92, bold: false, rise: 0 },
  ext: { scale: 0.62, bold: false, rise: 0.46 },
  slash: { scale: 0.9, bold: false, rise: 0 },
  bass: { scale: 0.86, bold: true, rise: 0 },
  bassAcc: { scale: 0.62, bold: true, rise: 0.3 },
  note: { scale: 0.56, bold: false, rise: -0.34, italic: true, grey: true },
  plain: { scale: 0.86, bold: true, rise: 0 },
}

// ---------------------------------------------------------------- Fonts and text

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  // DejaVu draws what Helvetica can't: ♭ ♯ ♩ and non-Latin text
  sym: PDFFont
  symBold: PDFFont
}

const charsets = new WeakMap<PDFFont, Set<number>>()
function canDraw(font: PDFFont, c: string): boolean {
  let set = charsets.get(font)
  if (!set) charsets.set(font, (set = new Set(font.getCharacterSet())))
  return set.has(c.codePointAt(0)!)
}

// pdf-lib measures text with kerning but draws it without; measure glyph by glyph, as it is drawn
const glyphWidths = new WeakMap<PDFFont, Map<string, number>>()
function textWidth(text: string, font: PDFFont, size: number): number {
  let widths = glyphWidths.get(font)
  if (!widths) glyphWidths.set(font, (widths = new Map()))
  let total = 0
  for (const c of text) {
    let w = widths.get(c)
    if (w === undefined) widths.set(c, (w = font.widthOfTextAtSize(c, 1000)))
    total += w
  }
  return (total * size) / 1000
}

// Splits text into runs for the main font and the fallback font; a character neither has becomes "?"
function runs(text: string, base: PDFFont, sym: PDFFont): { text: string; font: PDFFont }[] {
  const out: { text: string; font: PDFFont }[] = []
  for (let c of text.replace(/\t/g, "    ")) {
    let font = base
    if (!canDraw(base, c)) {
      if (canDraw(sym, c)) font = sym
      else c = "?"
    }
    const last = out[out.length - 1]
    if (last && last.font === font) last.text += c
    else out.push({ text: c, font })
  }
  return out
}

function measureRich(text: string, base: PDFFont, sym: PDFFont, size: number) {
  return runs(text, base, sym).reduce((w, r) => w + textWidth(r.text, r.font, size), 0)
}

function drawRich(page: PDFPage, text: string, x: number, y: number, size: number, base: PDFFont, sym: PDFFont, color: RGB) {
  for (const r of runs(text, base, sym)) {
    page.drawText(r.text, { x, y, size, font: r.font, color })
    x += textWidth(r.text, r.font, size)
  }
  return x
}

// Breaks text into lines no wider than maxWidth, at spaces
function wrapRich(text: string, base: PDFFont, sym: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ""
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word
    if (current && measureRich(candidate, base, sym, size) > maxWidth) {
      lines.push(current)
      current = word
    } else current = candidate
  }
  lines.push(current)
  return lines
}

function segFonts(role: Role, fonts: Fonts) {
  const s = STYLE[role]
  return { base: s.italic ? fonts.italic : s.bold ? fonts.bold : fonts.regular, sym: s.bold ? fonts.symBold : fonts.sym }
}

// Lays out a chord's parts left to right. The extension (raised) and a note like "up" (lowered) are
// stacked on top of each other, so the note stays right next to the chord.
function placeChord(segs: Seg[], size: number, fonts: Fonts) {
  const placed: { seg: Seg; x: number }[] = []
  let x = 0
  let extStart = -1
  let extEnd = 0
  for (const seg of segs) {
    const { base, sym } = segFonts(seg.role, fonts)
    const w = measureRich(seg.text, base, sym, size * STYLE[seg.role].scale)
    if (seg.role === "note" && extStart >= 0) {
      placed.push({ seg, x: extStart })
      x = Math.max(extEnd, extStart + w)
      continue
    }
    placed.push({ seg, x })
    if (seg.role === "ext") {
      extStart = x
      extEnd = x + w
    }
    x += w + (seg.role === "acc" ? size * 0.04 : 0)
  }
  return { placed, width: x }
}

const chordWidth = (segs: Seg[], size: number, fonts: Fonts) => placeChord(segs, size, fonts).width

function drawChord(page: PDFPage, segs: Seg[], x: number, y: number, size: number, fonts: Fonts) {
  for (const { seg, x: dx } of placeChord(segs, size, fonts).placed) {
    const s = STYLE[seg.role]
    const { base, sym } = segFonts(seg.role, fonts)
    drawRich(page, seg.text, x + dx, y + s.rise * size, size * s.scale, base, sym, s.grey ? NOTE : INK)
  }
}

// ---------------------------------------------------------------- Page layout

const INK = rgb(0.1, 0.1, 0.12)
const NOTE = rgb(0.35, 0.35, 0.4)
const MUTED = rgb(0.45, 0.45, 0.5)
const RULE = rgb(0.78, 0.78, 0.8)
const BADGE = rgb(0.13, 0.14, 0.17)
const BEAT = rgb(0.42, 0.42, 0.46)
const WHITE = rgb(1, 1, 1)

const BARS_PER_ROW = 4
const MARGIN_X = 44
const MARGIN_Y = 42
// Room right of the bars for "×2"
const TAIL_GUTTER = 26
// Chord size at the default font size of 10
const CHORD_SIZE = 13
// Smallest share of the chosen size the chart may shrink to, to save a page or fit a crowded bar
const MIN_SCALE = 0.78
// A bar too full even at this size keeps shrinking rather than letting chords overlap; overlapping chords
// can't be read at all
const MIN_BAR_SCALE = 0.35
const CHORD_GAP = 6
// Room for one dot of an empty beat
const DOT_SPACE = 6

export interface GridPdfOptions {
  orientation?: "portrait" | "landscape"
  // The size of plain text; chords are drawn 1.3 times as big
  fontSize?: number
  // Reads a file from /public/fonts
  loadFont?: (file: string) => Promise<ArrayBuffer>
}

interface Block {
  height: number
  // Starts a section: the section is kept on one page when it fits on one
  sectionStart?: boolean
  // Blank space, dropped at the top of a page
  gap?: boolean
  draw: (page: PDFPage, top: number) => void
}

export async function createGridPdf(content: string, options: GridPdfOptions = {}): Promise<Uint8Array> {
  const { orientation = "portrait", fontSize = 10, loadFont = fetchFont } = options
  const song = parseSong(content)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    sym: await pdf.embedFont(await loadFont("DejaVuSans.ttf"), { subset: true }),
    symBold: await pdf.embedFont(await loadFont("DejaVuSans-Bold.ttf"), { subset: true }),
  }
  const [a4w, a4h] = PageSizes.A4
  const [width, height] = orientation === "landscape" ? [a4h, a4w] : [a4w, a4h]
  const left = MARGIN_X
  const right = width - MARGIN_X
  const cellW = (right - left - TAIL_GUTTER) / BARS_PER_ROW
  const beatsPerBar = Math.max(1, parseInt(song.time ?? "", 10) || 4)
  const base = fontSize / 10

  // ---- Header: title on the left, key and tempo on the right
  const keyText = song.key ? `Do = ${toSymbols(song.key)}` : ""
  const info = [song.time, song.tempo].filter(Boolean).join("   ")
  const keyWidth = keyText ? measureRich(keyText, fonts.bold, fonts.symBold, 13) : 0
  const infoWidth = info ? measureRich(info, fonts.regular, fonts.sym, 9.5) : 0
  const titleRoom = right - left - Math.max(keyWidth, infoWidth) - 20
  // A long title gets smaller rather than running into the key
  const titleSize = Math.max(12, Math.min(20, (20 * titleRoom) / Math.max(1, measureRich(song.title, fonts.bold, fonts.symBold, 20))))
  const headerHeight = song.structure ? 66 : 54
  const drawHeader = (page: PDFPage) => {
    const top = height - MARGIN_Y
    drawRich(page, song.title, left, top - 20, titleSize, fonts.bold, fonts.symBold, INK)
    if (song.structure) {
      drawRich(page, song.structure.split(/\s*,\s*/).join("  →  "), left, top - 36, 8.5, fonts.regular, fonts.sym, MUTED)
    }
    if (keyText) drawRich(page, keyText, right - keyWidth, top - 18, 13, fonts.bold, fonts.symBold, INK)
    if (info) drawRich(page, info, right - infoWidth, top - 33, 9.5, fonts.regular, fonts.sym, MUTED)
    const ruleY = top - headerHeight + 10
    page.drawLine({ start: { x: left, y: ruleY }, end: { x: right, y: ruleY }, thickness: 0.8, color: INK })
  }
  // Later pages repeat the title small
  const contHeight = 26
  const drawContHeader = (page: PDFPage) => {
    const top = height - MARGIN_Y
    drawRich(page, song.title, left, top - 10, 9, fonts.bold, fonts.symBold, MUTED)
    page.drawLine({ start: { x: left, y: top - 16 }, end: { x: right, y: top - 16 }, thickness: 0.5, color: RULE })
  }

  // Places the chords of one bar at their beats, at full size. Room is kept after each chord for the dots of
  // its empty beats (after[i] dots). When chords are too close (A/C# on beat 3, B/D# on beat 4) they move
  // apart, using free space in the bar; only when the bar is truly too full are all its chords made
  // smaller, by the same amount.
  const placeInBar = (chords: { x: number; segs: Seg[] }[], after: number[], start: number, end: number, S: number) => {
    let size = S
    let w = chords.map((c) => chordWidth(c.segs, size, fonts))
    const reserve = after.map((n, i) => (i < chords.length - 1 || n > 0 ? CHORD_GAP + n * DOT_SPACE : 0))
    const fixed = reserve.reduce((sum, x) => sum + x, 0)
    const needed = w.reduce((sum, x) => sum + x, 0) + fixed
    if (needed > end - start) {
      size = Math.max(S * MIN_BAR_SCALE, (S * (end - start - fixed)) / (needed - fixed))
      w = chords.map((c) => chordWidth(c.segs, size, fonts))
    }
    const xs = chords.map((c) => c.x)
    // Push right where a chord (and its dots) runs into the next one, then back left where the last ones
    // pass the bar line
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + w[i - 1] + reserve[i - 1])
    const last = xs.length - 1
    if (last >= 0) xs[last] = Math.min(xs[last], end - w[last] - (after[last] ? reserve[last] : 0))
    for (let i = last - 1; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - w[i] - reserve[i])
    if (xs.length) xs[0] = Math.max(xs[0], start)
    return chords.map((c, i) => ({ x: xs[i], segs: c.segs, size, end: xs[i] + w[i] }))
  }

  const drawRow = (page: PDFPage, top: number, bars: Slot[][], final: boolean, tail: string, S: number, rowH: number) => {
    const y0 = top - rowH + 3
    const y1 = top - 3
    const baseline = y0 + (rowH - 6) * 0.3
    const barLine = (x: number, thickness = 0.9) => page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness, color: INK })
    // Beats are spread over the bar minus some room at the end, so a chord on the last beat
    // does not touch the next bar line
    const inner = cellW - 24
    const beatX = (cx: number, pos: number) => cx + 7 + inner * pos
    bars.forEach((slots, b) => {
      const cx = left + b * cellW
      barLine(cx)
      const doubleBarAfter = b === bars.length - 1 && final
      // The beat each chord falls on, and how many empty beats follow it before the next chord
      const beatOf = slots.map((slot) => Math.min(beatsPerBar - 1, Math.round(slot.pos * beatsPerBar)))
      // Dots show the beats when a bar has more than one chord, or one chord that isn't on beat 1
      const showDots = slots.length > 1 || (slots.length === 1 && beatOf[0] > 0)
      const after = beatOf.map((beat, i) => (showDots ? (beatOf[i + 1] ?? beatsPerBar) - beat - 1 : 0))
      const leading = showDots ? beatOf[0] : 0
      const barEnd = cx + cellW - 5 - (doubleBarAfter ? 5 : 0)
      const chords = placeInBar(
        slots.map((slot) => ({ x: beatX(cx, slot.pos), segs: chordSegments(slot.token) })),
        after,
        cx + 7 + leading * DOT_SPACE,
        barEnd,
        S,
      )
      // An empty bar (drums only, a break) shows its beats as slashes
      if (slots.length === 0) {
        for (let beat = 0; beat < beatsPerBar; beat++) {
          const sx = beatX(cx, beat / beatsPerBar) + 4
          page.drawLine({ start: { x: sx, y: baseline - 1 }, end: { x: sx + 5, y: baseline + S * 0.75 }, thickness: 1.3, color: BEAT })
        }
      }
      // Dots on the empty beats show where each chord falls when a bar has more than one. Every empty beat
      // gets its dot: at its beat when there's room, otherwise packed closer together after the chord.
      const drawDots = (firstBeat: number, count: number, from: number, to: number) => {
        if (count <= 0) return
        const atBeats = Array.from({ length: count }, (_, j) => beatX(cx, (firstBeat + j) / beatsPerBar) + 2)
        const fits = atBeats[0] >= from && atBeats[count - 1] <= to
        const spacing = Math.min(DOT_SPACE, (to - from) / count)
        for (let j = 0; j < count; j++) {
          const x = fits ? atBeats[j] : from + spacing * (j + 0.5)
          page.drawCircle({ x, y: baseline + S * 0.3, size: 1.6, color: BEAT })
        }
      }
      if (showDots) {
        const gap = 5
        drawDots(0, leading, cx + 6, chords[0].x - gap)
        chords.forEach((c, i) => drawDots(beatOf[i] + 1, after[i], c.end + gap, (chords[i + 1]?.x ?? barEnd) - gap / 2))
      }
      for (const c of chords) drawChord(page, c.segs, c.x, baseline, c.size, fonts)
    })
    const end = left + bars.length * cellW
    if (final) {
      barLine(end - 3.2)
      barLine(end, 2.4)
    } else barLine(end)
    if (tail) drawRich(page, toSymbols(tail.replace(/^x(\d+)$/i, "×$1")), end + 7, baseline, 10 * base, fonts.bold, fonts.symBold, INK)
  }

  // ---- The chart as blocks of fixed height, at scale k of the chosen size
  const buildBlocks = (k: number): Block[] => {
    const S = CHORD_SIZE * base * k
    const rowH = 27 * base * k
    const blocks: Block[] = []
    song.items.forEach((item, idx) => {
      if (item.kind === "gap") {
        blocks.push({ height: 8 * base * k, gap: true, draw: () => {} })
      } else if (item.kind === "section") {
        const label = item.name.toUpperCase()
        const size = 8 * base * Math.max(k, 0.9)
        const badgeH = size + 5
        const w = measureRich(label, fonts.bold, fonts.symBold, size) + 10
        const space = (blocks.length === 0 ? 4 : 12) * base * k
        blocks.push({
          height: space + badgeH + 4,
          sectionStart: true,
          draw: (page, top) => {
            const y = top - space - badgeH
            page.drawRectangle({ x: left, y, width: w, height: badgeH, color: BADGE })
            drawRich(page, label, left + 5, y + badgeH * 0.28, size, fonts.bold, fonts.symBold, WHITE)
            if (item.note) drawRich(page, item.note, left + w + 7, y + badgeH * 0.26, size * 1.08, fonts.italic, fonts.sym, MUTED)
          },
        })
      } else if (item.kind === "text") {
        const size = 10 * base * k
        for (const line of wrapRich(item.text, fonts.italic, fonts.sym, size, right - left)) {
          blocks.push({ height: size * 1.5, draw: (page, top) => drawRich(page, line, left, top - size * 1.1, size, fonts.italic, fonts.sym, INK) })
        }
      } else {
        // A blank line inside a section is a phrase break; the double bar marks the end of the section
        const next = song.items.slice(idx + 1).find((it) => it.kind !== "gap")
        const endsSection = !next || next.kind !== "chords"
        for (let r = 0; r < Math.max(1, item.bars.length); r += BARS_PER_ROW) {
          const bars = item.bars.slice(r, r + BARS_PER_ROW)
          const lastRow = r + BARS_PER_ROW >= item.bars.length
          blocks.push({
            height: rowH,
            draw: (page, top) => drawRow(page, top, bars, lastRow && endsSection, lastRow ? item.tail : "", S, rowH),
          })
        }
      }
    })
    return blocks
  }

  // ---- Pages. A section stays on one page when it fits on one, so nobody turns a page mid-section.
  const bodyFirst = height - MARGIN_Y * 2 - headerHeight
  const bodyNext = height - MARGIN_Y * 2 - contHeight
  const paginate = (blocks: Block[]) => {
    const pages: { block: Block; top: number }[][] = [[]]
    let y = bodyFirst
    blocks.forEach((block, i) => {
      let need = block.height
      if (block.sectionStart) {
        let end = i + 1
        while (end < blocks.length && !blocks[end].sectionStart) end++
        const section = blocks.slice(i, end).reduce((h, b) => h + b.height, 0)
        // A section longer than a page at least keeps its label with its first row
        need = section <= bodyNext ? section : block.height + (blocks[i + 1]?.height ?? 0)
      }
      const page = pages[pages.length - 1]
      if (need > y && page.length) {
        pages.push([])
        y = bodyNext
      }
      if (block.gap && !pages[pages.length - 1].length && pages.length > 1) return
      pages[pages.length - 1].push({ block, top: y })
      y -= block.height
    })
    return pages
  }

  // Shrink a little (down to MIN_SCALE) when that saves a page; otherwise keep the chosen size
  let layout = paginate(buildBlocks(1))
  for (let k = 0.98; k >= MIN_SCALE - 1e-9; k -= 0.02) {
    const smaller = paginate(buildBlocks(k))
    if (smaller.length < layout.length) layout = smaller
  }

  const pages = layout.map((items, i) => {
    const page = pdf.addPage([width, height])
    if (i === 0) drawHeader(page)
    else drawContHeader(page)
    // "top" is the space left above the bottom margin
    for (const { block, top } of items) block.draw(page, MARGIN_Y + top)
    return page
  })
  if (pages.length > 1) {
    pages.forEach((page, i) => {
      const text = `${i + 1} / ${pages.length}`
      page.drawText(text, { x: right - textWidth(text, fonts.regular, 8), y: MARGIN_Y - 18, size: 8, font: fonts.regular, color: MUTED })
    })
  }
  return pdf.save()
}
