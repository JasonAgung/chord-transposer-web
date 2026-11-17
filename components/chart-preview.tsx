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

// The chords of a bar that isn't crowded. Each chord spans from its beat to the next chord, with dots for
// the empty beats after it; dots that don't fit beside a long chord are left out, so they never cover it.
function BarSpans({ cells, beats, dots }: { cells: (string | null)[]; beats: number; dots: boolean }) {
  const chordBeats = cells.flatMap((c, i) => (c ? [i] : []))
  const Dots = ({ count }: { count: number }) =>
    dots && count > 0 ? (
      <span className="flex h-[1.2em] min-w-0 flex-1 flex-wrap items-center justify-around overflow-hidden pl-1 text-[var(--ink-muted)]">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="px-0.5 leading-[1.2em]">
            •
          </span>
        ))}
      </span>
    ) : null
  return (
    <>
      {/* Empty beats before the first chord */}
      {chordBeats[0] > 0 && (
        <span className="flex min-w-0 items-center" style={{ gridColumn: `1 / ${chordBeats[0] + 1}` }}>
          <Dots count={chordBeats[0]} />
        </span>
      )}
      {chordBeats.map((beat, k) => {
        const next = chordBeats[k + 1] ?? beats
        return (
          <span key={beat} className="flex min-w-0 items-center pr-1.5 leading-none" style={{ gridColumn: `${beat + 1} / ${next + 1}` }}>
            <Chord token={cells[beat]!} />
            <Dots count={next - beat - 1} />
          </span>
        )
      })}
    </>
  )
}

// One row of bars, as cells of the song's grid (see Body)
function Row({ bars, beats, final, tail }: { bars: { pos: number; token: string }[][]; beats: number; final: boolean; tail: string }) {
  return (
    <>
      {bars.map((slots, b) => {
        const last = b === bars.length - 1
        const cells: (string | null)[] = Array(beats).fill(null)
        for (const s of slots) cells[Math.min(beats - 1, Math.round(s.pos * beats))] = s.token
        // Beats share the bar evenly, and a long chord runs into the empty beat after it. When chords sit on
        // beats next to each other, the chords get smaller and the beats take their width, so they don't overlap.
        const crowded = cells.some((c, i) => c && cells[i + 1])
        return (
          <div
            key={b}
            data-crowded={crowded || undefined}
            className={cn(
              "grid min-h-9 items-center border-l-[1.5px] border-l-[var(--ink)] py-1 pl-2",
              crowded ? "pr-1 text-[13px]" : "pr-3 text-[15px]",
              last && (final ? "border-r-4 border-r-[var(--ink)] [border-right-style:double]" : "border-r-[1.5px] border-r-[var(--ink)]"),
            )}
            style={{ gridTemplateColumns: crowded ? `repeat(${cells.filter(Boolean).length}, auto)` : `repeat(${beats}, minmax(0, 1fr))` }}
          >
            {crowded || slots.length === 0 ? (
              cells.map((token, i) =>
                // A crowded bar leaves out the dots on empty beats to make room for its chords
                crowded && !token ? null : (
                  <span key={i} className={cn("whitespace-nowrap leading-none", crowded ? "pr-1" : "pr-1.5")}>
                    {token ? <Chord token={token} /> : <span className="text-[var(--ink-muted)]">/</span>}
                  </span>
                ),
              )
            ) : (
              <BarSpans cells={cells} beats={beats} dots={slots.length > 1} />
            )}
          </div>
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
      // A crowded bar whose chords still don't fit gets a smaller font, just enough to fit
      for (const bar of bars.current.querySelectorAll<HTMLElement>("[data-crowded]")) {
        bar.style.fontSize = ""
        if (bar.scrollWidth > bar.clientWidth) bar.style.fontSize = `${Math.max(10, (13 * bar.clientWidth) / bar.scrollWidth)}px`
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
