# Juice & Game Feel

"Juice" is the layer of exaggerated, redundant feedback on top of correct game logic that makes actions feel impactful. A game can be logically perfect and still feel dead without it — this is usually the highest fun-per-effort work you can do once the core loop works.

The core principle: **every meaningful player action should produce feedback on more than one channel at once** (visual + audio + motion), even if each individual effect is small.

## Cheap, high-impact techniques

**Screen shake** — a few frames of camera offset on impact events (hits, explosions, landing hard). Keep it short and use decay so it doesn't feel disorienting:

```js
let shakeTime = 0, shakeMagnitude = 0;
function addShake(magnitude, duration) {
  shakeMagnitude = Math.max(shakeMagnitude, magnitude);
  shakeTime = Math.max(shakeTime, duration);
}
function updateShake(dt) {
  if (shakeTime > 0) {
    shakeTime -= dt;
    camera.offsetX = (Math.random() - 0.5) * shakeMagnitude;
    camera.offsetY = (Math.random() - 0.5) * shakeMagnitude;
  } else {
    camera.offsetX = camera.offsetY = 0;
  }
}
```

**Hit-stop / freeze frame** — briefly pause (or heavily slow) simulation for a few frames on a big hit. Cheap to add given the fixed-timestep loop (just skip calling `update()` for N frames), and reads as dramatically more impactful than the same hit with no pause.

**Squash and stretch** — scale an entity briefly on landing/collision (squash on impact, stretch on fast movement) via a simple tween back to `scale = 1`. Even a crude linear interpolation over a few frames reads well.

**Particles** — a small burst of a dozen short-lived particles on impacts, pickups, deaths. Keep particle objects trivial (position, velocity, lifetime, maybe color/size) and pool them (see [Performance & Shipping](performance-and-shipping.md)) since they're created/destroyed constantly.

**Flash / color feedback** — briefly tint a sprite white/red on taking damage (a single frame of a different draw color or a CSS-filter-like overlay) makes hits register even without reading a health bar.

**Screen/UI feedback** — number pop-ups on score/damage, a subtle scale-bounce on UI elements when they update (score ticking up, a button press), transition animations between screens instead of hard cuts.

**Anticipation and follow-through** — a tiny wind-up before an attack, and a tiny overshoot/settle after landing, borrowed from traditional animation principles — reads as more alive than instant, linear motion.

## Tuning, not just adding

Juice is easy to overdo — implement it as small, tunable parameters (shake magnitude/duration, hit-stop frames, particle count) rather than hardcoded magic numbers baked into the effect calls, so it can be dialed back if it starts feeling chaotic or nauseating rather than punchy. Playtest with the effects at half intensity and full intensity and pick based on how it actually feels, not assumption.

## Where to spend the budget

If time is limited, prioritize juice on:
1. The single most frequent player action (the thing they do dozens of times per session) — small improvements compound.
2. Win/lose moments — the emotional peaks of a session deserve the most feedback.
3. Anything that currently has *zero* feedback (an action that just silently succeeds/fails) — that's the highest-leverage gap to close first.

## Common juice pitfalls

- Adding juice before the core loop is fun — polish can't save a design that isn't interesting yet; sequence design first (see [Design Fundamentals](design-fundamentals.md)).
- Screen shake with no decay/cap — becomes disorienting or literally nauseating if multiple hits stack unbounded.
- Effects with no audio pairing (or vice versa) — the multi-channel combination is what sells the impact, not any single channel alone.
- Overusing hit-stop on frequent, low-stakes actions — it should read as special, not become the new normal pace of the game.
