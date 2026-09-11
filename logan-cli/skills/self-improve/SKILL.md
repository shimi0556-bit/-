---
name: self-improve
description: >
  Visibility into Logan self-healing and self-improving. Show what was analyzed,
  what improved, how, and why. Journal durable lessons. Trigger: /improve,
  /heal, /reflections, "what did you learn", "why did you decide that".
---

# Self-improve / self-heal visibility

Logan should not only learn quietly - **you must be able to see and steer it**.

## User commands

| Command | What you get |
| --- | --- |
| `/improve` | Full improve dashboard: modes, recent reflections, lessons, open questions |
| `/improve why` | Explain last non-trivial decision path (tools + rationale) |
| `/improve log` | Tail of `reflections.log` + `IMPROVEMENTS.md` |
| `/heal` | Alias focused on failures: what broke, fix applied, prevention |
| `/reflections` | Alias for improve log |
| `/flush` | Rich session summary → memory (existing) |
| `/memory on` | Enable memory this session |

## Files (operators)

| Path | Role |
| --- | --- |
| `~/.logan/memory/reflections.log` | One-line firehose of hook events |
| `~/.logan/memory/IMPROVEMENTS.md` | Structured improve journal |
| `~/.logan/memory/MEMORY.md` | Preferences + Lessons + Auto reflections |
| `~/.logan/memory/PROFILE.md` | Whoami identity |

## When you improve something mid-session

After a non-trivial fix or process win, **append** to IMPROVEMENTS.md:

```markdown
### YYYY-MM-DD · short title
- **Trigger:** what user said / what failed
- **Analyzed:** files, symptoms, hypotheses
- **Decision:** what we chose and **why**
- **Changed:** files / commands
- **Improved how:** measurable or qualitative
- **Lesson for next time:** durable rule
- **User steered:** (if they corrected you)
```

## Self-heal loop

1. Detect failure (test red, tool error, user "that's wrong")
2. Root-cause (not symptom patch) - pair with ponytail ladder
3. Fix + verify
4. Journal the lesson
5. If user preference involved → update PROFILE / Preferences

## Automatic retrospective protocol (hooks feed you - you close the loop)

The `retrospective.json` hook records **objective evidence** without asking:
every failed tool call, denied permission, and API error lands in
`~/.logan/memory/retro/<sid>.jsonl`, and at session end it is aggregated into
an IMPROVEMENTS.md entry whose Decision/Lesson lines are marked `(Logan: ...)`.

Your obligations - these are not optional:

1. **At session start**, scan the tail of IMPROVEMENTS.md for `(Logan:`
   markers. For each pending retrospective: root-cause the failure class
   (read the error, reproduce if cheap), then REPLACE the placeholder lines
   with the real decision and a durable one-line lesson. Also sweep
   `~/.logan/memory/retro/*.jsonl` - files from OTHER sessions are orphans
   (the session died without a clean end); summarize them into IMPROVEMENTS.md
   the same way, then delete them. If a lesson is a
   user preference or environment fact, also promote it to MEMORY.md
   (`## Lessons`) so dream consolidation and injection carry it forward.
2. **Immediately after any bug fix** (yours or the user's code), append a
   full IMPROVEMENTS.md entry (template above) while context is hot - never
   defer to "later". A fix without a journaled lesson is half a fix.
3. **When the same failure class appears in 2+ retrospectives**, that is a
   systemic issue: propose a permanent guard (config change, new rule file,
   skill edit, pre-flight check) to the user instead of re-fixing.
4. **Never leave `(pending)` or `(Logan:` markers older than one session.**

Division of labor: hooks capture evidence → you interpret and journal →
autoDream (memory consolidation) distills journals into long-term MEMORY.md →
initial injection loads it into every new session. You are the only step that
can turn evidence into insight - do it.

## Answering "why did you decide that?"

Be explicit:

1. Goal / constraint observed
2. Options considered (even if one line each)
3. Evidence (file, error, prior memory)
4. Choice + risk
5. What would change the decision

If caveman is on, still answer **why** clearly when asked - auto-clarity applies.

## Never

- Fake improvements that did not happen
- Hide failures
- Write secrets/API keys into MEMORY/IMPROVEMENTS
