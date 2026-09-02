# Design Fundamentals

Game design is a set of decisions made *before* code, because they determine what the code needs to support. Skipping this step is why generic "clone" prototypes feel lifeless even when they run correctly.

## The core loop

Every game has a core loop: the smallest repeating unit of player action → feedback → new decision. Name it explicitly:

> "The player [action], which [immediate result], which changes [state], prompting the player to [action] again because [reason it's still interesting]."

Examples:
- Breakout: hit ball with paddle → break a brick → board gets sparser and ball gets faster → tension rises.
- Roguelike: explore a room → fight/loot → get stronger or more fragile → push deeper for better reward at higher risk.

If you can't fill in "because [reason]" with something other than "because that's the game," the loop has no hook yet — that's the design problem to solve before writing any code.

## The one distinguishing mechanic

A generic game (move left/right, shoot up, dodge) is a template, not a design. Pick one mechanic that makes this game *this* game, and make sure it touches the core loop, not just flavor text:

- A twist on movement (gravity flip, momentum-only control, rewind).
- A twist on the challenge (limited resource that also does something interesting — e.g., ammo you can also use as currency).
- A twist on information (fog of war, memory-based puzzle, asymmetric knowledge).

Scope it small. One well-executed twist beats three half-implemented ones.

## Player fantasy and stakes

What is the player trying to *be* or *feel* (fast, clever, powerful, sneaky, in control against chaos)? Every system should reinforce that fantasy. If the fantasy is "precise platforming mastery," floaty physics undermines it even if the code has no bugs.

Stakes make choices matter: losing progress, running out of a resource, a timer, a leaderboard. A game with no way to lose or fail rarely sustains interest past the first minute — decide early what failure looks like and how costly it is.

## Win/lose conditions and progression

- **Session shape**: how long is one play session meant to last (10 seconds, 2 minutes, 20 minutes)? This drives pacing and how quickly difficulty should ramp.
- **End states**: what happens on win, on lose, on quit-mid-session? Each needs a UI state and usually a way to immediately retry (don't force a full reload for "try again").
- **Progression between sessions** (if any): score persistence, unlocks, difficulty scaling, meta-currency. Even a simple "beat your high score" (via `localStorage`) gives replay value almost for free.

## Difficulty and pacing

- Start easier than feels necessary — most designers overestimate how quickly a new player should face real challenge. The first 10-15 seconds should teach the core mechanic through play, not text.
- Ramp difficulty along a curve, not a cliff: track a difficulty variable (speed, spawn rate, enemy count) and increase it smoothly (e.g., as a function of score or elapsed time), rather than hard difficulty tiers that jump.
- Leave "breathing room" — brief lulls after intense moments — so players can recover and re-engage, not just escalate forever until failure.

## Level design (when relevant)

- A level should teach one new thing, or recombine known things in a new way — not just be "more of the same, but longer."
- Introduce a new mechanic/enemy/obstacle in a safe context first (no other threats nearby), then combine it with earlier mechanics once it's understood.
- For procedurally generated levels, define hard constraints first (must be solvable, must not soft-lock, minimum/maximum enemy density) before adding variety — a broken generated level is worse than a repetitive hand-made one.

## Minimal GDD structure (for an explicit design-doc request)

When asked to write a real design document rather than just prototype, use this shape — keep every section short and concrete, not aspirational marketing copy:

```
# <Game Name>

## Pitch
One or two sentences. What is it, and what's the hook?

## Core loop
The action/feedback/decision loop, named explicitly (see above).

## Controls
Input → action mapping. Keep this list short; if it's long, the scope may be too big.

## Mechanics
The systems that make up play: movement, combat/puzzle logic, resources, enemies/obstacles.
For each: what it does, and how it serves the core loop.

## Progression
What changes over a session (difficulty curve) and across sessions (persistence, unlocks).

## Win / Lose
Explicit end states and what happens at each.

## Art & audio direction
Visual style in a few words (palette, shape language) and audio mood — enough to keep asset
choices consistent, not a full art bible.

## Scope / out of scope
What's explicitly NOT in this version, so scope doesn't creep mid-build.
```

## Common design pitfalls

- **Feature creep before the core loop is fun.** Get the core loop enjoyable in the roughest possible prototype (boxes for sprites, no sound) before adding content or polish.
- **No failure state**, or failure with no cost — removes tension.
- **Difficulty that only ratchets up** with no relief, exhausting the player instead of building tension.
- **Controls that fight the fantasy** (e.g., sluggish input for a game about precision and speed).
- **Onboarding via text/tutorial screens instead of level design** — teach by making the first encounter safe, not by a wall of instructions.
