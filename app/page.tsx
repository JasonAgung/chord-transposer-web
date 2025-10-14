import ChordTransposer from "@/components/chord-transposer"

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-balance text-3xl font-semibold text-foreground">Chord Chart Transposer</h1>
        <p className="text-pretty mt-2 text-muted-foreground">
          Transpose chord charts, auto-align bars, convert to Nashville Numbers, and export to PDF — all in your
          browser.
        </p>
      </header>

      <ChordTransposer />
    </main>
  )
}
