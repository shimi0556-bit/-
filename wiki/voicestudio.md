# voicestudio

Agent skill (`.claude/skills/voicestudio`) for [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) — open-source local voice cloning, TTS, dubbing and transcription (646 languages, incl. Hebrew). Installed via `npx skills add debpalash/VoiceStudio --skill voicestudio -a claude-code`.

- The skill only drives a **running VoiceStudio backend** (`http://localhost:3900`, REST/MCP). The Electron app itself is not installed in the cloud container — install it on a local machine (`curl -fsSL https://voicestudio.sh/install | sh`).
- Skipped `voicestudio-maintainer` (repo-maintenance only).
- License: AGPL-3.0; models have their own licenses. Clone voices only with permission.

## Notes
- Added 2026-09-30. Related: [roboshaul-hebrew-tts](roboshaul-hebrew-tts.md) (Colab Hebrew TTS).
