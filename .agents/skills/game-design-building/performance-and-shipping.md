# Performance & Shipping

Most small games never hit a real performance ceiling, but a few habits prevent the common causes of jank, and a few more make a prototype into something that can actually be handed off or shared.

## Object pooling

Creating and destroying many short-lived objects per frame (bullets, particles, damage numbers) triggers frequent garbage collection, which shows up as periodic frame hitches — exactly the kind of stutter that's most noticeable during fast action. Pool instead of allocate/discard:

```js
class Pool {
  constructor(factory, size) {
    this.factory = factory;
    this.items = Array.from({ length: size }, factory);
    this.active = [];
  }
  spawn(init) {
    const item = this.items.find(i => !i.alive) ?? this.factory();
    item.alive = true;
    init(item);
    this.active.push(item);
    return item;
  }
  update(dt) {
    this.active = this.active.filter(i => i.alive);
    this.active.forEach(i => i.update(dt));
  }
}
```

Reserve pooling for things spawned frequently (particles, projectiles). Don't pool one-off objects like the player or a boss — that's unnecessary complexity for something created once.

## Avoiding per-frame allocation

Beyond entities, watch for hidden allocation inside the render/update loop: creating new arrays, objects, or closures every frame (`entities.map(...)` for a value you could compute in place, a new gradient/path object per draw call, a `.bind()` inside a loop). These are individually cheap but add up under GC pressure at 60fps. Hoist anything that doesn't need to be recreated out of the hot loop.

## Asset loading

- Preload images/audio before starting gameplay (show a simple loading state) rather than loading on first use, which causes a visible pop-in or a missing sound the first time it's needed.
- For a small game, a simple `Promise.all` over an asset list is enough — don't build a full asset-management system for a dozen files.

```js
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
async function loadAssets(manifest) {
  const entries = await Promise.all(
    Object.entries(manifest).map(async ([key, src]) => [key, await loadImage(src)])
  );
  return Object.fromEntries(entries);
}
```

## Frame-budget discipline

At 60fps, the whole frame (input + update + render) has ~16.6ms. If a game starts to stutter, profile before guessing — the browser DevTools Performance tab will show whether time is going to scripting (a specific hot function), rendering/paint, or GC, rather than assuming it's "too many entities" when it might be one accidental O(n²) loop or an allocation pattern.

## Persistence / save systems

For anything with progression (high score, unlocks, settings), `localStorage` is enough for a browser game — don't reach for a backend unless the game genuinely needs cross-device sync or a leaderboard shared between players:

```js
function saveState(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage full/unavailable — fail silently, don't crash the game */ }
}
function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
```

Version the saved shape (a `version` field in the saved object) if the game is likely to change its save format later, so old saves can be migrated or safely discarded instead of crashing on load.

## Responsive canvas sizing

Handle window resize explicitly rather than assuming a fixed canvas size, especially for anything meant to be played on varied screens:

```js
function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); // keep drawing in CSS pixel coordinates
}
window.addEventListener('resize', () => resizeCanvas(canvas));
```

Decide deliberately whether the game world scales with the viewport (letterbox to a fixed aspect ratio is usually simplest and keeps gameplay fair/consistent) rather than letting entity sizes and speeds silently depend on window size.

## Shipping checklist for a small game

- Playable end to end per [Playtesting & Balancing](playtesting-and-balancing.md).
- No console errors during normal play.
- Assets preloaded, no visible pop-in.
- Mute/volume control present and persisted.
- Handles window resize and tab-blur/focus-return without breaking (see [Architecture & Game Loop](architecture-and-game-loop.md#the-game-loop) for pause-on-hidden handling).
- A visible way to restart without a full page reload.
