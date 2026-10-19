// Nashville Number conversion (Roman/Arabic) relative to a detected key.

import { isChordLine, mapChordTokens, noteIndex, ParsedChord, scaleDegree } from "./chords"

// Major chords are upper-case (I, IV, V); minor and diminished are lower-case (ii, iii, vi, viidim).
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]
const MINOR_PREFIX = /^(?:min|m(?!aj))/
const DIMINISHED = /^(?:dim|o|°|ø)/

// Fallback when a note's spelling doesn't fit the key (e.g. Db in C#): name the degree by its pitch
const INTERVAL_TO_DEGREE: [number, string][] = [
  [1, ""], [2, "b"], [2, ""], [3, "b"], [3, ""], [4, ""], [4, "#"], [5, ""], [6, "b"], [6, ""], [7, "b"], [7, ""],
]

export class NumberedChordConverter {
  // Degree and accidental, read from the note's spelling: in C, G# is "#5" and Ab is "b6"
  private getScaleDegree(note: string, key: string): [number, string] {
    const { steps, alter } = scaleDegree(note, key)
    if (Math.abs(alter) <= 1) return [steps + 1, alter === 1 ? "#" : alter === -1 ? "b" : ""]
    return INTERVAL_TO_DEGREE[(noteIndex(note) - noteIndex(key) + 12) % 12]
  }

  private convertChord({ root, quality, bass, annotation }: ParsedChord, key: string, useRoman: boolean): string {
    const [deg, acc] = this.getScaleDegree(root, key)
    const minor = quality.match(MINOR_PREFIX)?.[0] ?? ""
    const rest = quality.slice(minor.length)

    let out: string
    if (useRoman) {
      // Case shows minor, so the "m" is dropped: Am7 -> vi7
      const lower = minor !== "" || DIMINISHED.test(quality)
      out = acc + (lower ? ROMAN[deg - 1].toLowerCase() : ROMAN[deg - 1]) + rest
    } else {
      out = acc + deg + (minor ? "m" : "") + rest
    }

    if (bass) {
      const [bdeg, bacc] = this.getScaleDegree(bass, key)
      out += "/" + bacc + (useRoman ? ROMAN[bdeg - 1] : String(bdeg))
    }
    return out + annotation
  }

  convertChartToNumbers(content: string, key: string, useRoman: boolean): string {
    return content
      .split("\n")
      .map((line) => (isChordLine(line) ? mapChordTokens(line, (chord) => this.convertChord(chord, key, useRoman)) : line))
      .join("\n")
  }

  convertChartToSystem(content: string, key: string, system: "roman" | "arabic" | "default"): string {
    if (system === "roman") return this.convertChartToNumbers(content, key, true)
    if (system === "arabic") return this.convertChartToNumbers(content, key, false)
    return content
  }
}
