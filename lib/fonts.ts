// Fonts for the PDF renderers, read from /public/fonts

export async function fetchFont(file: string): Promise<ArrayBuffer> {
  const res = await fetch(`/fonts/${file}`)
  if (!res.ok) throw new Error(`Could not load font ${file}`)
  return res.arrayBuffer()
}
