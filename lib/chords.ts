// Core chord utilities: parsing, transposition, and helpers.
// Every feature (transpose, Smart Format, number notation, PDF) reads chords through parseChord and
// isChordLine below, so they all agree on what is a chord.

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

const LETTERS = "CDEFGAB"
// Semitones above the key note for each degree of the major scale
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
// Correct on paper but hard to read; when a spelling lands on one of these, fall back to the plain sharp/flat
const AWKWARD_NOTES = new Set(["E#", "B#", "Fb", "Cb"])

const ACCIDENTAL = "[#b♯♭]"
// Everything between the root and the bass: m7b5, maj9, sus4, 6/9, °7, ø7, Δ7, 7(b9), m(maj7), (up)...
const QUALITY = `(?:maj|min|dim|aug|sus|add|alt|M|m|o|°|ø|Δ|\\+|${ACCIDENTAL}?\\d+(?:\\/\\d+)?|\\([^)]*\\))*`
const CHORD_RE = new RegExp(`^([A-G]${ACCIDENTAL}?)(${QUALITY})(?:\\/([A-G]${ACCIDENTAL}?))?(\\([^)]*\\))?$`)
// Non-chord tokens that belong on a chord line: beat dots, slashes, repeat signs, "x2", "N.C.", "(note)"
const FILLER_RE = /^(?:[.\/%~:\-–—]+|x\d+|\d+x|N\.?C\.?|\(.*\))$/i
// One "word" of a chord line. A note in parentheses may contain spaces: "F(up high)" is one token.
export const TOKEN_RE = /(?:\([^)\n]*\)|[^\s|])+/g

export interface ParsedChord {
  root: string
  quality: string
  bass: string | null
  annotation: string
}

// Keys list for UI
export function getAllKeys(): string[] {
  return ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]
}

// "B♭" -> "Bb", "F♯" -> "F#"
export function normalizeNote(note: string): string {
  return note.replace("♭", "b").replace("♯", "#")
}

export function detectKeyFromContent(content: string): string | null {
  const m = content.match(/Do\s*=\s*([A-G][#b♯♭]?)/)
  return m ? normalizeNote(m[1]) : null
}

export function noteIndex(note: string): number {
  return NOTE_INDEX[normalizeNote(note)] ?? 0
}

export function shouldUseFlats(contextKey: string): boolean {
  const key = normalizeNote(contextKey)
  if (FLAT_KEYS.has(key)) return true
  if (SHARP_KEYS.has(key)) return false
  // For naturals, prefer sharps except F (which trends flat side around Bb)
  return key === "F"
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

// Signed semitone difference in the range -6..5
function signedDiff(a: number, b: number): number {
  const d = (((a - b) % 12) + 12) % 12
  return d > 5 ? d - 12 : d
}

// The note's place in the key, read from its letter: in C, Ab is { steps: 5, alter: -1 } (flat 6),
// while G# is { steps: 4, alter: 1 } (sharp 5)
export function scaleDegree(note: string, key: string): { steps: number; alter: number } {
  const n = normalizeNote(note)
  const k = normalizeNote(key)
  const steps = (LETTERS.indexOf(n[0]) - LETTERS.indexOf(k[0]) + 7) % 7
  const alter = signedDiff(noteIndex(n), noteIndex(k) + MAJOR_SCALE[steps])
  return { steps, alter }
}

// Moves a note to the new key keeping its role, so the flat 6 of C (Ab) becomes the flat 6 of D (Bb), not A#
export function transposeNote(note: string, fromKey: string, toKey: string): string {
  const { steps, alter } = scaleDegree(note, fromKey)
  const to = normalizeNote(toKey)
  const letter = LETTERS[(LETTERS.indexOf(to[0]) + steps) % 7]
  const pitch = noteIndex(to) + MAJOR_SCALE[steps] + alter
  const accidental = signedDiff(pitch, NOTE_INDEX[letter])
  let out = accidental === 0 ? letter : accidental === 1 ? `${letter}#` : accidental === -1 ? `${letter}b` : null
  if (!out || AWKWARD_NOTES.has(out)) {
    out = shiftNoteBySemitones(note, semitoneDistance(fromKey, toKey), shouldUseFlats(toKey))
  }
  // Keep the writer's style: B♭ in, E♭ out
  if (/[♯♭]/.test(note) && out.length > 1) out = out[0] + (out[1] === "#" ? "♯" : "♭")
  return out
}

export function parseChord(token: string): ParsedChord | null {
  const m = token.match(CHORD_RE)
  if (!m) return null
  return { root: m[1], quality: m[2] ?? "", bass: m[3] ?? null, annotation: m[4] ?? "" }
}

// Rewrites each chord on a line, leaving bars, dots, spacing and other text exactly as they were
export function mapChordTokens(line: string, fn: (chord: ParsedChord) => string): string {
  return line.replace(TOKEN_RE, (token) => {
    const chord = parseChord(token)
    return chord ? fn(chord) : token
  })
}

// Transpose a single chord token preserving quality, slash bass and any note in parentheses
export function transposeChordToken(chord: string, fromKey: string, toKey: string): string {
  const parsed = parseChord(chord)
  if (!parsed) return chord
  const { root, quality, bass, annotation } = parsed
  const newBass = bass ? `/${transposeNote(bass, fromKey, toKey)}` : ""
  return transposeNote(root, fromKey, toKey) + quality + newBass + annotation
}

// A chord line has bars, at least one chord, and is mostly chords and beat marks (not lyrics)
export function isChordLine(line: string): boolean {
  if (!line.includes("|")) return false
  const tokens = line.match(TOKEN_RE) ?? []
  const chords = tokens.filter((t) => parseChord(t)).length
  const fillers = tokens.filter((t) => FILLER_RE.test(t)).length
  return chords > 0 && (chords + fillers) * 2 >= tokens.length
}

// Replace all chord tokens on chord lines, and the "Do = X" key line
export function transposeChart(content: string, fromKey: string, toKey: string): string {
  if (!fromKey || !toKey) return content
  return content
    .split("\n")
    .map((line) => {
      // Replace any inline occurrences of "Do = X" with the new key (case-insensitive)
      const updated = line.replace(/Do\s*=\s*[A-G][#b♯♭]?/gi, `Do = ${toKey}`)
      // Only chord lines get token-level transposition
      return isChordLine(updated) ? updated.replace(TOKEN_RE, (token) => transposeChordToken(token, fromKey, toKey)) : updated
    })
    .join("\n")
}
