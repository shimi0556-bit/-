# Presenter Source

Decide, per lesson, where the "you talking" footage comes from. Both paths end at the same place — an MP4/WebM of a talking presenter — so the choice doesn't lock in the rest of the pipeline.

## Option A — Real webcam recording (free)

Best when the presenter's actual face/voice matters (personal brand, tutorials where trust in a real person helps) and recording is feasible.

**Capture, free tools:**
- **[OBS Studio](https://obsproject.com/)** — free, open-source, cross-platform. Records webcam + microphone (and screen, if the lesson also needs a raw screen-record layer) to a video file. The most flexible free choice — scenes, filters, and plugins — at the cost of some setup complexity.
- **[Cap](https://cap.so/)** — free, open-source, cross-platform Loom-style recorder. Local recording is free with no watermark and no length cap; a much faster path than OBS to a plain webcam-only clip when the lesson doesn't need OBS's scene/filter setup. Good default when OBS feels like overkill for "just record my face talking."
- Record the presenter **alone, webcam-only** — not a composited screen-recording-plus-webcam-bubble output (the kind Loom/Cap produce when screen-sharing is enabled). This skill's content side is authored directly in Remotion (see [Layout Patterns](layout-patterns.md)), not screen-captured, so a pre-composited screen+webcam recording can't be repositioned, resized, or circle-cropped afterward — it's baked in. Keep screen-recording features off and capture only the webcam feed.
- **Background removal without a physical green screen** — free OBS plugins exist that do ML-based portrait segmentation (e.g. a "Virtual Background"/"Portrait Segmentation" style plugin) so the presenter can be composited onto a solid color or transparent background without needing studio lighting or a real backdrop. Quality is good enough for a course video, not broadcast-grade — acceptable trade-off for free.
- If a plain background (a wall, a plain sheet) is available, a real chroma-key isn't necessary at all — even a non-green plain background can often be keyed well enough with the same segmentation plugins, or simply left in and framed tightly.

**Delivery aid — free teleprompters:** reading from a script (rather than improvising) makes it far easier to keep pacing consistent and to know in advance which line lands on which content beat (see Step 3 of the main skill). Free options: **[Teleprompter.com](https://www.teleprompter.com/)** (web-based, cloud script storage, voice-driven auto-scroll) and **[CuePrompter](https://cueprompter.com/)** (free, no login, browser-only). Not required for a short, casual lesson — worth using once a lesson has more than a couple of scripted beats to hit.

**Bringing it into Remotion:**
- Export/record to MP4 or WebM, place it with `staticFile()` (small/short files) or reference it directly for larger files — see [Embedding Videos](../remotion-markup/embedding-videos.md) for the full `<Video>` API (trimming, volume, speed).
- If the background wasn't removed at capture time, it can still be masked in code with a CSS `clip-path` (circle/rounded-rect) per [Layout Patterns](layout-patterns.md) — this hides the background without needing to key it out, at the cost of cropping rather than true removal. For a full green-screen key inside Remotion itself, a chroma-key shader/effect package is a heavier addition — only reach for it if a hard mask or plugin-based removal isn't good enough.

**Recording basics that matter more than any tool choice:**
- Audio quality matters more than video quality for a course — viewers tolerate mediocre webcam video far more than they tolerate bad audio. Prioritize a decent microphone (even a basic USB mic) over camera quality.
- Consistent framing/lighting across a whole lesson (don't recompose the shot mid-lesson) makes editing and layout placement predictable.

**Captions are already covered, and already free**: [Remotion Captions](../remotion-captions/SKILL.md) transcribes with Whisper.cpp locally via `@remotion/install-whisper-cpp` — free and offline, no paid captioning service needed for either presenter source.

## Option B — AI avatar narration (free tier is limited; paid beyond that)

Best when there's no real recording available, when the presenter wants to iterate on a script quickly without re-recording, or when producing many short lessons where re-recording each edit is costly.

- **[HeyGen HyperFrames](https://app.heygen.com/)** is available as an MCP integration in this environment (a `HyperFrames_by_HeyGen` server) — it can take a script and produce an avatar video narrating it, and separately compose/render HTML-based video projects. Useful for generating the "presenter talking" clip from text without a real recording.
- **Free tier reality check** (as of 2026): HeyGen's free plan is capped at 3 videos per month, each up to about 1 minute, and includes a watermark. That's enough to prototype the format and validate a single short lesson, but not enough to produce a full free course — budget for a paid plan (or real webcam recording, which stays free) once the course is longer than a couple of short lessons.
- Other AI avatar/talking-head services (Synthesia, D-ID, and similar) exist but are paid products, not evaluated here — HeyGen is called out specifically because it's already reachable as an MCP tool in this environment.
- Treat the avatar clip exactly like a webcam recording once it's exported as MP4/WebM: place it with the same [Layout Patterns](layout-patterns.md), caption it the same way, and time content reveals to its narration the same way (Step 3 in the main skill).

## Choosing between them for a course

- **Mixed is fine and common**: e.g. a real recorded intro/outro for the personal touch, AI avatar for fast-turnaround body lessons, or vice versa. Nothing downstream needs to know which source a given clip came from.
- Default to real webcam recording when the presenter is willing and able to record — it's free with no usage cap and generally reads as more authentic for a course.
- Default to AI avatar only for a specific need (fast iteration, no recording setup, generating many short variants of a script) and plan around the free tier's real limits rather than assuming it scales for free.
