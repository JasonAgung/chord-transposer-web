// Turns a MIDI file of block chords into a chord chart.
// Made for Logic Pro: drag the region chords (or the Chord track) onto a MIDI track, then
// File > Export > Selection as MIDI File. Each chord there is a stack of notes starting together.

import { noteIndex, transposeNote } from "./chords"

export interface MidiNote {
  pitch: number
  start: number
  end: number
}

export interface MidiSong {
  ppq: number
  notes: MidiNote[]
  timeSignature: { numerator: number; denominator: number }
  bpm: number | null
  // Sharps (+) or flats (-) in the key signature, or null when the file has none
  keySharps: number | null
}

export interface ChordEvent {
  start: number
  end: number
  name: string
}

// --- Reading the file ---

export function parseMidi(bytes: Uint8Array): MidiSong {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (bytes.length < 14 || text(0) !== "MThd") throw new Error("Not a MIDI file.")
  const division = view.getUint16(12)
  if (division & 0x8000) throw new Error("MIDI files timed in SMPTE frames are not supported.")

  const song: MidiSong = { ppq: division, notes: [], timeSignature: { numerator: 4, denominator: 4 }, bpm: null, keySharps: null }
  let seenTimeSignature = false
  let pos = 8 + view.getUint32(4)

  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos + 4)
    const end = Math.min(pos + 8 + length, bytes.length)
    if (text(pos) === "MTrk") {
      let p = pos + 8
      let tick = 0
      let status = 0
      // Notes still sounding, by pitch (a pitch can be struck again before it is released)
      const open = new Map<number, number[]>()
      const readVarLen = () => {
        let value = 0
        for (;;) {
          const b = bytes[p++]
          value = (value << 7) | (b & 0x7f)
          if (b < 0x80 || p >= end) return value
        }
      }
      while (p < end) {
        tick += readVarLen()
        let b = bytes[p]
        if (b === 0xff) {
          const type = bytes[p + 1]
          p += 2
          const len = readVarLen()
          const data = bytes.subarray(p, p + len)
          p += len
          if (type === 0x51 && len === 3 && song.bpm === null) {
            song.bpm = 60_000_000 / ((data[0] << 16) | (data[1] << 8) | data[2])
          } else if (type === 0x58 && len >= 2 && !seenTimeSignature) {
            song.timeSignature = { numerator: data[0], denominator: 2 ** data[1] }
            seenTimeSignature = true
          } else if (type === 0x59 && len >= 1 && song.keySharps === null) {
            song.keySharps = (data[0] << 24) >> 24
          }
          continue
        }
        if (b === 0xf0 || b === 0xf7) {
          p++
          p += readVarLen()
          continue
        }
        if (b & 0x80) {
          status = b
          p++
        }
        const kind = status & 0xf0
        const d1 = bytes[p]
        const d2 = bytes[p + 1]
        p += kind === 0xc0 || kind === 0xd0 ? 1 : 2
        if (kind === 0x90 && d2 > 0) {
          open.set(d1, [...(open.get(d1) ?? []), tick])
        } else if (kind === 0x80 || kind === 0x90) {
          const starts = open.get(d1)
          const start = starts?.shift()
          if (start !== undefined) song.notes.push({ pitch: d1, start, end: tick })
        }
      }
      open.forEach((starts, pitch) => starts.forEach((start) => song.notes.push({ pitch, start, end: tick })))
    }
    pos = end
  }
  song.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch)
  return song
}

// --- Naming chords ---

// Intervals above the root -> chord quality, written the way lib/chords.ts parses them
const CHORD_TYPES: Record<string, string> = {
  "0,4,7": "",
  "0,3,7": "m",
  "0,3,6": "dim",
  "0,4,8": "aug",
  "0,5,7": "sus4",
  "0,2,7": "sus2",
  "0,7": "5",
  "0,4,7,10": "7",
  "0,4,7,11": "maj7",
  "0,3,7,10": "m7",
  "0,3,6,10": "m7b5",
  "0,3,6,9": "dim7",
  "0,3,7,11": "m(maj7)",
  "0,5,7,10": "7sus4",
  "0,2,7,10": "7sus2",
  "0,4,7,9": "6",
  "0,3,7,9": "m6",
  "0,2,4,7": "add9",
  "0,2,3,7": "m(add9)",
  "0,4,8,10": "7#5",
  "0,4,6,10": "7b5",
  "0,4,8,11": "maj7#5",
  "0,2,4,7,10": "9",
  "0,2,4,7,11": "maj9",
  "0,2,3,7,10": "m9",
  "0,2,4,7,9": "6/9",
  "0,1,4,7,10": "7b9",
  "0,3,4,7,10": "7#9",
  "0,2,5,7,10": "9sus4",
  "0,4,7,8,10": "7b13",
}

// How a note sits in C major, used to spell any note by its role in the key:
// borrowed chords take the common spelling (bIII, #IV, bVI, bVII)
const SPELLING_IN_C = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

function quality(pitchClasses: number[], root: number): string | undefined {
  const intervals = [...new Set(pitchClasses.map((pc) => (pc - root + 12) % 12))].sort((a, b) => a - b)
  return CHORD_TYPES[intervals.join(",")]
}

// "Bb" in F, "A#" in B: the note's role in the key decides the spelling
export function spellNote(pitchClass: number, key: string): string {
  return transposeNote(SPELLING_IN_C[(pitchClass - noteIndex(key) + 12) % 12], "C", key)
}

// Names a stack of MIDI pitches, e.g. [46, 58, 62, 65, 69] in F -> "Bbmaj7"; null if it isn't a known chord
export function nameChord(pitches: number[], key: string): string | null {
  if (pitches.length === 0) return null
  const sorted = [...pitches].sort((a, b) => a - b)
  const bass = sorted[0] % 12
  const all = [...new Set(sorted.map((p) => p % 12))]
  const upper = [...new Set(sorted.slice(1).map((p) => p % 12))].filter((pc) => pc !== bass)
  const withFifth = (root: number) => [...all, (root + 7) % 12]

  const name = (root: number, q: string) => {
    const rootName = spellNote(root, key)
    if (root === bass) return rootName + q
    // Spell the bass by its interval above the root: the 3rd of D is F#, not Gb
    return `${rootName}${q}/${transposeNote(SPELLING_IN_C[(bass - root + 12) % 12], "C", rootName)}`
  }

  // 1. The bass is the root
  let q = quality(all, bass)
  if (q !== undefined) return name(bass, q)
  // 2. A chord over a separate bass note: C/D rather than D9sus4
  for (const root of upper) {
    q = quality(upper, root)
    if (q !== undefined && upper.length >= 3) return name(root, q)
  }
  // 3. The bass is the root of a chord played without its fifth
  q = quality(withFifth(bass), bass)
  if (q !== undefined) return name(bass, q)
  // 4. An inversion (F/A, C/E)
  for (const root of all) {
    q = quality(all, root) ?? quality(withFifth(root), root)
    if (q !== undefined) return name(root, q)
  }
  return null
}

// --- Finding the key ---

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

// The major key ("Do") whose scale fits the chords best, weighted by how long each chord lasts
export function detectKey(chords: { pitches: number[]; duration: number }[]): string {
  let best = 0
  let bestScore = -Infinity
  for (let key = 0; key < 12; key++) {
    let score = 0
    for (const { pitches, duration } of chords) {
      const pcs = [...new Set(pitches.map((p) => p % 12))]
      for (const pc of pcs) score += MAJOR_SCALE.includes((pc - key + 12) % 12) ? duration : -duration
      // Chords on the home note (I) or its relative minor (vi) point at the key
      const bass = Math.min(...pitches) % 12
      if (bass === key || bass === (key + 9) % 12) score += duration
    }
    if (score > bestScore) {
      bestScore = score
      best = key
    }
  }
  return KEY_NAMES[best]
}

function keyFromSignature(sharps: number): string {
  const circle = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"]
  return circle[sharps + 7] ?? "C"
}

// --- Building the chart ---

// Notes starting this close together (in quarter notes) are one chord
const SAME_CHORD = 1 / 16
// A chord this far past a beat (in beats) belongs to the next beat. Up to UP_END it is a push,
// played on the "and" before that beat, and is marked "(up)": A7 at beat 2½ -> | Bbmaj7 . A7(up) . |
// Later than that it is just played a little early.
const PUSH = 0.4
const UP_END = 0.8

export interface ChartOptions {
  title: string
  // "Do" of the chart; detected from the chords when left out
  key?: string
}

export function midiToChart(bytes: Uint8Array, options: ChartOptions): string {
  const song = parseMidi(bytes)
  const { numerator, denominator } = song.timeSignature
  const beat = (song.ppq * 4) / denominator

  // Group notes that start together into chords
  const groups: { start: number; end: number; pitches: number[] }[] = []
  for (const note of song.notes) {
    const last = groups[groups.length - 1]
    if (last && note.start - last.start <= song.ppq * SAME_CHORD) {
      last.pitches.push(note.pitch)
      last.end = Math.max(last.end, note.end)
    } else {
      groups.push({ start: note.start, end: note.end, pitches: [note.pitch] })
    }
  }
  if (groups.length === 0) throw new Error("This MIDI file has no notes. Put the chords on a MIDI track in Logic, then export that region.")

  // Logic writes C major when no key is set, so only trust a signature that has sharps or flats
  const key =
    options.key ??
    (song.keySharps ? keyFromSignature(song.keySharps) : detectKey(groups.map((g) => ({ pitches: g.pitches, duration: g.end - g.start }))))

  // Place each chord on a beat; a later chord on the same beat wins
  const slots = new Map<number, { name: string; up: boolean }>()
  const toSlot = (tick: number) => Math.floor(tick / beat + 1 - PUSH)
  groups.forEach((group, i) => {
    const name = nameChord(group.pitches, key) ?? `${spellNote(Math.min(...group.pitches) % 12, key)}(?)`
    const offBeat = (group.start / beat) % 1
    const slot = toSlot(group.start)
    if (slots.has(slot) && !slots.has(slot - 1) && i > 0) slots.set(slot - 1, slots.get(slot)!)
    slots.set(slot, { name, up: offBeat >= PUSH && offBeat < UP_END })
    // Silence before the next chord
    const next = groups[i + 1]
    const endSlot = toSlot(group.end)
    if (next && next.start - group.end >= beat && endSlot < toSlot(next.start)) slots.set(endSlot, { name: "N.C.", up: false })
  })

  const ordered = [...slots.keys()].sort((a, b) => a - b)
  const firstBar = Math.floor(ordered[0] / numerator)
  const lastBar = Math.floor(ordered[ordered.length - 1] / numerator)
  const bars: string[] = []
  let current = ""
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const beats: string[] = []
    for (let b = 0; b < numerator; b++) {
      const chord = slots.get(bar * numerator + b)
      if (chord) current = chord.name
      // Write the sounding chord at the start of every bar so each bar reads on its own
      if (chord) beats.push(chord.up ? `${chord.name}(up)` : chord.name)
      else beats.push(b === 0 && current ? current : ".")
    }
    bars.push(beats.join(" "))
  }

  const lines = [options.title, `Do = ${key}`, `Time Signature = ${numerator}/${denominator}`]
  if (song.bpm) lines.push(`Tempo (1/4) = ${Math.round(song.bpm)} BPM`)
  lines.push("")
  for (let i = 0; i < bars.length; i += 4) lines.push(`| ${bars.slice(i, i + 4).join(" | ")} |`)
  return lines.join("\n")
}

