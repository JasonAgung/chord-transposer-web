// Smart formatter to align bars and standardize spacing similar to the Python version.

import { isChordLine, parseChord, TOKEN_RE } from "./chords"

// Words of a bar; a note in parentheses stays one word even with spaces: "F(up high)"
const tokensOf = (bar: string): string[] => bar.match(TOKEN_RE) ?? []

// What can fill a bar besides chords: beat dots, slashes, repeat signs, "N.C."
const BEAT_RE = /^(?:[.\/%~\-–—]+|N\.?C\.?)$/i

interface BarLine {
  // Text before the first bar line, e.g. "Intro :"
  lead: string
  bars: string[][]
  // Text after the last bar line, e.g. "x2"
  tail: string
}

function parseBarLine(line: string): BarLine | null {
  const first = line.indexOf("|")
  if (first < 0) return null
  const chunks = line.slice(first + 1).split("|")
  let tail = chunks.pop()!.trim()
  const bars = chunks.map(tokensOf)
  // A line missing its closing bar line: the text after the last "|" is its last bar
  const tailTokens = tokensOf(tail)
  if (tailTokens.length && tailTokens.every((t) => parseChord(t) || BEAT_RE.test(t))) {
    bars.push(tailTokens)
    tail = ""
  }
  return { lead: line.slice(0, first).trim(), bars, tail }
}

export class SmartFormatter {
  isChordLine(line: string): boolean {
    return isChordLine(line)
  }

  // Lines up the bars of lines next to each other, and each beat inside the bars:
  // every bar and every beat gets the width of its widest entry
  alignBarsInSection(lines: string[]): string[] {
    const parsed = lines.map(parseBarLine)
    const valid = parsed.filter((p): p is BarLine => p !== null)
    if (!valid.length) return lines

    const leadWidth = Math.max(...valid.map((p) => p.lead.length))
    const maxBars = Math.max(...valid.map((p) => p.bars.length))
    const tokenWidths: number[][] = []
    for (let barIdx = 0; barIdx < maxBars; barIdx++) {
      const widths: number[] = []
      for (const { bars } of valid) {
        ;(bars[barIdx] ?? []).forEach((token, t) => (widths[t] = Math.max(widths[t] ?? 0, token.length)))
      }
      tokenWidths.push(widths)
    }
    const barWidths = tokenWidths.map((widths) => widths.reduce((sum, w) => sum + w, 0) + Math.max(0, widths.length - 1))

    return parsed.map((p, i) => {
      if (!p) return lines[i]
      const lead = leadWidth ? p.lead.padEnd(leadWidth) + " " : ""
      const bars = p.bars.map((tokens, barIdx) => {
        const content = tokens.map((token, t) => token.padEnd(tokenWidths[barIdx][t])).join(" ")
        return ` ${content.padEnd(barWidths[barIdx])} |`
      })
      return `${lead}|${bars.join("")}${p.tail ? " " + p.tail : ""}`
    })
  }

  formatChart(content: string): string {
    // Group runs of chord lines; each run is aligned on its own
    const result: string[] = []
    let section: string[] = []
    const flush = () => {
      if (section.length) result.push(...this.alignBarsInSection(section))
      section = []
    }

    for (const line of content.split("\n")) {
      if (this.isChordLine(line)) {
        section.push(line)
      } else {
        flush()
        result.push(line)
      }
    }
    flush()
    return result.join("\n")
  }
}
