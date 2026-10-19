// Builds the output panel: transpose to the target key first, then convert notation in that key.

import { detectKeyFromContent, transposeChart } from "./chords"
import { NumberedChordConverter } from "./numbered"

export type NotationStyle = "default" | "roman" | "arabic"

const numberer = new NumberedChordConverter()

export function renderChart(original: string, toKey: string, style: NotationStyle): string | null {
  const fromKey = detectKeyFromContent(original)
  if (!fromKey || !toKey) return null
  // Same key: skip transposition so the chart keeps its original sharp/flat spelling
  const chart = fromKey === toKey ? original : transposeChart(original, fromKey, toKey)
  return numberer.convertChartToSystem(chart, toKey, style)
}
