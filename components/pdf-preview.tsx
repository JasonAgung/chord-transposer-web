"use client"

import { useEffect, useState } from "react"
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "pdf-lib"

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

    const drawTextWithAnnotations = (
      page: PDFPage,
      text: string,
      x: number,
      y: number,
      options: { font: PDFFont; size: number; color: any }
    ) => {
      const annotationRegex = /([\w#b/]+)\(([^)]+)\)/g
      let lastIndex = 0
      let currentX = x
      let match

      while ((match = annotationRegex.exec(text)) !== null) {
        // Draw text before the match
        const precedingText = text.substring(lastIndex, match.index)
        if (precedingText) {
          page.drawText(precedingText, { ...options, x: currentX, y })
          currentX += options.font.widthOfTextAtSize(precedingText, options.size)
        }

        // Draw the word and its subscript annotation
        const word = match[1]
        const annotation = match[2]
        const subscriptSize = options.size * 0.7
        const subscriptY = y - options.size * 0.3

        page.drawText(word, { ...options, x: currentX, y })
        currentX += options.font.widthOfTextAtSize(word, options.size)

        page.drawText(annotation, { ...options, x: currentX, y: subscriptY, size: subscriptSize })
        currentX += options.font.widthOfTextAtSize(annotation, subscriptSize)

        lastIndex = annotationRegex.lastIndex
      }

      // Draw remaining text after the last match
      const remainingText = text.substring(lastIndex)
      if (remainingText) {
        page.drawText(remainingText, { ...options, x: currentX, y })
      }
    }

      const lines = content.split("\n")
      const lineHeight = fontSize * 1.4
      const columnGap = 20

      let currentX = margin
      let currentY = height - margin
      const colWidth = usableWidth / 2 - columnGap / 2

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (currentY < margin) {
          if (currentX === margin) { // First column is full
            currentX = margin + colWidth + columnGap
            currentY = height - margin
          } else { // Second column is full
            drawFooter(page, width, pdfDoc.getPageCount(), pdfDoc.getPageCount())
            page = pdfDoc.addPage([width, height]) // Add new page with same dimensions
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
            drawTextWithAnnotations(page, wrappedLine, currentX, currentY, {
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