# Input & Controls

Controls are the player's only interface to the game's fantasy — sluggish or ambiguous input undermines even a well-designed core loop. Handle input as an explicit layer, not scattered `addEventListener` calls read directly by gameplay code.

## Decouple raw events from game actions

Read raw input into a small state object once per frame, and let gameplay code query that state — never let gameplay logic branch directly on a keydown event handler (that ties simulation timing to event timing, and makes remapping/multiple-input-source support painful).

```js
const keys = new Set();
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup', e => keys.delete(e.code));

// Gameplay code queries state, doesn't listen directly:
function readMoveInput() {
  let dx = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
  return dx;
}
```

For "just pressed this frame" (e.g., jump, fire — as opposed to "held"), track transitions explicitly rather than relying on keydown firing once, since keydown auto-repeat behavior varies and you often want this decided at your own fixed-step rate:

```js
let prevKeys = new Set();
function justPressed(code) { return keys.has(code) && !prevKeys.has(code); }
// at the end of each update: prevKeys = new Set(keys);
```

## Input buffering

For actions with tight timing windows (jump, attack, dash), buffer the input for a few frames instead of requiring a frame-perfect press:

```js
let jumpBufferFrames = 0;
const JUMP_BUFFER = 6; // frames of forgiveness

if (justPressed('Space')) jumpBufferFrames = JUMP_BUFFER;
else if (jumpBufferFrames > 0) jumpBufferFrames--;

if (jumpBufferFrames > 0 && isGrounded) {
  doJump();
  jumpBufferFrames = 0;
}
```

Combine with "coyote time" (see [Physics & Collision](physics-and-collision.md)) for the biggest game-feel improvement per line of code in any platformer.

## Mouse and pointer

Use `PointerEvent` (`pointerdown`/`pointermove`/`pointerup`) over separate mouse/touch handlers where possible — it unifies mouse, touch, and pen. Convert client coordinates to canvas/world coordinates explicitly, accounting for canvas scaling if the canvas's CSS size differs from its pixel buffer size:

```js
function getCanvasPos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}
```

## Touch / mobile

- Hit targets need to be larger than they look necessary on desktop — aim for at least ~44px effective touch target size.
- Prefer on-screen zones/virtual buttons over requiring precise multi-touch gestures, unless the game is specifically gesture-based.
- Call `event.preventDefault()` on touch handlers where needed to stop the page from scrolling/zooming during play, and set `touch-action: none` in CSS on the game canvas.
- Test that the game is playable one-handed in portrait if that's a plausible use case — don't assume landscape or two-hand play without checking the target audience.

## Gamepad

The Gamepad API (`navigator.getGamepads()`) requires polling each frame — there's no event for analog stick movement. Apply a deadzone to sticks (ignore small values near zero, since sticks rarely rest exactly at 0) before using the value:

```js
function applyDeadzone(value, deadzone = 0.15) {
  return Math.abs(value) < deadzone ? 0 : value;
}
```

## Remapping

If the game supports rebindable controls, keep a single `action -> binding` map that both the input-reading code and any settings UI read/write — never hardcode key names inside gameplay logic once remapping is a feature, or the remap UI will silently not do anything.

## Common input pitfalls

- Reading input directly inside event handlers instead of a per-frame state snapshot — causes gameplay logic to run at event-firing rate instead of the simulation rate, and makes multi-key combos unreliable.
- No input buffering on time-sensitive actions, making correct play feel unfair.
- Not handling focus loss — if the tab/window loses focus mid-keypress, the `keyup` event may never fire, leaving a key "stuck" down. Clear all held-key state on a `blur` (window) or `visibilitychange` (hidden) event.
- Forgetting canvas coordinate scaling, causing mouse/touch position to be offset from what's visually clicked.
- Assuming desktop-only input for a game that will also be played on mobile.
