# Free Assets & Tools

Free stock footage, music, and sound effects for filling out B-roll, backing tracks, and SFX — with the licensing caveat that actually matters before publishing.

## Free stock footage / B-roll (no attribution required)

- **[Pixabay](https://pixabay.com/videos/)** — large library, 4K/HD, royalty-free with no attribution required, safe for commercial use. Good default first stop.
- **[Coverr](https://coverr.co/)** — royalty-free, no attribution required, no watermarks, optimized for 4K editing.
- **[Pexels](https://www.pexels.com/videos/)** — similarly large free library, no attribution required.
- **[Mixkit](https://mixkit.co/free-stock-video/)** — smaller but well-curated library with clear licensing terms, good for a more deliberately chosen look rather than a huge undifferentiated pool.
- **[Videezy](https://www.videezy.com/)** — mix of fully free and attribution-required clips; check each clip's specific license before use (see the licensing note below).

In Remotion, bring these in exactly like any other video source — see [Embedding Videos](../remotion-markup/embedding-videos.md) for `<Video>` from `@remotion/media` (trimming, speed, volume) once a clip is downloaded and placed in the project.

## Free music and sound effects

- **[YouTube Audio Library](https://www.youtube.com/audiolibrary)** — free music and SFX, no account needed beyond a Google login, widely used and safe for YouTube specifically; check the license shown per-track (some require attribution even though the library is free) before using elsewhere.
- **[Freesound](https://freesound.org/)** — large community SFX library under various Creative Commons licenses (CC0 through CC-BY) — check the specific license on each sound.
- **[Free Sounds Library](https://www.freesoundslibrary.com/)** — free SFX, music, and ambient recordings.
- For syncing cuts to a beat (see [Pacing & Rhythm](pacing-and-rhythm.md)), pick the track *before* finalizing cut timing where possible — editing to an already-chosen track's actual beat produces a tighter result than picking music to fit cuts made without one.

## The licensing caveat that actually matters

"Free" and "no attribution required" are two different claims, and the specific license on an individual file — not a platform's general reputation — is what actually governs safe use, especially for anything monetized or used commercially:
- **CC0 / public domain**: no restrictions, no attribution needed. Safest option.
- **Royalty-free**: no ongoing per-use fee, but may still have platform-specific terms (some royalty-free libraries restrict use on certain platforms or require attribution) — read the specific terms, don't assume "royalty-free" means "unrestricted."
- **Creative Commons Attribution (CC-BY)**: free to use but requires crediting the creator, typically in the video description or on-screen — track which assets need this so it isn't missed at publish time.
- A platform's overall reputation for being "free" doesn't guarantee every individual asset on it carries the same license — verify per-file, particularly before a monetized upload, since a monetization or copyright claim traces back to the specific file's actual license, not the site's marketing.

## Tools beyond Remotion (only if the pipeline needs them)

This project's video pipeline is Remotion-first (programmatic, code-based) — most editing decisions in this skill are meant to be implemented there (see [Pacing & Rhythm](pacing-and-rhythm.md) for how rhythm decisions map to `<TransitionSeries>`). Reach for a separate tool only for something Remotion genuinely doesn't cover well:
- **Free background-noise/audio cleanup**: covered already in [Course Presenter Layout](../course-presenter-layout/presenter-source.md) (OBS audio filters) for recording-time cleanup.
- **Free captioning/transcription**: already covered via [Remotion Captions](../remotion-captions/SKILL.md) (local Whisper.cpp) — no separate paid captioning service needed.
