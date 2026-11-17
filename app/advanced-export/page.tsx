"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import PdfPreview from "@/components/pdf-preview"
import Link from "next/link"
import { useStore } from "@/lib/store"
import { ModeToggle } from "@/components/theme-toggle"
import { createPdf, downloadPdf, pdfFileName, PdfFontFamily, PdfStyle } from "@/lib/pdf"
import { detectKeyFromContent } from "@/lib/chords"

const MIN_FONT_SIZE = 6
const MAX_FONT_SIZE = 24

export default function AdvancedExport() {
  const {
    original,
    transposed,
    orientation,
    setOrientation,
    title,
  } = useStore()
  const [fontSize, setFontSize] = useState(10)
  const [style, setStyle] = useState<PdfStyle>("grid")
  const [fontFamily, setFontFamily] = useState<PdfFontFamily>("Helvetica")
  const [exportError, setExportError] = useState<string | null>(null)

  const content = transposed || original

  // Load the chart saved in this browser, for when this page is opened directly (see lib/store.ts).
  // This page's other code doesn't write to the store before it.
  useEffect(() => {
    useStore.persist.rehydrate()
  }, [])

  // A moved chart says its key in the file name, as on the main page
  const writtenKey = detectKeyFromContent(original)
  const sheetKey = detectKeyFromContent(content)
  const fileTitle = writtenKey && sheetKey && sheetKey !== writtenKey ? `${title} in ${sheetKey}` : title
  const [exporting, setExporting] = useState(false)

  const handleExportPDF = async () => {
    if (exporting) return
    setExportError(null)
    setExporting(true)
    try {
      downloadPdf(await createPdf(content, { style, orientation, fontSize, fontFamily }), fileTitle)
    } catch (err) {
      console.error(err)
      setExportError("Couldn't create the PDF. Check the chart for unusual characters and try again.")
    } finally {
      setExporting(false)
    }
  }

  const stepFontSize = (delta: number) => setFontSize((size) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size + delta)))

  const handleSaveTxt = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = pdfFileName(fileTitle).replace(/\.pdf$/, ".txt")
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 lg:py-12">
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="-ml-3 mb-1 text-muted-foreground">
              <Link href="/">
                <ArrowLeft /> Back to the chart
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">PDF options</h1>
          </div>
          <ModeToggle />
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
          <section aria-label="PDF preview" className="overflow-hidden rounded-xl border bg-muted">
            <div className="h-[70vh] min-h-[480px] w-full">
              <PdfPreview content={content} style={style} fontSize={fontSize} fontFamily={fontFamily} orientation={orientation} />
            </div>
          </section>

          <section aria-labelledby="settings-heading" className="h-fit space-y-5 rounded-xl border bg-card p-4">
            <h2 id="settings-heading" className="sr-only">
              Settings
            </h2>

            <div className="space-y-2">
              <Label id="style-label">Style</Label>
              <ToggleGroup type="single" variant="outline" value={style} onValueChange={(v) => v && setStyle(v as PdfStyle)} aria-labelledby="style-label" className="w-full">
                <ToggleGroupItem value="grid" className="flex-1">
                  Grid
                </ToggleGroupItem>
                <ToggleGroupItem value="classic" className="flex-1">
                  Classic
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-sm text-muted-foreground">
                {style === "grid"
                  ? "Each bar is a box with the chords at their beats. Lines up on its own."
                  : "The chart text as written, in two columns. Fits long songs on fewer pages."}
              </p>
            </div>

            <div className="space-y-2">
              <Label id="orientation-label">Page</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={orientation}
                onValueChange={(v) => v && setOrientation(v as "portrait" | "landscape")}
                aria-labelledby="orientation-label"
                className="w-full"
              >
                <ToggleGroupItem value="portrait" className="flex-1">
                  Portrait
                </ToggleGroupItem>
                <ToggleGroupItem value="landscape" className="flex-1">
                  Landscape
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label id="size-label">Text size</Label>
              <div className="flex items-center" role="group" aria-labelledby="size-label">
                <Button variant="outline" size="icon" className="rounded-r-none" onClick={() => stepFontSize(-1)} disabled={fontSize <= MIN_FONT_SIZE} aria-label="Smaller">
                  <Minus />
                </Button>
                <div className="flex h-9 w-14 items-center justify-center border-y text-sm tabular-nums">{fontSize} pt</div>
                <Button variant="outline" size="icon" className="rounded-l-none" onClick={() => stepFontSize(1)} disabled={fontSize >= MAX_FONT_SIZE} aria-label="Larger">
                  <Plus />
                </Button>
              </div>
            </div>

            {style === "classic" && (
              <div className="space-y-2">
                <Label id="font-label">Font</Label>
                <ToggleGroup type="single" variant="outline" value={fontFamily} onValueChange={(v) => v && setFontFamily(v as PdfFontFamily)} aria-labelledby="font-label" className="w-full">
                  <ToggleGroupItem value="Helvetica" className="flex-1">
                    Helvetica
                  </ToggleGroupItem>
                  <ToggleGroupItem value="Courier" className="flex-1 font-mono">
                    Courier
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-sm text-muted-foreground">Courier lines up the bars under each other.</p>
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <Button className="w-full" onClick={handleExportPDF} disabled={!content.trim() || exporting}>
                {exporting ? "Exporting…" : "Export PDF"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleSaveTxt} disabled={!content.trim()}>
                Save as .txt
              </Button>
              {exportError && <p className="text-sm text-destructive">{exportError}</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
