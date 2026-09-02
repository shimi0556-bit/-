# Physics & Collision

Most 2D games don't need a full physics engine — a handful of correct, cheap primitives cover the large majority of cases. Reach for a physics library (Matter.js, Box2D/Planck) only when the game genuinely needs rigid-body simulation (stacking, joints, realistic rotation) — not for "player walks and jumps."

## Collision shapes and tests

**AABB (axis-aligned bounding box)** — cheapest, use for anything that doesn't need rotation (most platformers, top-down games, breakout-style games):

```js
function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
```

**Circle-circle** — cheap and good for anything roughly round (balls, particles, top-down characters):

```js
function circleOverlap(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r; // compare squared distance, avoid sqrt
}
```

**Circle-AABB** — for a ball vs. a rectangular platform/brick:

```js
function circleAabbOverlap(circle, box) {
  const closestX = Math.max(box.x, Math.min(circle.x, box.x + box.w));
  const closestY = Math.max(box.y, Math.min(circle.y, box.y + box.h));
  const dx = circle.x - closestX, dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}
```

Point-in-rect and point-in-circle are the same idea simplified — useful for click/tap hit-testing on UI or entities.

## Broad phase (only once entity counts get large)

Naive collision is O(n²) — checking every entity against every other. Fine up to a few dozen entities. Beyond that (or if profiling shows collision is the bottleneck), partition space first so you only test pairs that could plausibly overlap:

- **Spatial grid**: divide the world into fixed-size cells, bucket entities by cell each frame, only test entities sharing a cell (or neighboring cells). Simple to implement, works well for evenly distributed entities.
- **Quadtree**: better for very uneven entity density; more implementation complexity — usually not worth it below a few hundred entities.

Don't add a broad-phase structure preemptively for a game with a handful of entities — it's pure overhead there.

## Resolving overlap (not just detecting it)

Detecting a collision is half the problem — deciding what happens next is the other half:

- **Trigger** (no physical push-back): just fire a callback (pickup collected, damage dealt, goal reached) and usually remove or deactivate one side.
- **Solid collision** (should not overlap): compute the minimum translation to separate them, and move the appropriate side out. For AABB, this is the axis with the smaller overlap:

```js
function resolveAabb(mover, solid) {
  const overlapX = Math.min(mover.x + mover.w, solid.x + solid.w) - Math.max(mover.x, solid.x);
  const overlapY = Math.min(mover.y + mover.h, solid.h + solid.y) - Math.max(mover.y, solid.y);
  if (overlapX < overlapY) {
    mover.x += mover.x < solid.x ? -overlapX : overlapX;
    mover.vx = 0; // stop velocity on the resolved axis
  } else {
    mover.y += mover.y < solid.y ? -overlapY : overlapY;
    mover.vy = 0;
  }
}
```

For platformers specifically, resolve axes **separately** (move+resolve X, then move+resolve Y) rather than moving diagonally and resolving both at once — this is what prevents the classic "player gets stuck on a wall corner while falling" bug.

## Simple platformer physics

- Apply gravity as acceleration on `vy` each fixed step, clamp to a max fall speed (terminal velocity) so falls stay controllable and predictable.
- Move and collide on the X axis first, then Y — see above.
- Track "grounded" state via a collision check just below the player each frame (or via the Y-axis collision resolution itself), and only allow jumping when grounded (or during a short "coyote time" window after leaving a ledge — a few frames of forgiveness that makes platforming feel much better without being noticeable as "unfair").
- Add **jump buffering**: if the player presses jump slightly before landing, queue it for a few frames rather than dropping the input — both this and coyote time are cheap to add and meaningfully improve game feel.

## Simple top-down movement

- Normalize diagonal movement vectors so moving diagonally isn't faster than moving straight (`dx/len, dy/len` before applying speed), unless the intended movement is stick-based, which the input's magnitude already handles.
- For "steering" feel (acceleration/friction rather than instant velocity), lerp velocity toward the target each frame rather than setting it directly — makes stopping/turning feel less robotic.

## Common physics/collision pitfalls

- Testing collision every frame without clamping delta time (see [Architecture & Game Loop](architecture-and-game-loop.md)) — large deltas let fast objects tunnel through thin walls.
- Resolving X and Y together for platformers (causes corner-sticking).
- No coyote time / jump buffering — makes precise platforming feel unfairly punishing even when technically correct.
- Using `sqrt` for distance comparisons where the squared distance would do (real cost at high entity counts).
- Forgetting to clear/reset velocity on the resolved axis after a collision, causing entities to visibly vibrate against a surface.
