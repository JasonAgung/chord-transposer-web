# Chord Transposer

Next.js 15 + TypeScript web app that transposes chord charts, converts them to Roman/Arabic numbers, and exports PDFs. Everything runs in the browser; there is no backend.

## Commands

- `pnpm dev` — dev server on http://localhost:3000
- `pnpm test` — Jest (ts-jest), tests live next to the code as `lib/*.test.ts`; React components can be tested as `components/*.test.tsx` with `renderToStaticMarkup` (jest.config.js maps `@/` and compiles JSX)
- `npx tsc --noEmit` — type-check. Run it yourself: `next.config.mjs` sets `ignoreBuildErrors`, so `next build` will not catch type errors.

Use **pnpm**, not npm: `node_modules` is pnpm-managed and `pnpm-lock.yaml` is the tracked lockfile (`package-lock.json` is gitignored).

- Vercel installs with pnpm 10, so change dependencies with `npx pnpm@10 add <pkg>@<version> --lockfile-only`, then `pnpm install`. Stop `pnpm dev` first: reinstalling under a running dev server breaks it (`Can't resolve 'next-flight-client-entry-loader'`; restart and delete `.next`).
- The local pnpm refuses packages published less than a day ago (supply-chain policy). `overrides` in `pnpm-workspace.yaml` pins `style-mod` (a CodeMirror dependency) for that reason; drop it once a newer version is old enough. Keep pnpm settings in `pnpm-workspace.yaml`, not in package.json's `"pnpm"` field: the local pnpm (12) ignores that field and rewrites the lockfile without it, and then Vercel's frozen install fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.
- Before pushing a dependency change, check it the way Vercel installs: copy `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` to an empty folder and run `npx pnpm@10.28.0 install --frozen-lockfile --lockfile-only --ignore-scripts`.

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
- `lib/formatter.ts` — Smart Format: lines up bars and each beat within them across a run of chord lines, with spaces. Keeps text before the first bar (`Intro :`) and after the last (`x2`). No longer a button: the grid PDF and the preview ignore spacing, so it is only used inside the classic PDF (Courier export and split lines).
- PDF export has two styles, picked with `createPdf(content, { style })` in `lib/pdf.ts`. Both are used by the main Export PDF button (always `grid`) and by Advanced Export / `components/pdf-preview.tsx` (user's choice, default `grid`). Fonts load through `lib/fonts.ts`.
- `lib/pdf-grid.ts` — the **grid** style (default). Parses the chart into sections, rows and bars (`parseSong`), then draws each bar as a fixed-width cell with every chord placed at its beat, so it lines up in any font and the spacing in the text doesn't matter.
  - 4 bars per row; a line of 8 bars wraps, a 1-bar line is one cell. Sections: `Chorus : Loss, Build Up` shows the note next to the label. `| . . . . |` (no chords) shows rest slashes. A blank line inside a section is a phrase break; the double bar marks the section's end. `x2` after the last bar goes in a right-hand gutter.
  - Chords are typeset by `chordSegments`: ♭/♯ symbols, raised extension, `(up)`-style notes stacked under the extension. Roman/Arabic output is typeset the same way (`57` → 5 with a raised 7).
  - Dots mark empty beats in bars with more than one chord, or one chord off beat 1, and are **never dropped**: they say how long a chord lasts. `placeInBar` keeps room for them, they pack closer when a bar is tight, and only then do all the bar's chords shrink equally (down to 35%, rather than overlap). Crowded chords keep their size and move apart when there is room. The preview (`Bar` in chart-preview.tsx) follows the same rule; tests count the dots in every time signature and notation.
  - A section is kept on one page when it fits; the whole chart shrinks (to 78% at most) only when that saves a page.
  - Text is Helvetica; anything Helvetica can't draw (♭ ♯ ♩, non-Latin) comes from DejaVu, which is always embedded.
- `lib/pdf.ts` — the **classic** style: prints the chart text as written, two columns per page.
  - Built-in Helvetica/Courier by default. If the chart has characters they can't draw (♭, ♯, non-Latin), it loads DejaVu fonts from `public/fonts/` via `@pdf-lib/fontkit`. Characters no font has become `?`.
  - Two columns per page. A section that would split moves to the next column, but only when the current column is more than half full.
  - Measure text with `textWidth`, never `font.widthOfTextAtSize`: pdf-lib measures with kerning but draws without it, so its widths run short and the next piece of text lands on the previous one.
  - The font picker applies to every line. In Courier the chart is run through Smart Format before drawing (the chart text itself is not changed), and a note like `(up)` keeps its full width, so bars line up; in Helvetica nothing lines up and the text after a note follows it directly.
  - Chord lines too wide for the column are shrunk (to 75% at most), then split evenly (4 bars → 2+2). In Courier the split lines are re-aligned so their bar lines stay under each other.
- `lib/midi-import.ts` — "Import MIDI" button: turns a MIDI file of block chords into a chart (names chords from the notes, guesses `Do =` from the chords, writes eighth-note pushes on the next beat as `A7(up)`, the chart convention for a chord played on the "and" before that beat). For Logic Pro, the chords must first be turned into a MIDI region of block chords on a software-instrument track, then exported with File → Export → Selection as MIDI File; copying chords as text, or exporting the audio track's MIDI, gives positions without names.
- `lib/store.ts` — Zustand store. `original`, `orientation` and `numbersStyle` are saved in localStorage (`persist`, `skipHydration`); each page calls `useStore.persist.rehydrate()` in its **first** effect, because a store write before that saves the default chart over the saved one.
- `components/chart-editor.tsx` — the chart editor (CodeMirror 6): colours from `lineMarks`, problems from `lib/chart-lint.ts` underlined. Loaded with `next/dynamic` (`ssr: false`). Changes pushed in from outside (a template, Open .txt, Import MIDI) are annotated so they aren't reported back as typing.
- `lib/chart-lint.ts` — finds chords the parser can't read (with a suggestion: `Cmi7` → `Cm7`), bars with the wrong number of beats, and a missing `Do =` line.
- `components/chart-preview.tsx` — live HTML preview in the grid style, from the same `parseSong` / `chordSegments` as the PDF. One CSS grid for the whole song; crowded bars get a smaller font; the bars zoom out to fit a narrow box.
- `components/chord-transposer.tsx` — main page. A toolbar (key with −/+ semitone, notation, Export PDF, PDF options), then the Chart panel (editor, New/File menus, Guide) and the Sheet panel (Preview / Text tabs). The sheet is **live**: an effect re-renders `transposed` whenever the chart, key or notation changes (there is no Transpose button); `transposed` stays empty while the sheet is the chart as written. `app/advanced-export/page.tsx` is "PDF options".
- Look: a cool grey "desk" background, white panels, one ink-blue accent (`--primary`, also chord colour and focus). The preview is drawn as white paper with dark ink in both themes (`.paper` in `app/globals.css`), in the PDF's typeface.
- `components/ui/` — generated shadcn/ui components; don't hand-edit.
- `chord_transpose_gui_smart_format.py` — older Python desktop version, not used by the web app.

## Testing PDFs

To see a PDF without the browser, render it with `createChartPdf` and make an image with `qlmanage -t -s 1400 -o <dir> file.pdf` (macOS Quick Look).
