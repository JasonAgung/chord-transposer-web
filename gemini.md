# How the Chord Transposer Works

This document provides a high-level overview of the Chord Transposer application's architecture and functionality. Test

## Core Functionality

The primary purpose of this application is to transpose musical chord charts from one key to another. It also provides features for converting chord notations and formatting charts for readability.

## Key Features

*   **Automatic Key Detection:** The application automatically detects the original key of a chord chart by looking for a line like `Do = C`.
*   **Transposition:** Users can select a target key, and the application will transpose all chords in the chart accordingly. It handles both sharp and flat keys.
*   **Quick Transpose:** Buttons for transposing up or down by a whole or half step.
*   **Notation Conversion:** Chord charts can be converted to different notation systems:
    *   **Roman:** (e.g., I, ii, iii)
    *   **Arabic:** (e.g., 1, 2m, 3m)
*   **Smart Formatting:** A "Smart Format" feature aligns chords and bars within the chart for better readability.
*   **PDF Export:**
    *   Export the original or transposed chart to a PDF document.
    *   Supports both **portrait** and **landscape** orientations.
    *   Landscape mode provides a two-column layout.
*   **Advanced Export:** A separate page offers more fine-grained control over the PDF export, including font size and family.
*   **Time Signature:** The application can handle both 4/4 and 3/4 time signatures, and provides templates for each.

## Technical Overview

*   **Framework:** The application is built with [Next.js](https://nextjs.org/), a React framework for building server-rendered and static web applications.
*   **Language:** The codebase is written in [TypeScript](https://www.typescriptlang.org/).
*   **UI Components:** The user interface is built using [shadcn/ui](https://ui.shadcn.com/), a collection of reusable UI components, and styled with [Tailwind CSS](https://tailwindcss.com/).
*   **State Management:** Application state (like the original and transposed charts, keys, etc.) is managed globally using [Zustand](https://github.com/pmndrs/zustand), a small, fast, and scalable state-management solution. The state is defined in `lib/store.ts`.
*   **Core Transposition Logic:** The core logic for parsing and transposing chords is located in `lib/chords.ts`. This file contains functions for:
    *   Detecting the key from content (`detectKeyFromContent`).
    *   Calculating the distance between notes (`semitoneDistance`).
    *   Shifting notes by a given number of semitones (`shiftNoteBySemitones`).
    *   Transposing individual chords and entire lines (`transposeChordToken`, `transposeChordLine`).
*   **PDF Generation:** The PDF export functionality is implemented using the [pdf-lib](https://pdf-lib.js.org/) library. The logic for creating the PDF is found in two places:
    *   `components/chord-transposer.tsx`: For the main page's "Export PDF" button.
    *   `components/pdf-preview.tsx`: For the "Advanced Export" page, which provides a live preview of the PDF.
