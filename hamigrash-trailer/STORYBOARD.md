---
format: 1080x1920
duration: 30s
message: כל המשחקים, הקורסים והכלים של שימי נמצאים במגרש אחד. בוחרים ומשחקים.
arc: Cold open → Main event → Tonight's board → Replays → League table → Final score
audience: family and friends of Shimi, Hebrew speakers
mode: autonomous
---

Monolithic build: every frame is a `.scene` inside `index.html` (catalog scene template),
with one paused timeline. Persistent broadcast chrome sits above the scenes: the channel
bug with a live dot, a clock driven by timeline time, and a left→right RTL news ticker.
Primary transition: staggered colour blocks in yellow and ink (sports energy). Accent: a
vertical push into the replays.

## Frame 1 — Cold open
- scene: Court lines paint themselves, the LIVE bug pops, "אנחנו על המגרש" lands on the half-court line
- duration: 4s
- poster: 3.2s
- transition_in: cut
- status: animated
- src: index.html
- blueprint: logo-assemble-lockup (outline draws on → wordmark)
- rules: svg-path-draw, spring-pop-entrance, waterfall-entry

## Frame 2 — Main event: Shimotron Rally
- scene: Broadcast monitor holds the Shimotron Rally world map with a slow push; the title slams under it with a stat strip
- duration: 5.6s
- poster: 7.5s
- transition_in: wipe (staggered blocks)
- status: animated
- src: index.html
- blueprint: device-surface-showcase (static hold + push)
- rules: multi-phase-camera, kinetic-beat-slam, waterfall-entry

## Frame 3 — Tonight's board
- scene: Pinned monitor and lower-third frame; the screen and chip hard-cut through chess, reversi, go and generals
- duration: 5.8s
- poster: 12.5s
- transition_in: wipe (staggered blocks)
- status: animated
- src: index.html
- blueprint: fixed-anchor-cycle (sub-shape A, steady stepping)
- rules: discrete-text-sequence, spring-pop-entrance

## Frame 4 — Replays
- scene: Full-bleed centre crops of bowling, snake, ABYSS and SkyHawk, each with a push-in and a "שידור חוזר" bug
- duration: 5.6s
- poster: 18s
- transition_in: vertical push
- status: animated
- src: index.html
- rules: multi-phase-camera, discrete-text-sequence

## Frame 5 — League table
- scene: The seven courses assemble as a league table (course · lessons · stages), then the four tools join as chips
- duration: 5.2s
- poster: 24.5s
- transition_in: wipe (staggered blocks)
- status: animated
- src: index.html
- blueprint: grid-card-assemble (vertical list cascade)
- rules: waterfall-entry, spring-pop-entrance

## Frame 6 — Final score
- scene: Scoreboard counts up 9 · 7 · 4, the centre circle redraws, "המגרש של שימי" holds, then fades out
- duration: 3.8s
- poster: 29s
- transition_in: wipe (staggered blocks)
- status: animated
- src: index.html
- blueprint: dataviz-countup + titlecard-reveal
- rules: counting-dynamic-scale, svg-path-draw
