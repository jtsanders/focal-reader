# Focal

Focal is a browser RSVP reader. Open a PDF or EPUB and it shows the text one word at a time. The red letter stays on a fixed point so your eyes do not have to chase the line.

Files are read in the browser. Nothing is uploaded.

## Run locally

```bash
npm install
npm run dev
```

`npm install` copies the PDF.js worker and font data into `public/`. The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

## How to read

- Drop a `.pdf` or `.epub` onto the page, or use **Open**.
- **Read sample** loads a short built-in passage labeled as a sample. It does not replace PDF and EPUB import.
- **Play** / **Pause**, or the Space key. Playback starts at half the chosen speed and eases to the full speed over 3 seconds. Pause freezes at once. The next play ramps again from half speed.
- The words-per-minute control is the target speed (80–1000, default 300). Changing it while playing eases toward the new target instead of jumping. The value is remembered.
- **Back** and **Ahead** skip by the seconds shown between them (default 10, range 1–60). The skip distance is `seconds × target WPM / 60` words. Arrow keys do the same. Changing the seconds does not move your place. A skip while playing keeps the current pace.
- The progress bar scrubs through the text. Reopening a file by the same name continues where you left off. **Start over** returns to the first word and pauses; the next play ramps.
- The red letter is the pivot. Among letters and digits only, it is `floor((length - 1) / 2)`. Punctuation stays on the word. “reading” marks **d**. “hello,” marks **l**.

Small files for a quick try live in `fixtures/` (`harbor-note.pdf` and `ferry-note.epub`). Regenerate them with `npm run fixtures`.
