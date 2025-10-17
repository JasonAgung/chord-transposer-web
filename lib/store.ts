import { create } from 'zustand'

interface AppState {
  original: string
  transposed: string
  currentKey: string
  targetKey: string
  title: string
  orientation: "portrait" | "landscape"
  numbersStyle: "default" | "roman" | "arabic"
  timeSignature: "4/4" | "3/4"
  setOriginal: (original: string) => void
  setTransposed: (transposed: string) => void
  setCurrentKey: (currentKey: string) => void
  setTargetKey: (targetKey: string) => void
  setTitle: (title: string) => void
  setOrientation: (orientation: "portrait" | "landscape") => void
  setNumbersStyle: (numbersStyle: "default" | "roman" | "arabic") => void
  setTimeSignature: (timeSignature: "4/4" | "3/4") => void
}

export const useStore = create<AppState>((set) => ({
  original: `[Song Number]. [Song Title] ([Source/Book Reference])
Do = C
Time Signature = 4/4
Tempo (1/4) = 100 BPM
Structure = Intro, Verse, Chorus

Intro :
| C . . . | F . . . | G . . . | C . . . |

Verse :
| C . . . | Am . . . | F . . . | G . . . |
| C . . . | Am . . . | F . . . | G . . . |

Chorus :
| F . . . | G . . . | C . . . | C . . . |
| F . . . | G . . . | C . . . | C . . . |`,
  transposed: "",
  currentKey: "",
  targetKey: "",
  title: "Chord Chart",
  orientation: "portrait",
  numbersStyle: "default",
  timeSignature: "4/4",
  setOriginal: (original) => set({ original }),
  setTransposed: (transposed) => set({ transposed }),
  setCurrentKey: (currentKey) => set({ currentKey }),
  setTargetKey: (targetKey) => set({ targetKey }),
  setTitle: (title) => set({ title }),
  setOrientation: (orientation) => set({ orientation }),
  setNumbersStyle: (numbersStyle) => set({ numbersStyle }),
  setTimeSignature: (timeSignature) => set({ timeSignature }),
}))
