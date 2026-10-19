"use client"

import { useEffect, useState } from "react"
import { createChartPdf, pdfBlob, PdfFontFamily } from "@/lib/pdf"

export default function PdfPreview({ content, fontSize, fontFamily, orientation }: { content: string, fontSize: number, fontFamily: PdfFontFamily, orientation: "portrait" | "landscape" }) {
  const [pdfUrl, setPdfUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Ignore results from an older render that finishes after a newer one has started
    let cancelled = false
    createChartPdf(content, { orientation, fontSize, fontFamily })
      .then((bytes) => {
        if (cancelled) return
        setPdfUrl(URL.createObjectURL(pdfBlob(bytes)))
        setError(null)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError("Could not create the PDF preview.")
      })
    return () => {
      cancelled = true
    }
  }, [content, fontSize, fontFamily, orientation])

  // Release the previous preview file once it has been replaced
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  return <>{pdfUrl && <iframe src={pdfUrl} className="h-full w-full" title="PDF preview" />}</>
}
