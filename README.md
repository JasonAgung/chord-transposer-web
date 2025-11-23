# Chord Transposer

## Overall Function

The Chord Transposer is a web application designed to simplify the process of transposing musical chord charts from one key to another. It provides tools for converting chord notations and intelligently formatting charts for optimal readability. Whether you're a musician, arranger, or songwriter, this application aims to streamline your workflow for handling chord progressions across different keys and notations.

## Key Features

*   **Automatic Key Detection:** Automatically identifies the original key of a chord chart, typically by looking for a line like `Do = C`.
*   **Transposition:** Allows users to select a target key, and the application will accurately transpose all chords in the chart, accommodating both sharp and flat keys.
*   **Quick Transpose:** Offers convenient buttons for transposing up or down by a whole or half step.
*   **Notation Conversion:** Supports conversion of chord charts to different notation systems, including:
    *   **Roman:** (e.g., I, ii, iii)
    *   **Arabic:** (e.g., 1, 2m, 3m)
*   **Smart Formatting:** Includes a "Smart Format" feature that aligns chords and bars within the chart to enhance readability.
*   **PDF Export:** Enables exporting the original or transposed chart into a PDF document, with options for portrait and landscape orientations (landscape offering a two-column layout).
*   **Advanced Export:** A dedicated page for fine-grained control over PDF export settings, such as font size and family.
*   **Time Signature Handling:** Capable of processing both 4/4 and 3/4 time signatures, with provided templates.

## Supported Chord Types

The application's robust parsing logic can process a wide array of chord notations, including:

*   **Basic Chords:** Major (e.g., C, D), Minor (e.g., Cm, Dm), 7th (e.g., C7, D7), Major 7th (e.g., CM7, Cmaj7), Minor 7th (e.g., Cm7, Dm7).
*   **Extended Chords:** 9th (e.g., C9, Cm9, CM9), 11th (e.g., C11, Cm11), 13th (e.g., C13, Cm13).
*   **Altered Chords:** Diminished (e.g., Cdim, Co), Augmented (e.g., Caug, C+), Half-diminished (e.g., Cm7b5), and other altered extensions (e.g., C7#5, C7b5, C7#9, C7b9).
*   **Special Chords:** Suspended (e.g., Csus4, Csus2), Add chords (e.g., Cadd9, Cadd11), Slash chords (e.g., C/E, G/B), Power chords (e.g., C5).

## Technical Overview

This application is built with modern web technologies:

*   **Framework:** [Next.js](https://nextjs.org/) (React framework for server-rendered and static web applications).
*   **Language:** [TypeScript](https://www.typescriptlang.org/).
*   **UI Components:** [shadcn/ui](https://ui.shadcn.com/) and styled with [Tailwind CSS](https://tailwindcss.com/).
*   **State Management:** [Zustand](https://github.com/pmndrs/zustand) (for global application state, defined in `lib/store.ts`).
*   **Core Transposition Logic:** Located in `lib/chords.ts`, handling key detection, note shifting, and chord transposition.
*   **PDF Generation:** Utilizes the [pdf-lib](https://pdf-lib.js.org/) library, with logic in `components/chord-transposer.tsx` and `components/pdf-preview.tsx`.


    The shouldUseFlats function, using FLAT_KEYS and SHARP_KEYS sets, determines the preference based on the target key. For
  natural keys, it defaults to sharps, except for 'F' which prefers flats. This preference is
  then used in shiftNoteBySemitones, which, after transposition, selects the final note from
  either the sharp or flat note array based on the preferFlats boolean. I can now clearly
  explain this to the user.Based on my analysis of lib/chords.ts, the program's choice between
  sharps and flats is based on the target key of the transposition, following standard music
  theory rules for key signatures.

  Here is a step-by-step explanation:

   1. `shouldUseFlats()` Function: The decision is primarily made by a function called
      shouldUseFlats. This function looks at the key you are transposing to.

   2. Key Signature Rules: The program has two predefined lists:
       * Flat Keys: F, Bb, Eb, Ab, Db, Gb
       * Sharp Keys: G, D, A, E, B, F#

   3. How it Decides:
       * If your target key is in the "Flat Keys" list (e.g., you are transposing to Bb), the
         output will use flats (e.g., Eb, Ab).
       * If your target key is in the "Sharp Keys" list (e.g., you are transposing to E), the
         output will use sharps (e.g., F#, C#).
       * For the key of C and other natural keys not in those lists, it defaults to using
         sharps. The one exception is the key of F, for which it prefers using a Bb over an A#.

   4. Applying the Choice: When a chord is transposed, the program calculates the new note. If
      that new note has two possible names (like C# and Db), the decision from the
      shouldUseFlats() function is used to pick the correct one for the target key's context.

  In short, the program automatically follows established music theory to make the transposed
  chord chart look clean and conventional for the key you've selected.