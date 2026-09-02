---
name: game-design-building
description: Design and build well-crafted, playable games — core loop and mechanics design, balancing, and level design, plus the technical implementation (game loop, architecture, physics, input, audio, juice, performance) for browser/HTML5 games and beyond.
version: 1.0.0
---

Instructions for designing and building a game that is actually fun to play, not just technically functional. Treat "design" and "build" as two linked passes, not one step — a game with clean code but no core-loop hook is not done, and neither is a game with a great pitch but sloppy game-feel.

## When to use

Any time the task is to create, prototype, extend, or fix a playable game: browser/HTML5 games (Canvas/WebGL/DOM), simple native or CLI games, or a game jam-style prototype. Also use it when asked to design a game concept, write a game design document (GDD), balance difficulty/economy, or diagnose why an existing game "doesn't feel good" to play.

For a specific genre with its own established skill (e.g. racing games), prefer that skill for genre mechanics and use this one for the general design/build discipline around it. For turning this discipline into a packaged SKILL.md for someone else, see the skill that generates game skills instead — this one is for building the game itself.

## Phase 1 — Design before you build

Do not start writing entity classes before the core loop is decided. Read [Design Fundamentals](design-fundamentals.md) and produce, even briefly (a few sentences per item is enough for a small project):

1. **The core loop** — the one sentence describing what the player does, over and over, in 10-30 seconds, and why it stays interesting.
2. **The player fantasy / goal** — what the player is trying to achieve and why it matters to them.
3. **The one mechanic that's the point** — the thing this game does that a generic template wouldn't. If you can't name it, the scope is too generic — ask the user or pick a concrete twist.
4. **Win/lose and progression** — how a session ends, and what carries over to the next one (score, unlocks, difficulty).

Scale the depth of this pass to the size of the ask: a "make me a quick browser game" gets a few bullet points before you start coding; an explicit "help me design a game" or "write a GDD" gets the fuller document structure in [Design Fundamentals](design-fundamentals.md).

## Phase 2 — Architecture and the game loop

Read [Architecture & Game Loop](architecture-and-game-loop.md) before writing the main loop. Get these right early — they're expensive to retrofit:

- A single authoritative game loop with a fixed or clamped timestep (never raw, unclamped `deltaTime`).
- An explicit game-state machine (menu / playing / paused / game-over), not scattered booleans.
- Entities/systems organized so adding one new object type doesn't require touching unrelated code.

## Core systems

Pull in the reference that matches what the game needs — don't implement systems the game doesn't use:

- [Physics & Collision](physics-and-collision.md) — AABB/circle collision, resolving overlaps, simple platformer or top-down physics, spatial partitioning once entity counts grow.
- [Input & Controls](input-and-controls.md) — keyboard/mouse/touch/gamepad handling, input buffering, remapping, mobile touch targets.
- [Audio & Feedback](audio-and-feedback.md) — SFX/music playback, the Web Audio unlock-on-first-interaction gotcha, mixing, mute/volume state.
- [Rendering basics](architecture-and-game-loop.md#rendering) — Canvas 2D vs. WebGL vs. DOM/CSS, camera/viewport, sprite drawing, avoiding per-frame allocation.

## Game feel

A game that runs correctly but feels flat is not finished. Read [Juice & Game Feel](juice-and-polish.md) and budget time for it — screen shake, hit-stop, particle bursts, squash/stretch, sound on every meaningful action, UI feedback. This is usually 10-20% of build time and is where "functional" becomes "fun."

## Playtesting and balance

Before calling a game done, read [Playtesting & Balancing](playtesting-and-balancing.md) and actually play it end to end, including the failure states (losing, running out of lives/resources) and the edges (first 10 seconds, and whatever the "late game" is for a short session). Tune numbers empirically — don't ship the first values you typed in.

## Performance and shipping

For anything beyond a trivial prototype, read [Performance & Shipping](performance-and-shipping.md): frame-budget discipline, object pooling, asset loading, and a save/persistence approach if the game has progression.

## Verifying the work

Per this environment's general rule for frontend/UI work: **start the game and actually play it in a browser** before reporting it done — type-checking or "the code compiles" is not evidence the game is fun or even playable. Play the golden path (a full session, win and lose) and at least one edge case (spamming input, resizing the window, losing all lives, an empty/degenerate level). If you can't run a browser in this environment, say so explicitly instead of claiming the game works.

## Recommended stack (when the user hasn't specified one)

- **2D browser game, no build step needed**: plain HTML5 Canvas + vanilla JS/TS. Simplest to run, debug, and hand off.
- **2D browser game with more entities/scenes**: a free, open-source framework — see [Free Tools & Resources](free-tools-and-resources.md) — only if the game's complexity actually warrants it; don't reach for a framework for a 5-entity prototype.
- **CLI/terminal game**: plain language stdlib + a simple render-loop with cleared screen redraws; keep input non-blocking.
- Don't default to a full 3D engine (Unity/Godot/Unreal) unless the user asks for one or the game is genuinely 3D — those need a locally running editor and aren't runnable/verifiable in most agent sessions.

## Free tools & resources

Everything this skill assumes by default is free: no paid engine license, no paid asset-generation API, no paid audio tool. See [Free Tools & Resources](free-tools-and-resources.md) for the specific free/open-source frameworks, free art/audio asset libraries, and free MCP-based editor integrations worth knowing about — and which popular tools in this space are *not* free, so you don't recommend them by default.
