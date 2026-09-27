# obsidian-course

Self-contained interactive Hebrew course (single `index.html`, no build) teaching Obsidian — the Markdown-based linked-notes app. 3 levels × 7 lessons (21 total), a quiz per lesson, printable keyboard-shortcut cheat sheet, an 80%-threshold final exam, and a printable completion certificate. Progress persists per-viewer via `localStorage`.

- **Built with:** the `interactive-course-builder` skill (`.claude/skills`), copying its fixed `template.html` engine.
- **Run:** open `obsidian-course/index.html` directly in a browser.
- **Context:** built after a static (non-interactive) version of the same course was published earlier as a Claude Artifact — the user asked specifically for the `interactive-course-builder` skill's version instead, which adds progress tracking, quizzes, a final exam and a certificate that the static Artifact didn't have.

## Notes

- Verified with an actual headless-browser walkthrough (Playwright + the repo's own bundled Chromium) before delivery, per the skill's mandatory test steps: navigation via sidebar/next-buttons, quiz answer + explanation display, auto-mark-done on a correct answer, the critical back-button behavior (`history.replaceState` — one browser-back press must exit the course, not step backward through lessons), final-exam scoring, and the certificate gate (blocked until all 21 lessons are marked done, opens correctly at 100%). All passed.
- One lesson (module 3) is dedicated to the concrete scenario that motivated this course: opening this repo's own `wiki/` folder as an Obsidian vault.
