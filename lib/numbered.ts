// Nashville Number conversion (Roman/Arabic) relative to a detected key.

import { noteIndex, shouldUseFlats, NOTES_SHARP, NOTES_FLAT } from "./chords"

const ROMAN_MAJOR: Record<number, string> = { 1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii" }
const ROMAN_MINOR: Record<number, string> = { 1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii" }

const CHORD_RE_G = /([A-G][#b]?)([mM]?(?:maj)?[0-9]*(?:sus|dim|aug|add)?[0-9]*)?(?:\/([A-G][#b]?))?/g
const CHORD_RE_NG = /([A-G][#b]?)([mM]?(?:maj)?[0-9]*(?:sus|dim|aug|add)?[0-9]*)?(?:\/([A-G][#b]?))?/

export class NumberedChordConverter {
  private intervalToDegree: Record<number, [number, "" | "b" | "#"]> = {
    0: [1, ""],
    1: [2, "b"],
    2: [2, ""],
    3: [3, "b"],
    4: [3, ""],
    5: [4, ""],
    6: [4, "#"],
    7: [5, ""],
    8: [6, "b"],
    9: [6, ""],
    10: [7, "b"],
    11: [7, ""],
  }

  private majorScaleSemitones: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }

  private getScaleDegree(note: string, key: string): [number, "" | "b" | "#"] {
    const keyPos = noteIndex(key)
    const notePos = noteIndex(note)
    const interval = (notePos - keyPos + 12) % 12
    let [deg, acc] = this.intervalToDegree[interval] ?? [1, ""]
    // Special-case example from Python: F# in G should be VII not #IV
    if (key === "G" && note === "F#") {
      deg = 7
      acc = ""
    }
    return [deg, acc]
  }

  private isMinorQuality(quality: string): boolean {
    if (!quality) return false
    if (quality === "m") return true
    if (quality.startsWith("m") && !quality.startsWith("maj")) return true
    return false
  }

  private convertChord(root: string, quality: string, bass: string | null, key: string, useRoman: boolean): string {
    const [deg, acc] = this.getScaleDegree(root, key)
    const isMinor = this.isMinorQuality(quality || "")
    let number: string

    if (useRoman) {
      number = isMinor ? ROMAN_MINOR[deg] : ROMAN_MAJOR[deg]
      if (acc) number = acc + number
    } else {
      number = (acc ? acc : "") + String(deg)
      if (isMinor && !/^(m7|m9|m11|m13)$/.test(quality || "")) {
        number += "m"
      }
    }

    // Handle quality suffixes
    let suffix = quality || ""
    if (useRoman && isMinor && suffix.startsWith("m")) {
      // For Roman numerals, minor is represented by case, so drop 'm'
      suffix = suffix.slice(1)
    } else if (!useRoman && suffix === "m") {
      // We already appended m above
      suffix = ""
    }
    if (suffix.startsWith("aj7")) suffix = "maj7"

    let out = number + (suffix || "")

    if (bass) {
      const [bdeg, bacc] = this.getScaleDegree(bass, key)
      const bassNum = useRoman ? (bacc ? bacc : "") + ROMAN_MAJOR[bdeg] : (bacc ? bacc : "") + String(bdeg)
      out += "/" + bassNum
    }

    return out
  }

  private degreeToNote(key: string, degree: number, acc: "" | "b" | "#"): string {
    const keyIdx = noteIndex(key)
    const base = this.majorScaleSemitones[degree] ?? 0
    const offset = acc === "#" ? 1 : acc === "b" ? -1 : 0
    const idx = (keyIdx + base + offset + 120) % 12
    const preferFlats = shouldUseFlats(key)
    return preferFlats ? NOTES_FLAT[idx] : NOTES_SHARP[idx]
  }

  private diatonicIsMinor(degree: number): boolean {
    // Major key diatonic harmony: ii, iii, vi are minor, vii is diminished
    return degree === 2 || degree === 3 || degree === 6
  }

  private diatonicIsDim(degree: number): boolean {
    return degree === 7
  }

  private romanToDegree(r: string): number | null {
    const s = r.toLowerCase()
    const map: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 }
    return map[s] ?? null
  }

  private buildABCFromDegree(
    degree: number,
    acc: "" | "b" | "#",
    suffix: string,
    explicitMinor: boolean | null,
    key: string,
  ): string {
    const root = this.degreeToNote(key, degree, acc)
    // determine minor/major/dim
    const isMinor = explicitMinor === true || (explicitMinor === null && this.diatonicIsMinor(degree))
    const isDim = this.diatonicIsDim(degree)
    let quality = ""
    if (isDim) {
      quality = "dim"
    } else if (isMinor) {
      quality = "m"
    } // else major: keep empty unless suffix brings maj, 7, etc.

    // normalize suffix quirks
    let sfx = suffix || ""
    if (sfx.startsWith("aj7")) sfx = "maj7"

    // avoid duplicating 'm' if suffix already expresses a minor extension like m7
    if (quality === "m" && /^m(?!aj)/i.test(sfx)) {
      quality = ""
    }

    return root + quality + sfx
  }

  private convertLineToNumbers(line: string, key: string, useRoman: boolean): string {
    if (!this.isChordLine(line)) return line
    return line.replace(CHORD_RE_G, (_m, root, quality, bass) =>
      this.convertChord(root, quality || "", bass || null, key, useRoman),
    )
  }

  private convertLineFromArabic(line: string, key: string): string {
    if (!this.isChordLine(line)) return line
    return line.replace(this.CHORD_OR_NUMBER_FINDER(), (tok) => {
      const m = tok.match(this.ARABIC_TOKEN)
      if (!m) return tok
      const [_, accRoot, degStr, minorFlag, suffix = "", accBass, degBassStr] = m
      const degree = Number(degStr)
      if (!degree || degree < 1 || degree > 7) return tok
      const root = this.buildABCFromDegree(
        degree,
        (accRoot as "" | "b" | "#") || "",
        suffix,
        minorFlag ? true : null,
        key,
      )
      if (degBassStr) {
        const degB = Number(degBassStr)
        if (degB >= 1 && degB <= 7) {
          const bass = this.buildABCFromDegree(degB, (accBass as "" | "b" | "#") || "", "", null, key)
          return `${root}/${bass.replace(/([A-G][#b]?).*/, "$1")}`
        }
      }
      return root
    })
  }

  private convertLineFromRoman(line: string, key: string): string {
    if (!this.isChordLine(line)) return line
    return line.replace(this.CHORD_OR_NUMBER_FINDER(), (tok) => {
      const m = tok.match(this.ROMAN_TOKEN)
      if (!m) return tok
      const [_, accRoot, roman, suffix = "", accBass, bassRoman] = m
      const deg = this.romanToDegree(roman)
      if (!deg) return tok
      const root = this.buildABCFromDegree(deg, (accRoot as "" | "b" | "#") || "", suffix, null, key)
      if (bassRoman) {
        const degB = this.romanToDegree(bassRoman)
        if (degB) {
          const bass = this.buildABCFromDegree(degB, (accBass as "" | "b" | "#") || "", "", null, key)
          return `${root}/${bass.replace(/([A-G][#b]?).*/, "$1")}`
        }
      }
      return root
    })
  }

  private CHORD_OR_NUMBER_FINDER() {
    // token-ish finder that isolates bar/space separated tokens
    return /([^\s|]+)(?=(\s+|\||$))/g
  }

  private ARABIC_TOKEN =
    /^(?:([b#])\s*)?([1-7])(m)?((?:maj)?[0-9]*(?:sus|dim|aug|add)?[0-9]*)?(?:\/(?:([b#])\s*)?([1-7]))?$/i

  private ROMAN_TOKEN =
    /^(?:([b#])\s*)?([ivxlcdm]+)((?:maj)?[0-9]*(?:sus|dim|aug|add)?[0-9]*)?(?:\/(?:([b#])\s*)?([ivxlcdm]+))?$/i

  convertChartToNumbers(content: string, key: string, useRoman: boolean): string {
    const lines = content.split("\n")
    const out = lines.map((line) => (this.isChordLine(line) ? this.convertLineToNumbers(line, key, useRoman) : line))
    return out.join("\n")
  }

  convertChartFromNumbers(content: string, key: string, system: "roman" | "arabic"): string {
    const lines = content.split("\n")
    const out = lines.map((line) =>
      system === "roman" ? this.convertLineFromRoman(line, key) : this.convertLineFromArabic(line, key),
    )
    return out.join("\n")
  }

  convertChartToSystem(content: string, key: string, system: "roman" | "arabic" | "default"): string {
    if (system === "roman") return this.convertChartToNumbers(content, key, true)
    if (system === "arabic") return this.convertChartToNumbers(content, key, false)
    // default (ABC): try converting any number tokens back to ABC; prefer roman parsing fallback to arabic
    return content
  }

  isChordLine(line: string): boolean {
    const hasBars = line.includes("|")
    const hasChords = CHORD_RE_NG.test(line) // non-global test to avoid lastIndex side effects
    const ratio = [...line].filter((c) => c === "|" || c === "." || c === "-").length / Math.max(line.length, 1)
    return hasBars && hasChords && ratio > 0.1
  }
}
