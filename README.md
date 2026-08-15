# Anki → Lingo Legend Card Importer
 
A single-file, browser-based tool that converts an Anki deck export (`.apkg`) into a CSV formatted for the Lingo Legend custom flash cards template. Everything runs client-side — your deck never leaves your browser.
 
## Features
 
- **Reads `.apkg` files directly** — unzips and parses the Anki SQLite collection in-browser (including the newer zstd-compressed collection format).
- **Note type & deck selection** — choose which note types and decks to include before mapping.
- **Per-note-type field mapping** — map each Anki field (or the deck name, or tags) onto the Lingo Legend columns, with auto-guessed matches you can override. Topic Description and Topic Type are handled separately (see below), not mapped per-note.
- **Tag support** — use a note's full tag list, just its first tag, or a specific tag as a source for any column.
  - **Tags found panel** shows every tag in the deck with a usage count before you map anything.
  - **"Make tags readable" cleanup** turns things like `topic::verb_forms` or `camelCaseTag` into `topic / verb forms` and `camel Case Tag`.
- **Topic details step** — set Topic Description and Topic Type once per topic (matching the template's rule that these only need to appear on a topic's first row).
  - Topic Type is a fixed dropdown of Lingo Legend's allowed values: `0 - Vocab`, `1 - Grammar`, `2 - Phrases`, `3 - Script`, `4 - Misc`.
  - A **bulk "apply to all"** control sets Topic Type for every topic at once, while still letting you override individual rows afterward.
- **Text cleanup** — strips Anki's HTML formatting, `[sound:...]` tags, and cloze markup; optionally extracts furigana readings (`漢字[かんじ]`) into the Pronunciation Override column.
- **Pre-export validation** — before you can download, Translation Text on every row is checked to make sure it's non-empty and 70 characters or fewer. Any problem rows are listed (with row, topic, and reason) and highlighted in the preview table; the download button stays disabled until they're fixed.
- **Preview before export** — review the generated rows, then download a ready-to-import CSV.
## Usage
 
1. In Anki, go to **File → Export…** and choose **Anki Deck Package (.apkg)**.
2. Open `anki-to-lingolegend.html` in a browser (just double-click it — no server or install needed).
3. Upload the `.apkg` file.
4. Select the note types and decks to include.
5. Map each note type's fields to the Lingo Legend columns.
6. Fill in Topic Description / Topic Type per topic (or use "apply to all" for Topic Type).
7. Review the preview, resolve any flagged Translation Text issues, and download the CSV.
## Requirements
 
- A modern desktop or mobile browser.

## Known limitations
 
- If a deck uses the newest zstd-compressed collection format and the decompression library can't load (e.g. you're offline), you'll see an error. Re-exporting from Anki with legacy/older-version support enabled avoids this.
- Tag and HTML cleanup are heuristic — worth spot-checking the preview table on messy or heavily formatted decks before downloading.
- Validation currently checks Translation Text only (must be present, ≤70 characters), matching Lingo Legend's known constraint on that field.
## Issues
 
Run into a problem? [Open an issue on GitHub](https://github.com/a-l-clark/anki-to-lingolegend/issues).
 
## Credits
 
Built with [Claude](https://claude.ai) (Anthropic).
