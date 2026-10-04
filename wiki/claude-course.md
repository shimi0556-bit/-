# claude-course

Self-contained interactive Hebrew course (single `index.html`, no build) teaching Claude (Anthropic's AI assistant) — claude.ai, prompting, Projects/Artifacts, the model lineup, Claude Code, the API, MCP/Tool use, and a closing comparison to ChatGPT/Gemini. 3 levels × lessons (22 total), a quiz per lesson, printable keyboard-shortcut cheat sheet, an 80%-threshold final exam, and a printable completion certificate. Progress persists per-viewer via `localStorage` (key prefix `claude_course_*`).

- **Built with:** the `interactive-course-builder` skill (`.agents/skills`, symlinked into `.claude/skills`), copying its fixed `template.html` engine unchanged.
- **Run:** open `claude-course/index.html` directly in a browser.
- **Context:** built at the user's request as a first pass specifically so they could review it and point out what needs improving in the `interactive-course-builder` skill itself — i.e. this course doubles as a review artifact for the skill, not just a standalone deliverable.
- **Brand color:** `#D97757` (Claude's clay/terracotta brand color), not reused from any other course in the repo.

## Notes

- Verified with an actual headless-browser walkthrough (Playwright + the repo's bundled Chromium) before delivery, per the skill's mandatory test steps: `node --check` on the extracted JS, sidebar/next-button navigation, a quiz answer + explanation render, the critical back-button behavior (one browser-back press exits the course rather than stepping back through lesson history), full final-exam scoring (22/22 questions), and the certificate gate (blocked until all 22 lessons are marked done in `localStorage`, opens correctly once they are).
- Did **not** run the `deck-edit-mode` injector on this file, despite the repo-wide CLAUDE.md rule to inject Edit Mode after "any HTML presentation." A course built by `interactive-course-builder` is an interactive app (routing, quizzes, a progress/cert gate), not a slide deck — `deck-edit-mode`'s drag/edit UI is designed for static slide elements and doesn't fit this content type. Injected it once to check, confirmed it didn't break anything but added no real value here, then stripped it back out before delivery. If this distinction ever needs revisiting, it's worth calling out explicitly in `CLAUDE.md` rather than re-deciding it ad hoc next time.
- Last module ends with a sibling-tool comparison (ChatGPT, Gemini) per the skill's rule for topics with visually-similar competitors.
