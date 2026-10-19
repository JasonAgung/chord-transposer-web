// Smart formatter to align bars and standardize spacing similar to the Python version.

import { isChordLine, TOKEN_RE } from "./chords"

// Words of a bar; a note in parentheses stays one word even with spaces: "F(up high)"
const tokensOf = (bar: string): string[] => bar.match(TOKEN_RE) ?? []

export class SmartFormatter {
  isChordLine(line: string): boolean {
    return isChordLine(line)
  }

  private formatBarContent(content: string): string {
    return tokensOf(content).join(" ")
  }

  formatChordLine(line: string): string {
    if (!line.trim()) return line
    // Split keeping bars
    const parts = line.split(/(\|)/)
    const formatted: string[] = []
    let current: string[] = []

    for (const part of parts) {
      if (part === "|") {
        if (current.length) {
          formatted.push(this.formatBarContent(current.join("")))
          current = []
        }
        formatted.push("|")
      } else {
        current.push(part)
      }
    }
    if (current.length) {
      formatted.push(this.formatBarContent(current.join("")))
    }

    // Cleanup: ensure single space padding inside bars with separators: | ... | ... |
    const joined = formatted.join("")
    const chunks = joined.split("|")
    const cleaned: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const piece = chunks[i].trim()
      if ((i === 0 || i === chunks.length - 1) && piece === "") continue
      cleaned.push(piece)
    }
    if (line.trim().startsWith("|")) {
      if (line.trim().endsWith("|")) return "|" + cleaned.join(" | ") + "|"
      return "|" + cleaned.join(" | ")
    }
    return cleaned.join(" | ")
  }

  alignBarsInSection(lines: string[]): string[] {
    if (!lines.length) return lines
    // Parse each chord line into bars (between |)
    const parsed: string[][] = lines.map((line) => {
      const trimmed = line.trim()
      if (!(trimmed.startsWith("|") && trimmed.includes("|"))) return [line]
      const parts = trimmed.split("|").slice(1, -1) // remove leading/trailing empty
      return parts.map((p) => p.trim())
    })

    const maxBars = Math.max(...parsed.map((b) => b.length))
    // Compute max token widths per bar position
    const barWidths: number[] = []
    const perTokenWidths: number[][] = []

    for (let barIdx = 0; barIdx < maxBars; barIdx++) {
      // Find max number of tokens in this bar across lines
      let maxTokens = 0
      parsed.forEach((bars) => {
        if (barIdx < bars.length) {
          maxTokens = Math.max(maxTokens, tokensOf(bars[barIdx]).length)
        }
      })

      const tokenWidths: number[] = []
      for (let tokenIdx = 0; tokenIdx < maxTokens; tokenIdx++) {
        let w = 0
        parsed.forEach((bars) => {
          if (barIdx < bars.length) {
            const tokens = tokensOf(bars[barIdx])
            if (tokenIdx < tokens.length) w = Math.max(w, tokens[tokenIdx].length)
          }
        })
        tokenWidths.push(w)
      }

      perTokenWidths[barIdx] = tokenWidths
      const barWidth = tokenWidths.reduce((sum, v) => sum + v, 0) + Math.max(0, tokenWidths.length - 1)
      barWidths[barIdx] = barWidth
    }

    // Rebuild aligned lines
    const aligned: string[] = lines.map((_, i) => {
      const bars = parsed[i]
      if (!bars || bars.length === 1) return lines[i] // pass-through
      const parts: string[] = ["|"]
      for (let barIdx = 0; barIdx < bars.length; barIdx++) {
        const tokens = tokensOf(bars[barIdx])
        const widths = perTokenWidths[barIdx] || []
        const alignedTokens: string[] = []
        for (let t = 0; t < Math.max(tokens.length, widths.length); t++) {
          const tok = tokens[t] ?? ""
          const pad = widths[t] ?? 0
          alignedTokens.push(tok.padEnd(pad, " "))
        }
        const content = alignedTokens.join(" ").padEnd(barWidths[barIdx] ?? alignedTokens.join(" ").length, " ")
        parts.push(" " + content + " |")
      }
      return parts.join("")
    })

    return aligned
  }

  formatChart(content: string): string {
    const lines = content.split("\n")
    const formattedFirst = lines.map((line) => (this.isChordLine(line) ? this.formatChordLine(line) : line))

    // Group chord-line sections for alignment
    const result: string[] = []
    let section: string[] = []
    const flush = () => {
      if (section.length) {
        const aligned = this.alignBarsInSection(section)
        result.push(...aligned)
        section = []
      }
    }

    for (const line of formattedFirst) {
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
