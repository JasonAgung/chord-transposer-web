"use client"

import { useEffect, useState, MouseEvent, ChangeEvent } from "react"
import { detectKeyFromContent, getAllKeys, shiftNoteBySemitones, shouldUseFlats } from "@/lib/chords"
import { SmartFormatter } from "@/lib/formatter"
import { renderChart, NotationStyle } from "@/lib/render"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { createChartPdf, downloadPdf } from "@/lib/pdf"
import Link from "next/link"
import { ModeToggle } from "@/components/theme-toggle"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { useStore } from "@/lib/store"

// Utilities
const KEYS = getAllKeys()
const formatter = new SmartFormatter()
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
    const result = renderChart(original, finalTargetKey, numbersStyle)
    if (result !== null) setTransposed(result)
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



  const [pdfError, setPdfError] = useState<string | null>(null)

  const handleExportPDF = async () => {
    const content = transposed || original
    if (!content) return
    setPdfError(null)
    try {
      downloadPdf(await createChartPdf(content, { orientation }), title)
    } catch (err) {
      console.error(err)
      setPdfError("Could not create the PDF. Please check the chart for unusual characters and try again.")
    }
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
          <h1 className="text-2xl font-semibold">Chord Chart Maker & Transposer</h1>
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
                  onValueChange={(v: NotationStyle) => {
                    setNumbersStyle(v)
                    const key = targetKey || detectKeyFromContent(original)
                    if (!key) return
                    const converted = renderChart(original, key, v)
                    if (converted !== null) setTransposed(converted)
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
                  <Button className="w-full">Advanced Export</Button>
                </Link>
              </div>
            </div>
            {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}
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
                    <p>Chord lines are written inside measures (or bars) separated by the <code>|</code> symbol. Inside each measure, write the chord name and use dots (<code>.</code>) to represent the remaining beats. You can also add details by writing text inside parentheses right after the chord — for example, <code>F(up)</code>. Try to stick to a maximum of 4 bars per line for a clean layout. 📏</p>
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
        Tip: READ THE TIPS!.
      </div>
    </section>
  )
}
