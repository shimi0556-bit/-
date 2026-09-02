# Playtesting & Balancing

Code correctness and fun are different properties — verify both. A game with no bugs can still be un-fun, and a genuinely fun prototype can be undermined by a single un-tested edge case (a soft-lock, an unbeatable difficulty spike).

## Play it yourself, end to end, before calling it done

This is not optional for game work — per this environment's general rule for UI/frontend changes, start the game and actually play it in a browser rather than relying on the code compiling or type-checking cleanly. Specifically play through:

- **The golden path**: a full session from start to a natural win.
- **The failure path**: play until you actually lose (run out of lives/health/time) — this path is often less tested than winning and is where soft-locks and broken game-over states hide.
- **The first 10-15 seconds**: this is what determines whether the core mechanic reads clearly without any explanation. If it's confusing blind, it needs a design fix, not just a tutorial text box.
- **Edge cases**: spam the input as fast as possible, resize the window/canvas mid-play, pause and resume repeatedly, let the game idle for a while, try to reach 0 or negative on any resource (health, ammo, score, timer).

If the environment can't run a browser to actually play the game, say so explicitly rather than reporting the game as verified working.

## Balancing numeric systems empirically

Don't ship first-guess numbers (enemy HP, damage, spawn rates, currency costs) without checking them against actual play:

- **Track the numbers that matter** during a test session (time-to-kill an enemy, time-to-lose a life, resource income vs. spend rate) rather than eyeballing it — even a temporary `console.log` or on-screen debug overlay is enough for a prototype.
- **Change one variable at a time** when tuning — changing enemy speed and spawn rate together makes it unclear which change caused the difficulty shift.
- **Compare against the intended pacing** from the design pass (see [Design Fundamentals](design-fundamentals.md#difficulty-and-pacing)): if the target session is 60-90 seconds but average playtests end at 10 seconds, difficulty (or randomness) is miscalibrated, not "working as designed."
- **Watch for degenerate strategies**: a single dominant tactic that trivializes the intended challenge (e.g., standing in one spot beats the intended movement-based mechanic) is a balance bug even though it's not a code bug — either close the exploit or, if it's actually fun, lean into it as the real mechanic.

## Common failure modes to explicitly check for

- **Soft-locks**: a reachable state where the player can't progress, lose, or reset (e.g., a projectile pool exhausted with no way to get more, a physics object stuck in geometry).
- **Unbeatable states**: difficulty or RNG that can produce an unwinnable configuration (all obstacles spawn in the only path, resource requirement exceeds what's obtainable).
- **Score/state that doesn't reset** between sessions when it should (stale enemies, leftover particles, a UI element still showing from the previous run).
- **Off-by-one on boundaries**: the very first enemy, the very last life, exactly-zero resource — these are disproportionately likely to have bugs since they're the least-exercised code paths in casual play.

## When you can't get a human playtester

Simulate variety instead of testing one path once:
- Play multiple times with deliberately different strategies (aggressive, cautious, greedy).
- If the game has any randomness, play enough runs to see a spread of outcomes, not just one lucky/unlucky run.
- Deliberately try to "break" it: do the opposite of the obviously intended strategy and see whether that's a valid, if worse, way to play, or whether it causes an actual failure.

## Reporting playtesting results

When reporting a game as complete, state plainly what was actually played (golden path, lose path, edge cases) rather than a blanket "it works" — this matches the general principle that test/type-check success is not the same claim as "the feature works," and playing a game is the closest equivalent games have to that verification step.
