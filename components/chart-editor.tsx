"use client"

// The chart editor: CodeMirror with colours for chords, bars and sections, and the problems from
// lib/chart-lint.ts underlined as you type.

import { useEffect, useRef } from "react"
import { Annotation, EditorState, RangeSetBuilder } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, keymap, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { linter } from "@codemirror/lint"
import { parseChord, TOKEN_RE } from "@/lib/chords"
import { lintChart } from "@/lib/chart-lint"

const META_RE = /^\s*(?:Do\s*=|Time\s*Signature\s*=|Tempo[^=]*=|Structure\s*=)/i
const BEAT_RE = /^(?:[.\/~\-–—]+|%|N\.?C\.?)$/i

// The colour classes of one line, as [from, to, class] relative to the line start
function lineMarks(text: string, isFirstLine: boolean): [number, number, string][] {
  if (isFirstLine) return [[0, text.length, "cm-chart-title"]]
  if (META_RE.test(text)) return [[0, text.length, "cm-chart-meta"]]
  const marks: [number, number, string][] = []
  const firstBar = text.indexOf("|")
  if (firstBar >= 0 && (text.trim().startsWith("|") || /^[^|]*:\s*\|/.test(text))) {
    // "Intro : | C . . . |" — the label before the bars
    if (firstBar > 0 && text.slice(0, firstBar).trim()) marks.push([0, firstBar, "cm-chart-section"])
    const lastBar = text.lastIndexOf("|")
    for (let i = firstBar; i <= lastBar; i++) if (text[i] === "|") marks.push([i, i + 1, "cm-chart-bar"])
    for (const m of text.slice(firstBar, lastBar).matchAll(TOKEN_RE)) {
      const from = firstBar + m.index!
      const token = m[0]
      if (BEAT_RE.test(token)) marks.push([from, from + token.length, "cm-chart-beat"])
      else if (parseChord(token)) {
        // A note in parentheses after the chord: "Bm7(up)"
        const paren = token.search(/\((?!maj|min|add|sus|no|omit|alt|[#b♭♯]?\d)/i)
        if (paren > 0) {
          marks.push([from, from + paren, "cm-chart-chord"], [from + paren, from + token.length, "cm-chart-note"])
        } else marks.push([from, from + token.length, "cm-chart-chord"])
      }
    }
    // "x2" after the last bar
    if (text.slice(lastBar + 1).trim()) marks.push([lastBar + 1, text.length, "cm-chart-note"])
    return marks
  }
  // "Chorus : Loss, Build Up" — the section name, then its note
  const section = text.match(/^(\s*[^|:]+?\s*:)(.*)$/)
  if (section) {
    marks.push([0, section[1].length, "cm-chart-section"])
    if (section[2].trim()) marks.push([section[1].length, text.length, "cm-chart-note"])
  }
  return marks
}

const markCache = new Map<string, Decoration>()
const mark = (cls: string) => {
  if (!markCache.has(cls)) markCache.set(cls, Decoration.mark({ class: cls }))
  return markCache.get(cls)!
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view)
    }
    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>()
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = view.state.doc.lineAt(pos)
          const marks = lineMarks(line.text, line.number === 1).sort((a, b) => a[0] - b[0])
          for (const [a, b, cls] of marks) if (b > a) builder.add(line.from + a, line.from + b, mark(cls))
          pos = line.to + 1
        }
      }
      return builder.finish()
    }
  },
  { decorations: (v) => v.decorations },
)

const theme = EditorView.theme({
  // The editor sits inside a panel, which gives it its frame
  "&": {
    fontSize: "14px",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "1.7",
    minHeight: "380px",
    maxHeight: "70vh",
  },
  ".cm-content": { padding: "10px 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "color-mix(in oklch, var(--chart-chord) 25%, transparent)" },
  ".cm-chart-title": { fontWeight: "700" },
  ".cm-chart-meta": { color: "var(--chart-meta)" },
  ".cm-chart-section": { color: "var(--chart-section)", fontWeight: "700" },
  ".cm-chart-chord": { color: "var(--chart-chord)", fontWeight: "600" },
  ".cm-chart-note": { color: "var(--chart-note)", fontStyle: "italic" },
  ".cm-chart-bar, .cm-chart-beat": { color: "var(--chart-mark)" },
  ".cm-tooltip": { border: "1px solid var(--border)", backgroundColor: "var(--popover)", color: "var(--popover-foreground)", borderRadius: "0.375rem" },
  ".cm-diagnostic": { padding: "4px 8px", fontFamily: "system-ui, sans-serif", fontSize: "13px" },
})

const chartLinter = linter((view) => lintChart(view.state.doc.toString()), { delay: 300 })

// Marks changes that come from outside the editor (Smart Format, Import MIDI, a template), so they are
// not reported back as typing
const external = Annotation.define<boolean>()

export default function ChartEditor({
  value,
  onChange,
  ariaLabel,
  readOnly = false,
}: {
  value: string
  onChange?: (value: string) => void
  ariaLabel: string
  // Shows a chart that can be selected and copied but not edited, without the problem checks
  readOnly?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "false", autocapitalize: "off", autocorrect: "off" }),
          highlighter,
          theme,
          readOnly ? EditorState.readOnly.of(true) : chartLinter,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => view.destroy()
    // The editor is created once; later values arrive through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value }, annotations: external.of(true) })
  }, [value])

  return <div ref={host} />
}
