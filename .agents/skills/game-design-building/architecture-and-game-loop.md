# Architecture & Game Loop

Get the loop and the top-level structure right before adding content — they're the foundation everything else sits on, and are expensive to change later.

## The game loop

Never drive game logic straight off an unclamped `requestAnimationFrame` delta — a dropped frame (tab backgrounded, GC pause) produces a huge `deltaTime`, which can teleport objects through walls or apply a giant physics step. Clamp it, and prefer a fixed-timestep update with an accumulator so simulation is deterministic regardless of frame rate:

```js
const STEP = 1 / 60; // fixed simulation step, seconds
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  let delta = (now - lastTime) / 1000;
  lastTime = now;
  delta = Math.min(delta, 0.25); // clamp: never simulate more than 250ms in one jump

  accumulator += delta;
  while (accumulator >= STEP) {
    update(STEP); // fixed-step simulation: physics, collision, AI
    accumulator -= STEP;
  }

  render(accumulator / STEP); // pass interpolation alpha for smooth rendering between steps
}

requestAnimationFrame(frame);
```

For a simple prototype (no physics that needs determinism), a clamped variable-timestep loop is fine — just always clamp:

```js
function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  update(delta);
  render();
}
```

Pause handling: when the game is paused or the tab is hidden, stop calling `update()` (skip simulation) but keep the `requestAnimationFrame` loop alive so resuming is instant, and reset `lastTime` on resume so you don't get one huge delta.

## Game state machine

Don't scatter `isPaused`, `isGameOver`, `isMenu` booleans that can contradict each other. Use one explicit state machine:

```js
const GameState = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAME_OVER: 'gameover' };
let state = GameState.MENU;

function update(dt) {
  switch (state) {
    case GameState.PLAYING: updateGameplay(dt); break;
    case GameState.PAUSED: /* no-op, or update pause menu only */ break;
    // MENU / GAME_OVER: update their own screens if animated
  }
}
```

Transitions should be explicit functions (`startGame()`, `pauseGame()`, `endGame(reason)`) that do all the state-entry/exit work in one place (reset entities, show/hide UI, play a sound) — not inlined wherever a condition happens to be checked.

## Entity organization

Pick a structure that matches project size — don't over-engineer a 5-entity prototype, but don't let a 50-entity game grow as an unstructured pile either.

- **Small (a handful of entity types)**: plain classes/objects with an `update(dt)` and `render(ctx)` method, held in one array, iterated each frame. This is enough for most jam-scale games.
- **Medium**: group entities by type into arrays/pools (`bullets`, `enemies`, `particles`) so per-type logic (e.g., "damage all enemies overlapping bullets") is a simple nested loop, and pooling (below) is easy.
- **Larger (many interacting entity types/behaviors)**: consider an ECS-lite approach — entities are just IDs, components are plain data, systems are functions that operate on entities with a given component set. Only reach for this when composition (an entity needs an arbitrary mix of behaviors) is actually the pain point; it's overhead for a simple game.

Whatever the structure, keep a clear update order per frame: input → simulation/AI → physics/collision → cleanup (remove dead entities) → render. Removing dead entities mid-iteration is a common bug source — mark-and-sweep (flag then filter after the loop) rather than mutating the array you're iterating.

```js
entities.forEach(e => e.update(dt));
entities = entities.filter(e => !e.dead); // sweep after update, not during
```

## Rendering

- **Canvas 2D**: simplest choice for most 2D games; fine for hundreds of sprites. Batch similar draws where possible, avoid creating new objects (gradients, paths) inside the per-frame render loop — create once, reuse.
- **WebGL** (raw or via a thin helper): only reach for this if you need thousands of sprites, shader effects, or the perf headroom Canvas can't give — it's a much bigger implementation cost.
- **DOM/CSS**: viable for simple, low-entity-count games (card games, puzzle grids) where CSS transitions/animations can do the "juice" work for free; avoid for anything with many independently moving objects (layout/paint cost adds up).

Camera/viewport: even a simple game benefits from a camera offset (`{x, y}` subtracted from world coordinates before drawing) instead of moving every entity's draw position by hand — makes screen shake, following the player, and level size independent of viewport size trivial to add later.

```js
function worldToScreen(pos, camera) {
  return { x: pos.x - camera.x, y: pos.y - camera.y };
}
```

## Scenes / screens

Even a small game usually has more than one "screen": title, gameplay, pause overlay, game-over. Model each as an object with `enter()`, `update(dt)`, `render(ctx)`, `exit()`, and keep a single "current scene" reference the main loop delegates to. This avoids `if (state === 'menu') { ...menu logic mixed into the same function as gameplay... }` sprawl as the game grows.

## Common architecture pitfalls

- Unclamped delta time causing physics/collision to blow up on frame hitches.
- Game logic coupled directly to render calls (can't pause, can't run headless for tests, can't change frame rate independent of simulation rate).
- Global mutable state accessed from everywhere instead of passed explicitly — fine at jam scale, painful once the game has more than ~1 file.
- Restarting a level/game by reloading the page instead of resetting state — breaks momentum and loses any persisted meta-state you did want to keep (high score).
