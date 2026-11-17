"use client"

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ChevronDown, Minus, Plus } from "lucide-react"
import { detectKeyFromContent, getAllKeys, noteIndex } from "@/lib/chords"
import { renderChart, NotationStyle } from "@/lib/render"
import { createPdf, downloadPdf, pdfFileName } from "@/lib/pdf"
import { lintChart } from "@/lib/chart-lint"
import { midiToChart } from "@/lib/midi-import"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ChartPreview from "@/components/chart-preview"
import { ModeToggle } from "@/components/theme-toggle"

// CodeMirror only runs in the browser; loading it separately keeps the first page load light
const ChartEditor = dynamic(() => import("@/components/chart-editor"), {
  ssr: false,
  loading: () => <div className="min-h-[380px]" />,
})

const KEYS = getAllKeys()
// The usual name of each key, for the semitone buttons: Db rather than C#, F# rather than Gb
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

const NOTATIONS: { value: NotationStyle; label: string; hint: string }[] = [
  { value: "default", label: "Chords", hint: "Chord names: C, Am, F" },
  { value: "roman", label: "Roman", hint: "Roman numerals: I, vi, IV" },
  { value: "arabic", label: "Numbers", hint: "Numbers: 1, 6m, 4" },
]

const TEMPLATE_34 = `[Song Number]. [Song Title] ([Source/Book Reference])
Do = C
Time Signature = 3/4
Tempo (1/4) = 85 BPM
Structure = Verse, Chorus

Intro :
| C . . | F . . | G . . | C . . |

Verse :
| C . . | Am . . | F . . | G . . |
| C . . | Am . . | F . . | G . . |

Chorus :
| F . . | G . . | C . . | C . . |
| F . . | G . . | C . . | C . . |`

const TEMPLATE_68 = `[Song Number]. [Song Title] ([Source/Book Reference])
Do = C
Time Signature = 6/8
Tempo (1/8) = 150 BPM
Structure = Intro, Verse, Chorus

Intro :
| C . . . . . | F . . . . . | G . . . . . | C . . . . . |

Verse :
| C . . Am . . | F . . G . . | C . . Am . . | F . . G . . |
| C . . Am . . | F . . G . . | F . . G . . | C . . . . . |

Chorus :
| F . . . . . | G . . . . . | Em . . Am . . | Dm . . G . . |
| F . . . . . | G . . . . . | F . . G . . | C . . . . . |`

const TEMPLATE_44 = `[Song Number]. [Song Title] ([Source/Book Reference])
Do = C
Time Signature = 4/4
Tempo (1/4) = 100 BPM
Structure = Intro, Verse, Chorus

Intro :
| C . . . | F . . . | G . . . | C . . . |
| C . . . | F . . . | G . . . | C . . . |

Verse :
| C . . . | Am . . . | F . . . | G . . . |
| C . . . | Am . . . | F . . . | G . . . |

Chorus :
| F . . . | G . . . | C . . . | C . . . |
| F . . . | G . . . | C . . . | C . . . |`

export default function ChordTransposer() {
  const {
    original,
    transposed,
    currentKey,
    targetKey,
    title,
    orientation,
    numbersStyle,
    timeSignature,
    setOriginal,
    setTransposed,
    setCurrentKey,
    setTargetKey,
    setTitle,
    setNumbersStyle,
    setTimeSignature,
  } = useStore()

  // Load the chart saved in this browser (see lib/store.ts). This must be the first effect: the ones
  // below write to the store, and a write before loading would save the default chart over the saved one.
  useEffect(() => {
    useStore.persist.rehydrate()
  }, [])

  // The chart's own key and time signature; a new key also becomes the key to play in
  useEffect(() => {
    const k = detectKeyFromContent(original)
    if (k && k !== currentKey) {
      setCurrentKey(k)
      setTargetKey(k)
    }
    const sig = original.match(/Time\s*Signature\s*=\s*(\d+\/\d+)/i)?.[1]
    if (sig) {
      const next = sig === "3/4" || sig === "6/8" ? sig : "4/4"
      if (next !== timeSignature) setTimeSignature(next)
    }
  }, [original, currentKey, timeSignature, setCurrentKey, setTargetKey, setTimeSignature])

  // The first line is the title, used for the PDF and .txt file names
  useEffect(() => {
    setTitle(original.split("\n")[0])
  }, [original, setTitle])

  // The sheet follows the chart, the key and the notation as they change. "transposed" stays empty while
  // the sheet is the chart as written, so the original spelling is kept.
  const chartKey = detectKeyFromContent(original)
  useEffect(() => {
    const to = targetKey || chartKey
    if (!chartKey || !to || (to === chartKey && numbersStyle === "default")) setTransposed("")
    else setTransposed(renderChart(original, to, numbersStyle) ?? "")
  }, [original, chartKey, targetKey, numbersStyle, setTransposed])

  const sheet = transposed || original
  const playKey = targetKey || chartKey || ""

  const problems = useMemo(() => {
    return lintChart(original).map((p) => ({ ...p, line: original.slice(0, p.from).split("\n").length }))
  }, [original])

  // Up or down a semitone from the key shown
  const stepKey = (semitones: number) => {
    if (!playKey) return
    setTargetKey(KEY_NAMES[(((noteIndex(playKey) + semitones) % 12) + 12) % 12])
  }

  const [error, setError] = useState<string | null>(null)
  // The first export loads the PDF fonts and can take a moment; the button says so and can't be pressed twice
  const [exporting, setExporting] = useState(false)
  // A moved chart says its key in the file name, so a folder of PDFs doesn't hold two copies with the same name
  const fileTitle = chartKey && playKey !== chartKey ? `${title} in ${playKey}` : title

  const handleExportPDF = async () => {
    if (!sheet.trim() || exporting) return
    setError(null)
    setExporting(true)
    try {
      downloadPdf(await createPdf(sheet, { style: "grid", orientation }), fileTitle)
    } catch (err) {
      console.error(err)
      setError("Couldn't create the PDF. Check the chart for unusual characters and try again.")
    } finally {
      setExporting(false)
    }
  }

  // "Copy text" says "Copied" for a moment, so you know it worked
  const [copied, setCopied] = useState(false)
  const copyText = async () => {
    await navigator.clipboard.writeText(sheet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Replacing the chart asks first, unless the chart is empty or still an untouched template
  const untouched = [TEMPLATE_34, TEMPLATE_44, TEMPLATE_68, useStore.getInitialState().original].includes(original)
  const confirmReplace = (what: string) => !original.trim() || untouched || window.confirm(`Replace the current chart with ${what}?`)

  const newChart = (chart: string, what: string, signature?: "3/4" | "4/4" | "6/8") => {
    if (!confirmReplace(what)) return
    setError(null)
    setOriginal(chart)
    if (signature) setTimeSignature(signature)
  }

  const openTxtInput = useRef<HTMLInputElement>(null)
  const midiInput = useRef<HTMLInputElement>(null)

  const handleOpenTxt = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError(null)
    try {
      const text = (await file.text()).replace(/\r\n/g, "\n")
      if (confirmReplace(file.name)) setOriginal(text)
    } catch (err) {
      console.error(err)
      setError(`Couldn't read ${file.name}.`)
    }
  }

  // A MIDI file of block chords, e.g. Logic Pro region chords exported with File > Export > Selection as MIDI File
  const handleImportMidi = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setError(null)
    try {
      const chart = midiToChart(new Uint8Array(await file.arrayBuffer()), { title: file.name.replace(/\.midi?$/i, "") })
      if (confirmReplace(file.name)) setOriginal(chart)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : `Couldn't read ${file.name}.`)
    }
  }

  const handleSaveTxt = () => {
    const url = URL.createObjectURL(new Blob([original], { type: "text/plain;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = pdfFileName(title).replace(/\.pdf$/, ".txt")
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const notation = NOTATIONS.find((n) => n.value === numbersStyle) ?? NOTATIONS[0]
  const sheetCaption = !chartKey
    ? "Add a line like \u201cDo = C\u201d to the chart to change its key."
    : playKey === chartKey
      ? numbersStyle === "default"
        ? `In ${chartKey}, as written.`
        : `In ${chartKey}, as ${notation.label.toLowerCase()}.`
      : `In ${playKey}, moved from ${chartKey}${numbersStyle === "default" ? "" : `, as ${notation.label.toLowerCase()}`}.`

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Chord Chart Maker &amp; Transposer</h1>
          <p className="mt-1 text-sm text-muted-foreground">From an MD to fellow MDs (i love MD(s))</p>
        </div>
        <ModeToggle />
      </header>

      {/* What you play and how you hand it out: key, notation, export. It stays in view while you scroll on
          wide screens; on a phone it wraps to three lines, too tall to keep on screen. */}
      <div className="-mx-4 border-y bg-card px-4 py-3 md:sticky md:top-2 md:z-20 md:mx-0 md:rounded-xl md:border">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2" role="group" aria-label="Key">
            <span className="text-sm text-muted-foreground">Key</span>
            {chartKey ? (
              <>
                <span className="text-sm font-medium tabular-nums" title="The key the chart is written in">
                  {chartKey}
                </span>
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
                <Select value={playKey} onValueChange={setTargetKey}>
                  <SelectTrigger className="h-9 w-[4.75rem]" aria-label="Key to play in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex">
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" className="size-9 rounded-r-none" onClick={() => stepKey(-1)} aria-label="Down a semitone">
                        <Minus />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Down a semitone</TooltipContent>
                  </Tooltip>
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" className="-ml-px size-9 rounded-l-none" onClick={() => stepKey(1)} aria-label="Up a semitone">
                        <Plus />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Up a semitone</TooltipContent>
                  </Tooltip>
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">add &ldquo;Do = C&rdquo; to the chart</span>
            )}
          </div>

          <ToggleGroup
            type="single"
            variant="outline"
            value={numbersStyle}
            onValueChange={(v) => v && setNumbersStyle(v as NotationStyle)}
            aria-label="Notation"
          >
            {NOTATIONS.map((n) => (
              <ToggleGroupItem key={n.value} value={n.value} title={n.hint} className="h-9 px-3">
                {n.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex items-center gap-2 md:ml-auto">
            <Button onClick={handleExportPDF} disabled={!sheet.trim() || exporting} className="min-w-[7.5rem]">
              {exporting ? "Exporting…" : "Export PDF"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/advanced-export">PDF options</Link>
            </Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* The chart, as you write it */}
        <section
          aria-labelledby="chart-heading"
          className="flex flex-col rounded-xl border bg-card has-[.cm-focused]:border-ring has-[.cm-focused]:ring-3 has-[.cm-focused]:ring-ring/20"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <h2 id="chart-heading" className="font-medium">
              Chart
            </h2>
            <div className="flex flex-wrap items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    New <ChevronDown className="opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => newChart(TEMPLATE_44, "the 4/4 template", "4/4")}>4/4 template</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => newChart(TEMPLATE_34, "the 3/4 template", "3/4")}>3/4 template</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => newChart(TEMPLATE_68, "the 6/8 template", "6/8")}>6/8 template</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => newChart("", "an empty chart")}>Empty chart</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    File <ChevronDown className="opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openTxtInput.current?.click()}>Open .txt…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleSaveTxt} disabled={!original.trim()}>
                    Save as .txt
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => midiInput.current?.click()}>Import chords from MIDI…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={openTxtInput} type="file" accept=".txt,text/plain" className="hidden" onChange={handleOpenTxt} />
              <input ref={midiInput} type="file" accept=".mid,.midi,audio/midi" className="hidden" onChange={handleImportMidi} />
              <ChartGuide />
            </div>
          </div>
          <div className="px-1 pt-1">
            <ChartEditor value={original} onChange={setOriginal} ariaLabel="Original chord chart" />
          </div>
          <div className="min-h-11 border-t px-4 py-2.5 text-sm" aria-live="polite">
            {problems.length > 0 ? (
              <ul className="space-y-0.5" aria-label="Problems in the chart">
                {problems.slice(0, 3).map((p, i) => (
                  <li key={i} className={p.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}>
                    Line {p.line}: {p.message}
                  </li>
                ))}
                {problems.length > 3 && <li className="text-muted-foreground">And {problems.length - 3} more, underlined above.</li>}
              </ul>
            ) : (
              <p className="text-muted-foreground">Saved in this browser as you type.</p>
            )}
          </div>
        </section>

        {/* The sheet: what Export PDF prints */}
        <section aria-labelledby="sheet-heading" className="flex flex-col rounded-xl border bg-card">
          <Tabs defaultValue="preview" className="flex-1 gap-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
              <div className="flex items-baseline gap-3">
                <h2 id="sheet-heading" className="font-medium">
                  Sheet
                </h2>
                <p className="text-sm text-muted-foreground">{sheetCaption}</p>
              </div>
              <TabsList className="h-8">
                <TabsTrigger value="preview" className="px-3 text-xs">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="text" className="px-3 text-xs">
                  Text
                </TabsTrigger>
              </TabsList>
            </div>
            {/* The page lies on the desk colour, so it reads as paper */}
            <TabsContent value="preview" className="rounded-b-xl bg-muted p-2 sm:p-4">
              <ChartPreview content={sheet} />
            </TabsContent>
            <TabsContent value="text">
              <div className="px-1 pt-1">
                <ChartEditor value={sheet} readOnly ariaLabel="Transposed chord chart" />
              </div>
              <div className="flex justify-end border-t px-4 py-2">
                <Button variant="ghost" size="sm" onClick={copyText} disabled={!sheet.trim()} className="min-w-[5.5rem]" aria-live="polite">
                  {copied ? "Copied" : "Copy text"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  )
}

// How to write a chart, opened from the chart's toolbar
function ChartGuide() {
  const example = `Song Title
Do = D
Time Signature = 4/4
Tempo (1/4) = 72 BPM

Verse : Soft
| D . . . | Em . D/F# . | G . . . | A(up) . . . |
| Bm7 . . . | G . A . | D | D | x2`
  const chords: [string, string, string][] = [
    ["Major", "The root note", "C, F, Bb"],
    ["Minor", "Root + m", "Am, F#m"],
    ["Seventh", "Root + 7", "G7, E7"],
    ["Major seventh", "Root + maj7 or M7", "Cmaj7, FM7"],
    ["Minor seventh", "Root + m7", "Dm7, Bm7"],
    ["Suspended", "Root + sus2 or sus4", "Dsus4, A7sus4"],
    ["Added note", "Root + add + number", "Cadd9"],
    ["Diminished / augmented", "Root + dim / aug", "Bdim, Caug"],
    ["Slash chord", "Chord / bass note", "G/B, D/F#"],
  ]
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How to write a chart</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm leading-relaxed">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[13px] leading-6">{example}</pre>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The first line is the title. The line <code>Do = D</code> gives the key; without it the chart can&apos;t change key.</li>
            <li>A name and a colon start a section: <code>Verse :</code>. Text after the colon is a note for the band, like <code>Soft</code>.</li>
            <li>Bars go between <code>|</code> signs, with one dot for each beat a chord is held: <code>| Em . D/F# . |</code> is Em for two beats, then D/F#.</li>
            <li>A bar with one chord can skip the dots: <code>| D |</code>. Text after the last bar, like <code>x2</code>, is printed at the end of the line.</li>
            <li>Notes go in brackets right after a chord: <code>A(up)</code> for a push. They are printed small and never change key.</li>
          </ul>
          <div>
            <h3 className="mb-2 font-medium">Chord spellings the app reads</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chord</TableHead>
                  <TableHead>How to write it</TableHead>
                  <TableHead>Examples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chords.map(([name, how, examples]) => (
                  <TableRow key={name}>
                    <TableCell>{name}</TableCell>
                    <TableCell>{how}</TableCell>
                    <TableCell className="font-mono text-[13px]">{examples}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground">
            Pick a key above to move the whole chart; the sheet updates as you go. Export PDF prints the sheet as you see it.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
