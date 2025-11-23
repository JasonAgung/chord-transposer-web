"use client"

import { useEffect, useState, MouseEvent, ChangeEvent } from "react"
import { detectKeyFromContent, getAllKeys, transposeChart, shiftNoteBySemitones, shouldUseFlats } from "@/lib/chords"
import { SmartFormatter } from "@/lib/formatter"
import { NumberedChordConverter } from "@/lib/numbered"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import Link from "next/link"
import { ModeToggle } from "@/components/theme-toggle"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { useStore } from "@/lib/store"

// Utilities
const KEYS = getAllKeys()
const formatter = new SmartFormatter()
const numberer = new NumberedChordConverter()

export default function ChordTransposer() {
  const { original, transposed, currentKey, targetKey, title, orientation, numbersStyle, timeSignature, setOriginal, setTransposed, setCurrentKey, setTargetKey, setTitle, setOrientation, setNumbersStyle, setTimeSignature } = useStore()

  useEffect(() => {
    const k = detectKeyFromContent(original)
    if (k && k !== currentKey) {
      setCurrentKey(k)
      setTargetKey(k)
    }
    const sigMatch = original.match(/Time\s*Signature\s*=\s*(\d+\/\d+)/i)
    if (sigMatch) {
      const sig = sigMatch[1] === "3/4" ? "3/4" : "4/4"
      if (sig !== timeSignature) {
        setTimeSignature(sig)
      }
    }
  }, [original, currentKey, targetKey, timeSignature, setCurrentKey, setTargetKey, setTimeSignature])

  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  useEffect(() => {
    if (!titleManuallyEdited) {
      const firstLine = original.split('\n')[0];
      setTitle(firstLine);
    }
  }, [original, setTitle, titleManuallyEdited]);

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitleManuallyEdited(true);
    setTitle(e.target.value);
  };



  const handleSmartFormat = () => {
    const formattedOriginal = formatter.formatChart(original)
    const formattedTransposed = transposed ? formatter.formatChart(transposed) : ""
    setOriginal(formattedOriginal)
    if (formattedTransposed) setTransposed(formattedTransposed)
  }

  const handleTranspose = (newTargetKey?: string | MouseEvent) => {
    const detectedKey = detectKeyFromContent(original)
    const finalTargetKey = typeof newTargetKey === 'string' ? newTargetKey : targetKey
    if (!detectedKey || !finalTargetKey) return
    setCurrentKey(detectedKey)
    const content = original
    const result = transposeChart(content, detectedKey, finalTargetKey)
    setTransposed(result)
  }

  const quickTransposeWhole = (steps: number) => {
    const detectedKey = detectKeyFromContent(original)
    if (!detectedKey && !targetKey) return
    const base = targetKey || detectedKey
    if (!base) return
    // shift by whole steps = 2 semitones
    const semitones = steps * 2
    const shiftedKey = shiftKey(base, semitones)
    setTargetKey(shiftedKey)
    handleTranspose(shiftedKey)
  }

  const quickTransposeHalf = (steps: number) => {
    const detectedKey = detectKeyFromContent(original)
    if (!detectedKey && !targetKey) return
    const base = targetKey || detectedKey
    if (!base) return
    const shiftedKey = shiftKey(base, steps)
    setTargetKey(shiftedKey)
    handleTranspose(shiftedKey)
  }

  function shiftKey(key: string, semitones: number) {
    const preferFlats = shouldUseFlats(key)
    return shiftNoteBySemitones(key, semitones, preferFlats)
  }



  const handleExportPDF = async () => {
    const content = transposed || original
    if (!content) return

    const pdfDoc = await PDFDocument.create()
    let page = pdfDoc.addPage()

    let { width, height } = page.getSize()
    if (orientation === "landscape") {
      page.setSize(height, width)
      ;[width, height] = [height, width]
    }
    const margin = 50
    const usableWidth = width - margin * 2

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const drawFooter = (page: any, width: number, pageNum: number, totalPages: number) => {
      // No footer
    }

    const lines = content.split("\n")
    const lineHeight = 14
    const columnGap = 20

    let currentX = margin
    let currentY = height - margin
    const colWidth = orientation === "landscape" ? usableWidth / 2 - columnGap / 2 : usableWidth

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

              if (currentY < margin) {
                if (orientation === "landscape" && currentX === margin) {
                  currentX = margin + colWidth + columnGap
                  currentY = height - margin
                } else {
                  drawFooter(page, width, pdfDoc.getPageCount(), pdfDoc.getPageCount())
                  page = pdfDoc.addPage()
                  if (orientation === "landscape") {
                    page.setSize(width, height)
                  }
                  currentX = margin
                  currentY = height - margin
                }
              }
      const isTitle = i === 0
      const isMetadata = line.match(/^(Do\s*=|Time\s*Signature\s*=|Tempo\s*.*=|Structure\s*=)/)
      const isSectionHeader = line.match(/^([\w\s-]+:)/)

      if (isSectionHeader) {
        currentY -= lineHeight / 2
      }

      page.drawText(line, {
        x: currentX,
        y: currentY,
        font: isTitle || isSectionHeader ? boldFont : font,
        size: isTitle ? 15 : 10,
        color: isMetadata ? rgb(0.5, 0.5, 0.5) : rgb(0, 0, 0),
        maxWidth: colWidth,
      })
      currentY -= isTitle ? 24 : lineHeight
    }
    drawFooter(page, width, pdfDoc.getPageCount(), pdfDoc.getPageCount())

    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([pdfBytes.slice().buffer], { type: "application/pdf" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${(title || "chord-chart").toLowerCase().replace(/\s+/g, "-")}.pdf`
    link.click()
  }

  const extractTitleFromContent = (content: string): string | null => {
    const titleMatch = content.match(/^\s*(\[.*\]\.\s*.*)/)
    return titleMatch ? titleMatch[1].trim() : null
  }

  const loadTemplate34 = () => {
    setOriginal(
      `[Song Number]. [Song Title] ([Source/Book Reference])
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
| F . . | G . . | C . . | C . . |`,
    )
    setTransposed("")
    setTimeSignature("3/4")
  }

  const loadTemplate44 = () => {
    setOriginal(
      `[Song Number]. [Song Title] ([Source/Book Reference])
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
| F . . . | G . . . | C . . . | C . . . |`,
    )
    setTransposed("")
    setTimeSignature("4/4")
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chord Chart Transposer</h1>
          <p className="text-sm pt-2 text-muted-foreground">From an MD to fellow MDs (i love MD(s))</p>
        </div>
        
        <ModeToggle />
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Chart Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Title */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Chord Chart" value={title} readOnly className="bg-muted" />
          </div>

          {/* Detected Key */}
          <div className="flex flex-col gap-2">
            <Label>Detected Key</Label>
            <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">{currentKey || "—"}</div>
          </div>

          {/* Target Key */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetKey">Target Key</Label>
            <Select value={targetKey} onValueChange={setTargetKey}>
              <SelectTrigger id="targetKey" className="w-full">
                <SelectValue placeholder="Choose key" />
              </SelectTrigger>
              <SelectContent>
                {KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Time Signature</Label>
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border">
                <Button
                  type="button"
                  variant={timeSignature === "4/4" ? "default" : "secondary"}
                  className="rounded-none"
                  onClick={() => loadTemplate44()}
                >
                  4/4
                </Button>
                <Button
                  type="button"
                  variant={timeSignature === "3/4" ? "default" : "secondary"}
                  className="rounded-none border-l"
                  onClick={() => loadTemplate34()}
                >
                  3/4
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Switching updates the template and signature line.</div>
          </div>

          {/* Transpose + Quick Group */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <Button className="md:w-[220px]" onClick={handleTranspose} disabled={!currentKey || !targetKey}>
                Transpose
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm text-muted-foreground">Quick:</div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex overflow-hidden rounded-md border">
                    <Button variant="secondary" onClick={() => quickTransposeWhole(1)} className="rounded-none">
                      +1
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => quickTransposeWhole(-1)}
                      className="rounded-none border-l"
                    >
                      -1
                    </Button>
                    <Button variant="secondary" onClick={() => quickTransposeHalf(1)} className="rounded-none border-l">
                      +<span className="-translate-y-px"><sup>1</sup>&frasl;<sub>2</sub></span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => quickTransposeHalf(-1)}
                      className="rounded-none border-l"
                    >
                      -<span className="-translate-y-px"><sup>1</sup>&frasl;<sub>2</sub></span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Number System (radio) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-3 md:col-span-3">
                <Label>Notation</Label>
                <RadioGroup
                  className="grid grid-cols-3 gap-3"
                  value={numbersStyle}
                  onValueChange={(v: "default" | "roman" | "arabic") => {
                    setNumbersStyle(v)
                    const base = original
                    if (!base) return
                    const detected = detectKeyFromContent(base || "")
                    const key = detected || targetKey
                    if (!key) return
                    const converted = numberer.convertChartToSystem(base, key, v)
                    setTransposed(converted)
                  }}
                >
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <RadioGroupItem id="default" value="default" />
                    <Label htmlFor="default">Default (ABC)</Label>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <RadioGroupItem id="roman" value="roman" />
                    <Label htmlFor="roman">Roman (i, ii, iii)</Label>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <RadioGroupItem id="arabic" value="arabic" />
                    <Label htmlFor="arabic">Arabic (1, 2m, 3m)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* PDF + Format */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="orientation">PDF Orientation</Label>
                <Select value={orientation} onValueChange={(v: "portrait" | "landscape") => setOrientation(v)}>
                  <SelectTrigger id="orientation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button className="w-full" onClick={handleSmartFormat}>
                  Smart Format
                </Button>
              </div>

              <div className="flex items-end gap-2">
                <Button variant="default" className="w-full" onClick={handleExportPDF}>
                  Export PDF
                </Button>
              </div>
              
              <div className="flex items-end gap-2">
                <Link href="/advanced-export" className="w-full">
                  <Button
                    className="w-full"
                    onClick={() => {
                      localStorage.setItem("chordChartContent", transposed || original)
                    }}
                  >
                    Advanced Export
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground h-1 flex items-center">Original</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Tips</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[80vh] overflow-y-auto md:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>How to Write a Chord Chart</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                 <div>
                    <h3 className="font-semibold">1. Start with a Template 🚀</h3>
                    <p>To get started, follow the template given by your desired time signature, then fill in the essential song information at the top of the file. ✍️</p>
                  </div>
                  <div>
                    <h3 className="font-semibold">2. Write Your Chord Progressions 🎸</h3>
                    <p>Chord lines are written inside measures (or bars) separated by the | symbol. Inside each measure, write the chord name and use dots (.) to represent the remaining beats. Try to stick to a maximum of 4 bars per line for a clean layout. 📏</p>
                  </div>
                  <div>
                    <h3 className="font-semibold">3. Chord Notation Guide 📖</h3>
                    <p>The program recognizes a wide variety of chords! Use the following format to ensure they are processed correctly ✅. Here is a table summarizing how to write various chord types that the program will recognize.</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Chord Type</TableHead>
                          <TableHead>How to Write</TableHead>
                          <TableHead>Examples</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>Major</TableCell>
                          <TableCell>Just the root note</TableCell>
                          <TableCell>C, F, A#</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Minor</TableCell>
                          <TableCell>Root + m</TableCell>
                          <TableCell>Am, Dm, G#m</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Dominant 7th</TableCell>
                          <TableCell>Root + 7</TableCell>
                          <TableCell>G7, C7, F#7</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Major 7th</TableCell>
                          <TableCell>Root + M7 or maj7</TableCell>
                          <TableCell>CM7, Fmaj7</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Minor 7th</TableCell>
                          <TableCell>Root + m7</TableCell>
                          <TableCell>Dm7, Am7, Ebm7</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Suspended</TableCell>
                          <TableCell>Root + sus + Number</TableCell>
                          <TableCell>Csus4, Gsus2</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Add</TableCell>
                          <TableCell>Root + add + Number</TableCell>
                          <TableCell>Cadd9, Gadd11</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Diminished</TableCell>
                          <TableCell>Root + dim</TableCell>
                          <TableCell>Bdim, C#dim</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Augmented</TableCell>
                          <TableCell>Root + aug</TableCell>
                          <TableCell>Caug, Gaug</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Slash Chord</TableCell>
                          <TableCell>Chord + / + Bass Note</TableCell>
                          <TableCell>G/B, Am/G, D/F#</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Complex Chord</TableCell>
                          <TableCell>A combination of the above</TableCell>
                          <TableCell>Am7/G, Cmaj9</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <br></br>
                  <div>
                    <h3 className="font-semibold">4. Finalize Your Chart 🎶</h3>
                    <p>Once your chart is written, use these tools to finish up:</p>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>
                        <strong>✨ Format Your Chart</strong>
                        <ul className="list-disc list-inside pl-4">
                          <li>Use the <strong>Smart Format</strong> button to automatically clean up spacing and align all the bars vertically for a professional look.</li>
                          <li><strong>Note</strong>: For perfect alignment, this feature requires a monospaced font (like Courier).</li>
                        </ul>
                      </li>
                      <li>
                        <strong>🔄 Transpose to a New Key</strong>
                        <ul className="list-disc list-inside pl-4">
                          <li>Select a <strong>Target Key</strong> from the dropdown menu.</li>
                          <li>Click the <strong>Transpose</strong> button. The transposed version will appear in the right-hand panel.</li>
                        </ul>
                      </li>
                      <li>
                        <strong>💾 Save and Export</strong>
                        <ul className="list-disc list-inside pl-4">
                          <li>You can save the transposed chart in several ways:
                            <ul className="list-disc list-inside pl-4">
                              <li><strong>As a Text File</strong>: Export your chart as a simple <code>.txt</code> file.</li>
                              <li><strong>As a PDF</strong>: Quickly save the chart as a PDF document.</li>
                              <li><strong>Advanced Export</strong>: For PDFs, you can customize the font type and size in the advanced export section.</li>
                            </ul>
                          </li>
                        </ul>
                      </li>
                    </ol>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              className={cn("min-h-[380px] font-mono")}
              aria-label="Original chord chart"
            />
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Paste your chart here. Include a line like "Do = C".</div>
              <Button variant="secondary" onClick={() => setOriginal("")}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground h-7 flex items-center">Transposed / Converted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={transposed}
              readOnly
              className={cn("min-h-[380px] font-mono")}
              aria-label="Transposed chord chart"
            />
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Result appears here after transposing or converting.</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setTransposed("")}>
                  Clear
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(transposed || "")}
                  disabled={!transposed}
                >
                  Copy
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />
      <div className="text-xs text-muted-foreground">
        Tip: Smart Format aligns bars like {"| C . . . | G . . . |"}.
      </div>
    </section>
  )
}
