// Finds mistakes in a chart as it is typed: chords the app can't read, bars with too many beats,
// a missing "Do =" line. The editor underlines them; positions are character offsets in the chart.

import { parseChord, TOKEN_RE } from "./chords"

export interface ChartProblem {
  from: number
  to: number
  severity: "error" | "warning"
  message: string
}

// Tokens that fill a bar besides chords
const BEAT_RE = /^(?:[.\/~\-–—]+|%|N\.?C\.?)$/i
// Roman or Arabic numbers, for charts typed that way
const NUMERAL_RE = /^[b#♭♯]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i|[1-7])/

// A likely meant chord for a common spelling the app doesn't read: Cmi7 -> Cm7, Fma7 -> Fmaj7, C-7 -> Cm7
export function suggestChord(token: string): string | null {
  const m = token.match(/^([a-gA-G])([#b♯♭]?)(.*)$/)
  if (!m) return null
  const root = m[1].toUpperCase() + m[2]
  const rest = m[3]
    .replace(/^(?:mi|-)(?!n)/, "m")
    .replace(/^ma(?=\d)/, "maj")
    .replace(/^Maj/, "maj")
    .replace(/^(?:Δ|△)$/, "maj7")
  const guess = root + rest
  return guess !== token && parseChord(guess) ? guess : null
}

const isBarLine = (line: string) => {
  const t = line.trim()
  return t.startsWith("|") ? t.indexOf("|", 1) > 0 : /^[^|]*:\s*\|/.test(t)
}

export function lintChart(content: string): ChartProblem[] {
  const problems: ChartProblem[] = []
  const lines = content.split("\n")
  const beats = parseInt(content.match(/Time\s*Signature\s*=\s*(\d+)/i)?.[1] ?? "", 10) || 4

  if (content.trim() && !/^\s*Do\s*=\s*[A-G]/im.test(content)) {
    problems.push({
      from: 0,
      to: lines[0].length,
      severity: "warning",
      message: 'No "Do = …" line, so the chart can\'t be transposed. Add one like "Do = C".',
    })
  }

  let offset = 0
  for (const line of lines) {
    if (isBarLine(line)) {
      // Each bar between two bar lines; text before the first and after the last is a label or "x2"
      const first = line.indexOf("|")
      const last = line.lastIndexOf("|")
      let barStart = first + 1
      for (let i = barStart; i <= last; i++) {
        if (line[i] !== "|") continue
        const bar = line.slice(barStart, i)
        const tokens = [...bar.matchAll(TOKEN_RE)]
        for (const t of tokens) {
          const token = t[0]
          // A note on its own, like "(soft)", is fine too
          if (parseChord(token) || BEAT_RE.test(token) || NUMERAL_RE.test(token) || /^\(.*\)$/.test(token)) continue
          const suggestion = suggestChord(token)
          problems.push({
            from: offset + barStart + t.index!,
            to: offset + barStart + t.index! + token.length,
            severity: "error",
            message: suggestion ? `"${token}" isn't a chord the app reads. Did you mean ${suggestion}?` : `"${token}" isn't a chord the app reads.`,
          })
        }
        // Dots count the beats, so a bar written with dots should have one token per beat
        const usesDots = tokens.some((t) => /^[.\/]+$/.test(t[0]))
        if (tokens.length > beats || (usesDots && tokens.length !== beats)) {
          problems.push({
            from: offset + barStart + (tokens[0]?.index ?? 0),
            to: offset + i,
            severity: "warning",
            message: `This bar has ${tokens.length} beats; ${beats}/${content.match(/Time\s*Signature\s*=\s*\d+\s*\/\s*(\d+)/i)?.[1] ?? "4"} has ${beats}.`,
          })
        }
        barStart = i + 1
      }
    }
    offset += line.length + 1
  }
  return problems
}
