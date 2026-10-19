# Chord Transposer

Next.js 15 + TypeScript web app that transposes chord charts, converts them to Roman/Arabic numbers, aligns bars ("Smart Format") and exports PDFs. Everything runs in the browser; there is no backend.

## Commands

- `pnpm dev` — dev server on http://localhost:3000
- `pnpm test` — Jest (ts-jest), tests live next to the code as `lib/*.test.ts`
- `npx tsc --noEmit` — type-check. Run it yourself: `next.config.mjs` sets `ignoreBuildErrors`, so `next build` will not catch type errors.

Use **pnpm**, not npm: `node_modules` is pnpm-managed and `pnpm-lock.yaml` is the tracked lockfile (`package-lock.json` is gitignored).

## Chart format

The app's input conventions, which the parser relies on:

- The key comes from a line like `Do = C` (`Do = B♭` also works). Without it nothing transposes.
- Chord lines use bars: `| C . . . | Am . . . |`. Dots are beats.
- Notes go in parentheses right after a chord: `F(up)`, `C(Bass only)`. They are never transposed, and the PDF draws them as a subscript.
- Line 1 is the title. A line like `Verse :` is a section header.

## Code map

- `lib/chords.ts` — the **only** chord parser. `parseChord`, `isChordLine`, `TOKEN_RE` and `mapChordTokens` are shared by transpose, Smart Format, number notation and PDF. Change chord recognition here, never with a local regex.
  - `transposeNote` spells by scale role (flat 6 of C = Ab → flat 6 of D = Bb), and falls back to plain sharp/flat for E#/B#/Fb/Cb.
- `lib/render.ts` — output panel pipeline: transpose to the target key, *then* convert notation. Same key = no transposition (keeps original spelling).
- `lib/numbered.ts` — Roman/Arabic conversion. Upper-case Roman = major, lower-case = minor/diminished.
- `lib/formatter.ts` — Smart Format (bar alignment).
- `lib/pdf.ts` — the single PDF renderer (pdf-lib), used by both the main Export PDF button and `components/pdf-preview.tsx`.
  - Built-in Helvetica/Courier by default. If the chart has characters they can't draw (♭, ♯, non-Latin), it loads DejaVu fonts from `public/fonts/` via `@pdf-lib/fontkit`. Characters no font has become `?`.
  - Two columns per page. A section that would split moves to the next column. Long chord lines wrap evenly between bars.
  - The font picker applies to every line. Only Courier keeps Smart Format's bars aligned.
- `lib/midi-import.ts` — "Import MIDI" button: turns a MIDI file of block chords into a chart (names chords from the notes, guesses `Do =` from the chords, writes eighth-note pushes on the next beat as `A7(up)`, the chart convention for a chord played on the "and" before that beat). For Logic Pro, the chords must first be turned into a MIDI region of block chords on a software-instrument track, then exported with File → Export → Selection as MIDI File; copying chords as text, or exporting the audio track's MIDI, gives positions without names.
- `lib/store.ts` — Zustand store (not persisted).
- `components/chord-transposer.tsx` — main page UI. `app/advanced-export/page.tsx` — PDF settings + preview.
- `components/ui/` — generated shadcn/ui components; don't hand-edit.
- `chord_transpose_gui_smart_format.py` — older Python desktop version, not used by the web app.

## Testing PDFs

To see a PDF without the browser, render it with `createChartPdf` and make an image with `qlmanage -t -s 1400 -o <dir> file.pdf` (macOS Quick Look).
