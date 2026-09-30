---
workflow: general-video
flow: automation
storyboard: no
message: "כל המשחקים, הקורסים והכלים של שימי נמצאים במגרש אחד. בוחרים ומשחקים."
destination: whatsapp-status
aspect: 1080x1920
language: he
audience: family and friends of Shimi, Hebrew speakers
length: 30s
angle: sports-broadcast
---

## Intent

A ~30s vertical Hebrew trailer for "המגרש של שימי", the launcher page in shimi0556-bit/- that
opens every game, course and tool in the repo. Chosen pitch (from five): **ערוץ הספורט של המגרש**:
the repo's projects are presented like a sports channel's evening lineup. Scoreboard, on-air
lower-thirds that land with each game ("עכשיו על המגרש: שחמט · נגד המחשב"), replay wipes,
a live bug, and a final score of 9 games · 7 courses · 4 tools.

## Assets

- assets/shots/*.jpg: 1280x800 in-game screenshots of the repo's games, captured for this video.
- Brand from the launcher page (index.html in the repo): court blue #22507a, painted-line white
  #f2f4ee, optic-yellow accent #d8eb4a, ink #0d1e2e; Karantina + IBM Plex Sans Hebrew + IBM Plex Mono.

## Customizations

- Scoreboard count-up on the final 9 / 7 / 4 (counting-dynamic-scale).
- Transition sound effects from the bundled offline SFX library (whoosh, bass impact, riser, chime).

## Notes

- Every claim comes from the repo's README / launcher. No invented features or numbers.
- No music bed: HeyGen is signed out and no local music engine is installed. SFX only.
- Hebrew, RTL. Key content stays inside the 80% title-safe box.
