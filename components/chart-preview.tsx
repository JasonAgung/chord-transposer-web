"use client"

// A live preview of the chart in the grid style of the PDF (lib/pdf-grid.ts), drawn with HTML so it
// updates as you type and works on phones, where the browser's PDF viewer often doesn't. It is drawn as
// the printed page looks: white paper and dark ink in either theme (the .paper class in globals.css).

import { Fragment, useLayoutEffect, useMemo, useRef } from "react"
import { chordSegments, Item, parseSong, Seg } from "@/lib/pdf-grid"
import { cn } from "@/lib/utils"

const BARS_PER_ROW = 4

function Chord({ token }: { token: string }) {
  const segs = chordSegments(token)
  const notes = segs.filter((s) => s.role === "note")
  const hasExt = segs.some((s) => s.role === "ext")
  const part = (s: Seg, i: number) => {
    switch (s.role) {
      case "root":
        return <span key={i}>{s.text}</span>
      case "acc":
      case "bassAcc":
        return <sup key={i} className="text-[0.7em]">{s.text}</sup>
      case "minor":
      case "slash":
        return <span key={i} className="font-normal">{s.text}</span>
      case "bass":
        return <span key={i} className="text-[0.88em]">{s.text}</span>
      case "ext":
        // The extension on top, a note like "up" under it
        return (
          <span key={i} className="inline-flex flex-col align-top text-[0.62em] font-normal leading-[1.05]">
            <span>{s.text}</span>
            {notes.map((n, j) => (
              <span key={j} className="italic text-[var(--ink-muted)]">{n.text}</span>
            ))}
          </span>
        )
      case "note":
        return hasExt ? null : <sub key={i} className="text-[0.56em] font-normal italic text-[var(--ink-muted)]">{s.text}</sub>
      default:
        return <span key={i} className="text-[0.86em]">{s.text}</span>
    }
  }
  return <span className="whitespace-nowrap font-bold">{segs.map(part)}</span>
}

// One beat-dot for each empty beat after a chord. Dots are never left out: they say how long the chord
// lasts. When the bar is short of room they sit closer together, and the bar's font shrinks (see fit).
function Dots({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="flex flex-1 items-center justify-around gap-0.5 px-1 text-[var(--ink-muted)]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="leading-none">
          •
        </span>
      ))}
    </span>
  )
}

// One bar. Each chord takes a share of the bar for its beats (up to the next chord), and never less than it
// needs for its name and its dots, so nothing overlaps.
function Bar({ slots, beats, className }: { slots: { pos: number; token: string }[]; beats: number; className: string }) {
  if (slots.length === 0) {
    // An empty bar (drums only, a break) shows its beats as slashes
    return (
      <div className={cn("grid items-center", className)} style={{ gridTemplateColumns: `repeat(${beats}, minmax(0, 1fr))` }}>
        {Array.from({ length: beats }, (_, i) => (
          <span key={i} className="text-[var(--ink-muted)]">
            /
          </span>
        ))}
      </div>
    )
  }
  const beatOf = slots.map((s) => Math.min(beats - 1, Math.round(s.pos * beats)))
  // Dots show the beats when a bar has more than one chord, or one chord that isn't on beat 1
  const showDots = slots.length > 1 || beatOf[0] > 0
  const segment = (span: number) => ({ flex: `${span} ${span} 0%` })
  return (
    <div data-fit className={cn("flex items-center", className)}>
      {showDots && beatOf[0] > 0 && (
        <span className="flex min-w-max items-center" style={segment(beatOf[0])}>
          <Dots count={beatOf[0]} />
        </span>
      )}
      {slots.map((slot, i) => {
        const span = (beatOf[i + 1] ?? beats) - beatOf[i]
        return (
          <span key={i} className="flex min-w-max items-center pr-1" style={segment(span)}>
            <Chord token={slot.token} />
            {showDots && <Dots count={span - 1} />}
          </span>
        )
      })}
    </div>
  )
}

// One row of bars, as cells of the song's grid (see Body)
function Row({ bars, beats, final, tail }: { bars: { pos: number; token: string }[][]; beats: number; final: boolean; tail: string }) {
  return (
    <>
      {bars.map((slots, b) => {
        const last = b === bars.length - 1
        return (
          <Bar
            key={b}
            slots={slots}
            beats={beats}
            className={cn(
              "min-h-9 overflow-hidden border-l-[1.5px] border-l-[var(--ink)] py-1 pr-2 pl-2 text-[15px] leading-none",
              last && (final ? "border-r-4 border-r-[var(--ink)] [border-right-style:double]" : "border-r-[1.5px] border-r-[var(--ink)]"),
            )}
          />
        )
      })}
      {/* Empty cells keep a short row's bars in the same columns as the others */}
      {Array.from({ length: BARS_PER_ROW - bars.length }, (_, i) => (
        <div key={`empty-${i}`} />
      ))}
      <div className="flex items-center pl-1.5 text-sm font-bold">{tail.replace(/^x(\d+)$/i, "×$1")}</div>
    </>
  )
}

// The whole song is one grid: 4 equal bar columns and a column for "x2", so the bars of every row stay
// under each other.
function Body({ items, beats }: { items: Item[]; beats: number }) {
  return (
    <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_2rem]">
      {items.map((item, idx) => {
        if (item.kind === "gap") return <div key={idx} className="col-span-full h-2" />
        if (item.kind === "section") {
          return (
            <div key={idx} className="col-span-full mb-1 mt-4 flex items-center gap-2 first:mt-0">
              <span className="bg-[var(--ink)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{item.name}</span>
              {item.note && <span className="text-xs italic text-[var(--ink-muted)]">{item.note}</span>}
            </div>
          )
        }
        if (item.kind === "text") return <p key={idx} className="col-span-full text-sm italic">{item.text}</p>
        // A blank line inside a section is a phrase break; the double bar marks the end of the section
        const next = items.slice(idx + 1).find((it) => it.kind !== "gap")
        const endsSection = !next || next.kind !== "chords"
        const rows = Math.max(1, Math.ceil(item.bars.length / BARS_PER_ROW))
        return (
          <Fragment key={idx}>
            {Array.from({ length: rows }, (_, r) => {
              const lastRow = r === rows - 1
              return (
                <Row
                  key={r}
                  bars={item.bars.slice(r * BARS_PER_ROW, (r + 1) * BARS_PER_ROW)}
                  beats={beats}
                  final={lastRow && endsSection}
                  tail={lastRow ? item.tail : ""}
                />
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}

export default function ChartPreview({ content }: { content: string }) {
  const song = useMemo(() => parseSong(content), [content])
  const beats = Math.max(1, parseInt(song.time ?? "", 10) || 4)
  const info = [song.time, song.tempo].filter(Boolean).join("   ")

  // When the bars are wider than the box (a narrow screen, crowded bars), scale them down to fit,
  // like a thumbnail of the page, instead of scrolling sideways
  const box = useRef<HTMLDivElement>(null)
  const scaled = useRef<HTMLDivElement>(null)
  const bars = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const fit = () => {
      if (!box.current || !scaled.current || !bars.current) return
      const style = getComputedStyle(box.current)
      const room = box.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      // Measure the bars' natural width without zoom, then zoom; both happen before the browser paints
      scaled.current.style.zoom = "1"
      // A bar whose chords and dots don't fit gets a smaller font, just enough to fit
      for (const bar of bars.current.querySelectorAll<HTMLElement>("[data-fit]")) {
        bar.style.fontSize = ""
        if (bar.scrollWidth > bar.clientWidth) bar.style.fontSize = `${Math.max(8, (15 * bar.clientWidth) / bar.scrollWidth)}px`
      }
      const natural = bars.current.scrollWidth
      scaled.current.style.zoom = String(natural > room ? Math.max(0.5, room / natural) : 1)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box.current!)
    return () => observer.disconnect()
  }, [song])

  return (
    <div ref={box} className="paper max-h-[70vh] min-h-[380px] overflow-auto rounded-sm p-3 sm:p-5" aria-label="Chart preview">
      {!content.trim() && <p className="py-24 text-center text-sm text-[var(--ink-muted)]">Your chart appears here as you write it.</p>}
      <div className={cn("mb-3 flex items-start justify-between gap-4 border-b border-[var(--ink)] pb-2", !content.trim() && "hidden")}>
        <div className="min-w-0">
          <div className="text-lg leading-tight font-bold break-words sm:text-xl">{song.title}</div>
          {song.structure && (
            <div className="text-xs text-[var(--ink-muted)]">{song.structure.split(/\s*,\s*/).join("  →  ")}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {song.key && <div className="font-bold">Do = {song.key.replace(/b$/, "♭").replace(/#$/, "♯")}</div>}
          {info && <div className="text-xs whitespace-pre text-[var(--ink-muted)]">{info}</div>}
        </div>
      </div>
      <div ref={scaled}>
        {/* Bars narrower than 6rem get hard to read; below that width the preview zooms out instead */}
        <div ref={bars} className="min-w-[26rem]">
          <Body items={song.items} beats={beats} />
        </div>
      </div>
    </div>
  )
}
