"use client"

import { useEffect, useState } from "react"
import { PDFDocument, rgb, StandardFonts, PDFFont } from "pdf-lib"

function breakTextIntoLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const lineWithWord = currentLine === '' ? word : `${currentLine} ${word}`;
        const width = font.widthOfTextAtSize(lineWithWord, fontSize);
        if (width < maxWidth) {
            currentLine = lineWithWord;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

export default function PdfPreview({ content, fontSize, fontFamily, orientation }: { content: string, fontSize: number, fontFamily: string, orientation: "portrait" | "landscape" }) {
  const [pdfUrl, setPdfUrl] = useState("")

  useEffect(() => {
    const generatePdf = async () => {
      const pdfDoc = await PDFDocument.create()
      let page = pdfDoc.addPage()

      let { width, height } = page.getSize()
      if (orientation === "landscape") {
        page.setSize(height, width)
        ;[width, height] = [height, width]
      }
      const margin = 50
      const usableWidth = width - margin * 2

      let font
      let boldFont

      if (fontFamily === "Courier") {
        font = await pdfDoc.embedFont(StandardFonts.Courier)
        boldFont = await pdfDoc.embedFont(StandardFonts.CourierBold)
      } else {
        font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      }

      const drawFooter = (page: any, width: number, pageNum: number, totalPages: number) => {
        // No footer
      }

      const lines = content.split("\n")
      const lineHeight = fontSize * 1.4
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

        const currentFont = isTitle || isSectionHeader ? boldFont : font;
        const currentSize = isTitle ? fontSize + 5 : fontSize;
        
        const wrappedLines = breakTextIntoLines(line, currentFont, currentSize, colWidth);

        for (const wrappedLine of wrappedLines) {
            page.drawText(wrappedLine, {
                x: currentX,
                y: currentY,
                font: currentFont,
                size: currentSize,
                color: isMetadata ? rgb(0.5, 0.5, 0.5) : rgb(0, 0, 0),
            });
            currentY -= isTitle ? fontSize + 14 : lineHeight;
        }
      }
      drawFooter(page, width, pdfDoc.getPageCount(), pdfDoc.getPageCount())

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes.slice().buffer], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
    }

    generatePdf()
  }, [content, fontSize, fontFamily, orientation])

  return (
    <>{pdfUrl && <iframe src={pdfUrl} className="h-full w-full" />}</>
  )
}