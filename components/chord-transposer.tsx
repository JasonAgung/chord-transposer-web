"use client"

import { useMemo, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import jsPDF from "jspdf"
import { ModeToggle } from "@/components/theme-toggle"

// Utilities
const KEYS = getAllKeys()
const formatter = new SmartFormatter()
const numberer = new NumberedChordConverter()

export default function ChordTransposer() {
  const [original, setOriginal] = useState<string>(
    "" +
      `[Song Number]. [Song Title] ([Source/Book Reference])
Do = C
Time Signature = 4/4
Tempo (1/4) = 100 BPM
Structure = Intro, Verse, Chorus

Intro :
| C . . . | F . . . | G . . . | C . . . |

Verse :
| C . . . | Am . . . | F . . . | G . . . |
| C . . . | Am . . . | F . . . | G . . . |

Chorus :
| F . . . | G . . . | C . . . | C . . . |
| F . . . | G . . . | C . . . | C . . . |`,
  )
  const [transposed, setTransposed] = useState<string>("")
  const [currentKey, setCurrentKey] = useState<string>("")
  const [targetKey, setTargetKey] = useState<string>("")
  const [title, setTitle] = useState<string>("Chord Chart")
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait")
  const [twoColumns, setTwoColumns] = useState<boolean>(false)
  const [numbersStyle, setNumbersStyle] = useState<"default" | "roman" | "arabic">("default")
  const [timeSignature, setTimeSignature] = useState<"4/4" | "3/4">("4/4")

  // Detect key and time signature whenever content changes
  useMemo(() => {
    const k = detectKeyFromContent(original)
    setCurrentKey(k || "")
    if (!targetKey && k) {
      setTargetKey(k)
    }
    const sigMatch = original.match(/Time\s*Signature\s*=\s*(\d+\/\d+)/i)
    if (sigMatch) {
      const sig = sigMatch[1] === "3/4" ? "3/4" : "4/4"
      setTimeSignature(sig)
    }
  }, [original]) // eslint-disable-line

  const handleSmartFormat = () => {
    const formattedOriginal = formatter.formatChart(original)
    const formattedTransposed = transposed ? formatter.formatChart(transposed) : ""
    setOriginal(formattedOriginal)
    if (formattedTransposed) setTransposed(formattedTransposed)
  }

  const handleTranspose = () => {
    if (!currentKey || !targetKey) return
    const content = original
    const result = transposeChart(content, currentKey, targetKey)
    setTransposed(result)
  }

  const quickTransposeWhole = (steps: number) => {
    if (!currentKey && !targetKey) return
    const base = targetKey || currentKey
    // shift by whole steps = 2 semitones
    const semitones = steps * 2
    const shiftedKey = shiftKey(base, semitones)
    setTargetKey(shiftedKey)
    setTimeout(handleTranspose, 0)
  }

  const quickTransposeHalf = (steps: number) => {
    if (!currentKey && !targetKey) return
    const base = targetKey || currentKey
    const shiftedKey = shiftKey(base, steps)
    setTargetKey(shiftedKey)
    setTimeout(handleTranspose, 0)
  }

  function shiftKey(key: string, semitones: number) {
    const preferFlats = shouldUseFlats(key)
    return shiftNoteBySemitones(key, semitones, preferFlats)
  }

  const handleConvert = () => {
    const base = original
    if (!base) return
    const detected = detectKeyFromContent(base || "")
    const key = detected || targetKey || currentKey
    if (!key) return
    const converted = numberer.convertChartToSystem(base, key, numbersStyle)
    setTransposed(converted)
  }

  const handleExportPDF = () => {
    const content = transposed || original
    if (!content) return

    // Apply smart formatting before export
    const formatted = formatter.formatChart(content)
    const doc = new jsPDF({
      orientation: orientation,
      unit: "pt",
      format: "letter",
      compress: true,
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 48
    const usableWidth = pageWidth - margin * 2

    // Header
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text(title || "Chord Chart", margin, margin)
    doc.setFont("courier", "normal")
    doc.setFontSize(11)

    const lines = formatted.split("\n")

    const writeColumn = (x: number, startY: number, textLines: string[]) => {
      let y = startY
      const lineHeight = 16
      const maxY = pageHeight - margin

      for (const raw of textLines) {
        const chunks = doc.splitTextToSize(raw || " ", usableWidth / (twoColumns ? 2 : 1) - 8)
        for (const chunk of chunks) {
          if (y + lineHeight > maxY) {
            doc.addPage()
            // new page header
            doc.setFont("helvetica", "bold")
            doc.setFontSize(14)
            doc.text(title || "Chord Chart", margin, margin)
            doc.setFont("courier", "normal")
            doc.setFontSize(11)
            y = margin + 28
          }
          doc.text(chunk, x, y)
          y += lineHeight
        }
      }
      return y
    }

    if (twoColumns && orientation === "landscape") {
      const midX = margin + usableWidth / 2
      const halfLines = Math.ceil(lines.length / 2)
      const col1 = lines.slice(0, halfLines)
      const col2 = lines.slice(halfLines)

      const startY = margin + 28
      writeColumn(margin, startY, col1)
      writeColumn(midX, startY, col2)
    } else {
      const startY = margin + 28
      writeColumn(margin, startY, lines)
    }

    doc.save(`${(title || "chord-chart").toLowerCase().replace(/\s+/g, "-")}.pdf`)
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
      <header className="flex items-center justify-between">
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
            <Input id="title" placeholder="Chord Chart" value={title} onChange={(e) => setTitle(e.target.value)} />
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
              <div className="flex flex-col gap-3 md:col-span-2">
                <Label>Notation</Label>
                <RadioGroup
                  className="grid grid-cols-3 gap-3"
                  value={numbersStyle}
                  onValueChange={(v: "default" | "roman" | "arabic") => setNumbersStyle(v)}
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
              <div className="flex items-end">
                <Button variant="outline" className="w-full bg-transparent" onClick={handleConvert}>
                  Convert
                </Button>
              </div>
            </div>

            {/* PDF + Format */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                <div className="flex items-center justify-between rounded-md border p-2">
                  <Label htmlFor="twoColumns" className="text-sm">
                    Two Columns (landscape)
                  </Label>
                  <Switch id="twoColumns" checked={twoColumns} onCheckedChange={setTwoColumns} />
                </div>
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
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Original</CardTitle>
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
            <CardTitle className="text-foreground">Transposed / Converted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={transposed}
              onChange={(e) => setTransposed(e.target.value)}
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
        Tip: Smart Format aligns bars like {"| C . . . | G . . . |"} and preserves time signature hints (3/4 vs 4/4).
      </div>
    </section>
  )
}
