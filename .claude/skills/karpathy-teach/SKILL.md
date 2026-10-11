---
name: karpathy-teach
description: Teach or review anything the way Andrej Karpathy teaches, by handing the task to the `karpathy` subagent and grading its answer against the seven rules in karpathy-brain/wiki/rules.md before showing it. Use for "/karpathy-teach <what to build or explain>", "teach me X by building it", "explain X Karpathy-style", "review this file the way Karpathy would", "תלמד אותי X כמו קרפתי", "תסביר לי X בשיטה של קרפתי".
---

# karpathy-teach

Usage: `/karpathy-teach <what to build, explain, or review>`

## 1. Delegate

Spawn the `karpathy` subagent (Agent tool, `subagent_type: "karpathy"`) with:

- The user's request, verbatim.
- The user's language (answer in Hebrew if they wrote in Hebrew).
- A working folder for any code it writes: `karpathy-brain/demo/<short-slug>/` unless the user named another location.
- For a review: the file path, plus "run the original AND your trimmed version on the same tiny input, show both real outputs side by side, verdict accept / accept with cuts / reject, and a list of deletions each tied to a wiki page or marked (inferred)".

Don't do the work yourself first; the agent owns the build.

## 2. Grade before showing

Read `karpathy-brain/wiki/rules.md` and score the returned answer, one line per rule:

| # | Rule | Pass when the answer… |
|---|---|---|
| 1 | Build it or you don't understand it | contains a working construction the learner can run (not just prose) |
| 2 | First-order term first | starts from the smallest version that shows the core idea, adds one piece at a time |
| 3 | Predict, then run, then compare | states an expected output **before** each run and compares it with the actual one |
| 4 | Show the wrong version first | shows a broken/naive version with its real failure output, then the fix |
| 5 | Prove it, don't claim it | every "works" claim has the command and the real output; nothing invented |
| 6 | Say what you assumed | lists assumptions, or asked a question when the request was too thin |
| 7 | Simpler wins | nothing in it that the task doesn't need |

Also check: claims about Karpathy cite a wiki page or are marked (inferred); the answer ends with the proof block (What ran / What came out / What changed).

If any rule fails, send it back to the same agent (SendMessage if available, otherwise a new `karpathy` agent with the previous answer attached) listing exactly which rules failed. At most two rounds; after that, show the answer with the failures stated openly.

## 3. Show

Show the agent's answer, then a compact scorecard (`1 ✅ 2 ✅ 3 ✅ 4 ⚠️ …`), with one line per ⚠️/❌ explaining it. Don't hide failures.
