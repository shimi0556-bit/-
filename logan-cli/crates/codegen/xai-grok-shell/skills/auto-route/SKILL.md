---
name: auto-route
description: >
  Recommend or switch to a token-saving model tier (fast / default / premium /
  local / gateway) based on task hardness. Triggers: "auto route", "save
  tokens", "use cheap model", "route this task", "which model should we use".
model: tier-fast
effort: low
---

# Auto-route (Logan)

Pick the **cheapest model that can still succeed**. Tiers are defined in
`examples/config/auto-routing.toml` (`tier-fast`, `tier-default`, `tier-premium`,
`tier-local`, `tier-gateway`).

## Heuristics

| Tier | When |
| --- | --- |
| **fast** | Q&A, explain, search-only, 1-file tiny edit, classify |
| **default** | Normal implement, tests, refactors under ~15 files |
| **premium** | Architecture, multi-package, nasty bugs, security |
| **local** | Offline / privacy / bulk offline classification |
| **gateway** | When LiteLLM is the org standard path |

## Steps

1. Estimate task size: files touched, ambiguity, risk of prod break.
2. Recommend a tier with one-sentence why.
3. If the user agrees (or said "auto"), switch with `/model <tier-id>` when
   available in this session, or tell them to re-run with `-m <tier-id>`.
4. For multi-step work: start **fast** for exploration, escalate to
   **default/premium** only when blocked.
5. After finish, note estimated savings vs always-premium (qualitative is OK).

## Rules

- Never route security-sensitive production changes to an untrusted local model
  without user OK.
- Prefer escalating once over thrashing models every turn.
- Combine with `/context` awareness - long contexts are expensive; compact or
  flush before premium if history is bloated.
