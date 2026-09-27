---
name: deck-edit-mode
description: Add a Canva-style visual Edit Mode to any HTML presentation/slide deck. Use this skill EVERY TIME you create, generate, or finish building an HTML presentation, slide deck, or מצגת for the user - inject the editor automatically as the final step. Also use when the user asks to "make my deck editable", "add edit mode", "הוסף מצב עריכה", "תעשה שאוכל לערוך את המצגת", or wants to move/edit/add elements in an existing HTML deck.
---

# Deck Edit Mode

Adds an in-browser visual editor to any self-contained HTML slide deck:
an "✏️ עריכה" button that lets the user drag elements, edit text inline,
paste screenshots (Cmd+V), add images/blur/shapes/textboxes, recolor text,
nudge with arrow keys, undo/redo, autosave - and save the edited file.
No server, no dependencies. Everything stays inside the single HTML file.

## When to run

1. **Automatically** - after you create or significantly rebuild any HTML
   presentation for the user, inject the editor as the last build step.
2. **On request** - when the user asks to make an existing deck editable.

## How to inject

```bash
python3 <skill-dir>/scripts/inject_editor.py path/to/deck.html
```

The script is idempotent: running it again upgrades the editor in place
(it replaces the previous editor block, never duplicates). It appends the
editor CSS before the last `</style>` and the editor JS before `</body>`.
Always keep a backup copy of the deck before the first injection.

## Deck compatibility - IMPORTANT, adapt when needed

The editor expects the common Claude-generated deck shape:

- A fixed-resolution stage container with `id="deck"` (default 1920x1080),
  scaled to fit the window with `transform: scale(...)`.
- Slides as `.slide` elements where the visible one has class `.active`.
- Optionally a global `show(n)` function for navigation and entry
  animations on `.anim` elements.

Decks are built by many different skills, so BEFORE injecting, read the
target HTML and check the structure. If it differs, adapt - the constants
live at the top of `scripts/editor.js`:

| Deck difference | What to adapt |
|---|---|
| Stage container has another id/class | In `editor.js`, change `getElementById('deck')` to match, and the two `1920` / `1080` design-resolution constants (`scale()`, guides CSS in `editor.css`) to the deck's design size |
| Slides aren't `.slide` / `.active` | Update the `.slide` / `.active` selectors in `editor.js` (`activeSlide`, `eligible`, export) |
| Full-bleed backgrounds / wrappers get selected by mistake | Add their selectors to the `DENY` list |
| A text-like element refuses double-click editing | Add its selector to the `TEXTY` list |
| Animated number counters (`[data-count]`-style) | The editor already syncs `data-count` on edit and bakes values on export; if the deck uses a different attribute, mirror that logic |
| Single-page (non-slide) presentation | Treat the whole page container as one "slide": give it class `slide active` or adapt `activeSlide()` |

After injecting, ALWAYS verify: open the file (or screenshot it headless),
confirm the deck still renders identically in present mode, the ✏️ button
appears, and edit mode opens. If anything looks broken, restore the backup.

## What the user gets (tell them after injecting)

- A small ✏️ icon docked in the corner (low-key until hover) toggles edit
  mode - deliberately compact so it doesn't get in the way when presenting.
- Click = select · drag = move (center snap-guides, Alt disables) ·
  double-click = edit text (Escape cancels)
- Cmd+C / Cmd+V copy-paste elements · paste a screenshot directly ·
  drag image files from the desktop · Cmd+D duplicate
- Add tools: image / blur / shape / circle / line / arrow / textbox ·
  ⤴ select parent group · z-order · center H/V · font size
- Text formatting (any text element, or a word selected while editing):
  bold/italic/underline, align right/center/left, font-family picker,
  line-height and letter-spacing nudges, plus the existing color swatches
  and gradient
- Per-element controls (any selected element): opacity nudge, duplicate,
  lock/unlock (blocks move/resize/delete on that element until unlocked),
  border width + color + corner radius, and a shadow toggle
- Entrance-animation controls (any selected element): pick a style
  (fade / rise / slide-in from right or left / scale-in / none), nudge
  duration and delay, and preview it in place without leaving edit mode
- Arrow keys nudge 1px (Shift = 10px) · Cmd+Z undo · Cmd+Shift+Z redo
- Autosave to the browser; a restore bar appears if work was lost
- 💾 שמור / Cmd+S downloads `<name>-edited.html` - the user replaces the
  original file with it. Backgrounds, fonts and numbers are preserved
  (URLs are absolutized and counters baked at export)

The toolbar wraps and scrolls (`max-height` + `overflow-y`) if a deck's
viewport is too short to show every row at once, so adding more controls
here is safe.

## Auto-injection for every future deck

On first install, offer the user to add this line to their project's
CLAUDE.md so the behavior survives across sessions:

```
After creating any HTML presentation, inject Edit Mode:
python3 <skill-dir>/scripts/inject_editor.py <deck.html>
```
