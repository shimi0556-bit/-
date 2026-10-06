# playground (המגרש)

The repo's front door: `index.html` at the root is a Hebrew (RTL) launcher that opens every browser-playable project in an in-page full-screen player (a same-origin `<iframe>`). Supporting files are in `playground/`.

## What's in it

- **Games (10):** Shimotron Rally (featured), Iron Hawk (נץ הברזל), chess, reversi, go, generals, neon snake, Strike Lane bowling, ABYSS submarine, SkyHawk.
- **Courses (7):** VS Code, PowerPoint, Excel, Gmail, Windows, Canva, Obsidian.
- **Tools (5):** Shimotron editor, guitar-fx-mixer, Claude Spark Engine, the `deck-edit-mode` demo deck, the daily 3D library (gallery; needs internet for three.js).
- Left out because they need a build step, a server or API keys: `tuning-numbers`, `virtual-typewriter`, `blitzai`, `nano-banana-ui`, `gods-eye-view`, `claude-demo-video`. `effects-yuv-ai` is left out too: it's hoodini's brand catalog, with analytics and social links.

## How it works

- Every card comes from the `ITEMS` array in `index.html`'s script (`id`, `kind`, `title`, `path`, `desc`, `tags`/`lessons`, optional `note`/`online`). The featured Shimotron block is static HTML above it.
- Thumbnail for item `id` = `playground/thumbs/<id>.jpg` (640×400 JPEG).
- `#<id>` in the URL opens that item directly (e.g. `index.html#chess`).
- The last-opened item is remembered in `localStorage` (`hub:last`) and marked on its card.
- The design is a top-down sports court: court-blue surface, white painted lines, a centre circle around the title, optic-yellow accent. Fonts: Karantina (display), IBM Plex Sans Hebrew (body), IBM Plex Mono (numbers). Offline, they fall back to system fonts.

## Adding a project

1. Add an entry to `ITEMS` in `index.html`.
2. Add the item's id to the list in `playground/make-thumbs.cjs` and run `node playground/make-thumbs.cjs - <id>` (needs Playwright). In a sandbox where cdnjs is blocked, pass a local three r128 file instead of `-`.
3. For the claude.ai Artifact copy: `python3 playground/artifact-copy.py /tmp/hub.html`, then publish that file with every project file mapped under `files` (same relative paths).

## Notes

- **2026-09-27, first version.** Published as a private claude.ai Artifact (https://claude.ai/artifact/LPGyaJtbzfcAVTA46K8Z6y) with all 20 projects bundled (~10MB), so they're playable from the link.
- Bug found while building it: `.player { display: flex }` overrode the `hidden` attribute when the file was opened locally, so the empty player covered the page. The Artifact skeleton has its own `[hidden]` reset, which is why this only showed up locally. Fixed with `[hidden] { display: none !important; }` in the page's own CSS. Keep that rule.
- `guitar-fx-mixer` needs `getUserMedia`, and the Artifact frame refuses microphone access. The card says to open the file from the repo in Chrome instead.
- ABYSS and SkyHawk load three r128 from cdnjs. That works in the Artifact (cdnjs is on its allowlist) and online, but not from a local file with no internet.
- Open: Esc closes the player only while focus is on the hub page. Once focus is inside a game's iframe, the key goes to the game, so use the "חזרה למגרש" button.
- **2026-10-01:** added the `library3d` card (the daily 3D library gallery). Its thumbnail is the Beast model rendered in `?shot=1` mode at 640×400.
- **2026-10-06:** added the `ironhawk` card (Iron Hawk 3D, `iron-hawk-3d/index.html`), placed before chess. Its thumbnail is the title screen captured by `make-thumbs.cjs` after a 20s wait (the game builds its world on load). The game is fully offline, no CDN. Not yet added to the claude.ai Artifact copy.
