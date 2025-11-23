// Core chord utilities: parsing, transposition, and helpers.

export const CHORD_PATTERN = /([A-G][#b]?)((?:maj|dim|aug|sus|add|o|\+|[mM]|[#b]?[0-9]+)*)?(?:\/([A-G][#b]?))?(\([^)]+\))?/g

export const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const
export const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  "E#": 5,
  Fb: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  "B#": 0,
  Cb: 11,
}

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"])
const SHARP_KEYS = new Set(["G", "D", "A", "E", "B", "F#", "C#"])

// Keys list for UI
export function getAllKeys(): string[] {
  return ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]
}

export function detectKeyFromContent(content: string): string | null {
  const m = content.match(/Do\s*=\s*([A-G][#b]?)/)
  return m ? m[1] : null
}

export function noteIndex(note: string): number {
  return NOTE_INDEX[note] ?? 0
}

export function shouldUseFlats(contextKey: string): boolean {
  if (FLAT_KEYS.has(contextKey)) return true
  if (SHARP_KEYS.has(contextKey)) return false
  // For naturals, prefer sharps except F (which trends flat side around Bb)
  return contextKey === "F" ? true : false
}

export function shiftNoteBySemitones(note: string, semitones: number, preferFlats: boolean): string {
  const idx = noteIndex(note)
  const newIdx = (idx + ((semitones % 12) + 12)) % 12
  const sharp = NOTES_SHARP[newIdx]
  const flat = NOTES_FLAT[newIdx]
  if (sharp === flat) return sharp
  return preferFlats ? flat : sharp
}

export function semitoneDistance(fromKey: string, toKey: string): number {
  const a = noteIndex(fromKey)
  const b = noteIndex(toKey)
  return (b - a + 12) % 12
}

// Transpose a single chord token preserving quality and slash
export function transposeChordToken(chord: string, fromKey: string, toKey: string): string {
  const m = chord.match(/^([A-G][#b]?)((?:maj|dim|aug|sus|add|o|\+|[mM]|[#b]?[0-9]+)*)?(?:\/([A-G][#b]?))?(\([^)]+\))?$/)
  if (!m) return chord

  const root = m[1]
  const quality = m[2] ?? ""
  const bass = m[3]
  const annotation = m[4] ?? "" // Capture the annotation

  const preferFlats = shouldUseFlats(toKey)
  const semis = semitoneDistance(fromKey, toKey)
  const newRoot = shiftNoteBySemitones(root, semis, preferFlats)
  const newBass = bass ? shiftNoteBySemitones(bass, semis, preferFlats) : null

  return newRoot + quality + (newBass ? `/${newBass}` : "") + annotation // Append annotation
}

// Strict token regex for a single chord "word"
const CHORD_TOKEN_STRICT = /^([A-G][#b]?)((?:maj|dim|aug|sus|add|o|\+|[mM]|[#b]?[0-9]+)*)?(?:\/([A-G][#b]?))?(\([^)]+\))?$/

export function isChordLine(line: string): boolean {
  const hasBars = line.includes("|")
  if (!hasBars) return false
  // check existence of at least one chord-like token between bars/spaces
  const tokens = line.split(/[\s|]+/).filter(Boolean)
  const hasChordToken = tokens.some((t) => CHORD_TOKEN_STRICT.test(t))
  const symbolRatio = [...line].filter((c) => c === "|" || c === "." || c === "-").length / Math.max(line.length, 1)
  return hasBars && hasChordToken && symbolRatio > 0.1
}

function transposeChordLine(line: string, fromKey: string, toKey: string): string {
  // Split preserving separators (spaces and |)
  const parts = line.split(/(\s+|\|)/)
  return parts
    .map((part) => {
      // keep separators, only transpose strict chord tokens
      if (part === "|" || /^\s+$/.test(part)) return part
      return CHORD_TOKEN_STRICT.test(part) ? transposeChordToken(part, fromKey, toKey) : part
    })
    .join("")
}

// Replace all chord tokens everywhere (safe: uses explicit regex tokens)
export function transposeChart(content: string, fromKey: string, toKey: string): string {
  if (!fromKey || !toKey) return content
  return content
    .split("\n")
    .map((line) => {
      // Replace any inline occurrences of "Do = X" with the new key (case-insensitive)
      const updated = line.replace(/Do\s*=\s*[A-G][#b]?/gi, `Do = ${toKey}`)
      // Only chord lines get token-level transposition
      return isChordLine(updated) ? transposeChordLine(updated, fromKey, toKey) : updated
    })
    .join("\n")
}