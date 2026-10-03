# screencast-notes

Chrome extension (Manifest V3) for screen recording + screenshots, with a
floating notepad injected into every page. The notepad can hold several
tabs (like Artifact's tab switcher) — notes are saved per page (keyed by
`origin+pathname+search`), so returning to the exact same page brings back
the same tabs and content, pinned in a fixed corner. You can switch tabs
mid-recording and the text is debounce-saved as you type.

- **Source:** local original, built in this repo.
- **Run:** `chrome://extensions` → Developer mode → Load unpacked → select this folder.

## Architecture

- `background.js` (MV3 service worker) — owns recording lifecycle
  (`chrome.desktopCapture.chooseDesktopMedia` to pick a source) and
  screenshots (`chrome.tabs.captureVisibleTab`), both triggered by runtime
  messages from the popup or the injected widget.
- `offscreen.html`/`offscreen.js` — the actual `getUserMedia` +
  `MediaRecorder` capture runs here, since MV3 service workers have no DOM.
  Background creates/destroys this offscreen document around each
  recording and relays the final blob (as a data URL) back for
  `chrome.downloads.download`.
- `content.js`/`content.css` — injected on `<all_urls>`; renders the fixed
  floating widget and the tabbed notes. State lives in
  `chrome.storage.local` under `scn_notes::<pageKey>`, with a
  `storage.onChanged` listener so the same URL open in two tabs stays in
  sync.
- `popup.html`/`popup.js` — mirrors the record/screenshot controls for
  when the floating widget is hidden or collapsed.

## Notes

- Built per explicit user request (Hebrew): record/screenshot + a
  per-page notepad with tabs that persist when returning to the same URL.
  Clarified via AskUserQuestion that notes should pin to a **fixed corner**
  of the page (not a draggable x/y position) — simpler to implement and
  matches "פתק צף" (floating sticky note) rather than a freeform canvas.
- Page identity for notes is `location.origin + pathname + search` (hash
  dropped, since it's usually just a scroll anchor/SPA route fragment, not
  a distinct "page" the user means to pin notes to). If this turns out
  wrong for SPA-heavy sites (hash routing), revisit.
- Not yet tested by loading into an actual Chrome instance (no browser
  available in this environment) — files pass `node --check` and the
  manifest parses as valid JSON, but the extension itself is unverified
  end-to-end. Flag this to the user; test with Load Unpacked before
  relying on it.
