---
workflow: general-video
flow: automation
storyboard: no
message: "Meet Claude: a friendly spark mascot walks you through what Claude can actually do — write and reason, code, see, remember a lot, use real tools, and stay safe."
aspect: 1920x1080
language: en
angle: mascot-led explainer
---

## Intent

A fun, creative explainer about Claude (Anthropic's AI assistant) for general
curious viewers. A recurring animated mascot — "the Spark" — narrates nine short
beats, one per capability, in a warm, playful, slightly witty voice. Ported from
an existing hand-built HTML deck (see `## Notes`) that already nailed the visual
identity; this video keeps that identity but replaces the on-page typed captions
with real spoken narration and HyperFrames-native motion.

## Assets

- /tmp/claude-0/-home-user--/7f2cdb3e-3151-5e74-99b9-97b01d12e013/scratchpad/claude-deck.html — the source HTML deck. Reuse its structure, per-scene copy/narration lines, and design tokens (do not re-derive them from scratch).

## Notes

- Design tokens to carry over exactly:
  - Colors: bg #15141B (ink, dark), accent #FF6B4A (ember), accent-2 #4FD8C4 (teal), ink text #F4F1EC on dark.
  - Type: Frank Ruhl Libre (display/headlines), Heebo (body/UI), IBM Plex Mono (stats/labels).
  - Mascot: "the Spark" — a soft rounded blob/flame shape in the ember gradient, two simple dot eyes that blink, a mouth that animates while it talks. Recurring in-frame across all nine scenes.
- Narration language had to move from the original Hebrew to English: the only free/offline local voice engine available (Kokoro, via `hyperframes tts`) does not support Hebrew, and this project has no HeyGen account for cloud Hebrew voices. On-screen text is English throughout for consistency with the audio (not a Hebrew deck with English voiceover).
- Nine beats/scenes, same order and content as the source deck:
  1. Hero/intro — "Claude is not just another chatbot"
  2. Anthropic & mission — Helpful / Honest / Harmless
  3. Writing & extended thinking
  4. Coding & agents (Claude Code) — callable-out: two MCP servers (Resolume + DALL·E) were built earlier in this same session
  5. Vision & multimodal understanding
  6. Long context / memory within a conversation
  7. Tools & MCP (Model Context Protocol)
  8. Safety (Constitutional AI, red-teaming, alignment research)
  9. Wrap-up / CTA (claude.ai, Claude Code)
- No storyboard review requested — build straight to a finished rendered MP4.
