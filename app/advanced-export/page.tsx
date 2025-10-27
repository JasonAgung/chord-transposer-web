"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import PdfPreview from "@/components/pdf-preview"
import Link from "next/link"
import { Switch } from "@/components/ui/switch"
import { useStore } from "@/lib/store"
import { ModeToggle } from "@/components/theme-toggle"

export default function AdvancedExport() {
  const {
    original,
    transposed,
    orientation,
    setOrientation,
    title,
  } = useStore()
  const [fontSize, setFontSize] = useState(10)
  const [fontFamily, setFontFamily] = useState("Helvetica")

  const content = transposed || original

  return (
    <main className="container mx-auto px-4 py-8 md:px-6 lg:py-12">
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="outline">Back</Button>
          </Link>
          <h1 className="text-2xl font-semibold">Advanced Export</h1>
        </div>
        <ModeToggle />
      </header>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>PDF Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] w-full">
                <PdfPreview
                  content={content}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  orientation={orientation}
                />
              </div>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Customization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label>Font Size</Label>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setFontSize(fontSize - 1)}>-</Button>
                  <div className="w-12 text-center">{fontSize}</div>
                  <Button onClick={() => setFontSize(fontSize + 1)}>+</Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Font Family</Label>
                <Select value={fontFamily} onValueChange={setFontFamily}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Helvetica">Helvetica</SelectItem>
                    <SelectItem value="Courier">Courier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Orientation</Label>
                <Select value={orientation} onValueChange={(value) => setOrientation(value as "portrait" | "landscape")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    const link = document.createElement("a")
                    link.href = (document.querySelector("iframe") as HTMLIFrameElement).src
                    link.download = `${(title || "chord-chart").toLowerCase().replace(/\s+/g, "-")}.pdf`
                    link.click()
                  }}
                >
                  Export PDF
                </Button>
                <Button
                  onClick={() => {
                    const blob = new Blob([content], { type: "text/plain" })
                    const link = document.createElement("a")
                    link.href = URL.createObjectURL(blob)
                    link.download = "chord-chart.txt"
                    link.click()
                  }}
                >
                  Export TXT
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
    </main>
  )
}