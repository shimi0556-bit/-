---
name: self-improve
description: >
  Hermes-style reflection for Logan. Use after a completed or failed task to
  distill what worked, what failed, and durable lessons into long-term memory
  (MEMORY.md Lessons / Preferences). Triggers: "self improve", "reflect on
  this session", "what worked", "remember this lesson", "learn from failure".
model: tier-default
effort: medium
---

# Self-improve (Logan)

You are running Logan's **self-improve** skill (Yuval Avidani / YUV.AI).

## Goal

Turn the current session (or the last completed task) into durable lessons so
future sessions start smarter - without retraining model weights.

## Steps

1. **Summarize the task** - user goal, constraints, final outcome (success /
   partial / fail).
2. **What worked** - concrete tactics, commands, files, tool sequences that
   helped. Prefer reproducible steps.
3. **What failed** - dead ends, bad assumptions, wasted paths. Be specific.
4. **Durable lessons** - 3-7 bullets that would help on a *similar* future task.
5. **User prefs observed** - any style or process preferences the user showed.
6. **Persist**:
   - If memory tools are available: write or append to workspace/global
     `MEMORY.md` under `## Lessons` and `## Preferences` (use memory tools or
     ask the user to confirm via `/remember` for high-value prefs).
   - If memory is disabled: print the markdown block and tell the user to enable
     memory (`[memory] enabled = true` or `logan --experimental-memory`) and
     re-run, or paste into `~/.logan/memory/MEMORY.md`.
7. Offer `/flush` if a richer narrative summary should also go to session logs.

## Output format

```markdown
## Self-improve report

### Outcome
...

### What worked
- ...

### What failed
- ...

### Lessons (durable)
- ...

### User preferences noticed
- ...

### Written to memory
- path / section / or "pending enablement"
```

## Rules

- Do **not** invent failures. Only use evidence from this session.
- Prefer short, searchable lesson lines over essays.
- Never store secrets, API keys, or private tokens in MEMORY.md.
- Keep Yuval's writing rule: plain hyphen `-` only (no em/en dashes).
