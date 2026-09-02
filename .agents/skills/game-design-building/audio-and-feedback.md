# Audio & Feedback

Sound is one of the cheapest, highest-leverage additions to game feel — a working sound effect on every meaningful action (hit, pickup, jump, menu select) does more for perceived polish than most visual work of equal effort. Don't leave audio for "later" on a small project; budget it in from the start.

## The autoplay-unlock gotcha

Browsers block audio (and `AudioContext`) from starting before a user gesture. Don't call `audioContext.resume()` or start music on page load — wire it to the first `pointerdown`/`keydown`/click (often the "Start Game" or "Click to play" screen most games already have):

```js
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (audioContext.state === 'suspended') audioContext.resume();
  // start background music here, if any
}
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
```

If using plain `<audio>` elements instead of Web Audio, the same rule applies to `.play()` — call it from inside the gesture handler, not before.

## Playing sound effects

For short SFX (hits, jumps, pickups), prefer the Web Audio API over `<audio>` elements — it supports low-latency overlapping playback (the same sound firing rapidly, e.g. rapid-fire pickups, without cutting itself off) and simple volume/mixing control:

```js
async function loadSound(ctx, url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return ctx.decodeAudioData(buf);
}

function playSound(ctx, buffer, { volume = 1, rate = 1 } = {}) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start(0);
}
```

Slightly randomizing pitch/rate (e.g., `rate: 0.9 + Math.random() * 0.2`) on repeated sounds (footsteps, hits) avoids the "machine-gun sameness" of an identical sample played many times in a row — a small touch that reads as noticeably more polished.

## Music

- Loop background music seamlessly (`loop = true` on an `AudioBufferSourceNode`, or a `loop`/`loopStart`/`loopEnd` region if the track has an intro that shouldn't repeat).
- Duck (lower) music volume during important SFX or dialogue if the mix feels cluttered, rather than fighting for headroom with EQ.
- Always give the player a mute/volume control, and persist the setting (see [Performance & Shipping](performance-and-shipping.md) for `localStorage` patterns) — don't make them re-mute every time they reload.

## Mixing basics

- Route SFX and music through separate gain nodes so they can be controlled independently:

```js
const musicGain = ctx.createGain();
const sfxGain = ctx.createGain();
musicGain.connect(ctx.destination);
sfxGain.connect(ctx.destination);
```

- Keep overall levels conservative — many simultaneous SFX (e.g., a screen full of explosions) can clip/distort if each plays at full volume; consider a simple cap on concurrent instances of the same sound, or scale volume down as more play at once.

## Non-audio feedback (juice touches on this too)

Audio is one channel of feedback; pair it with the others so actions feel confirmed through multiple senses at once — a hit is more satisfying with sound *and* a flash *and* a slight shake than any one alone. See [Juice & Game Feel](juice-and-polish.md) for the visual side.

## Common audio pitfalls

- Calling `audioContext.resume()` / `.play()` before any user gesture — throws or silently fails on most browsers, and is a very common "why is there no sound" bug.
- Using a single `<audio>` element for a sound that can retrigger rapidly (e.g., jump) — restarting it cuts off the previous play instead of overlapping.
- No mute control, or a mute control that doesn't persist across reloads.
- Same sample, same pitch, every time — reads as cheap even when the sound itself is well chosen.
- Forgetting to release/garbage-collect finished `AudioBufferSourceNode`s in a way that leaks — they're single-use and are automatically GC'd once stopped and disconnected, but don't hold long-lived references you keep re-triggering `start()` on (a second `start()` on the same node throws).
