---
name: learn-user
description: >
  Extract and store personal preferences about the user (style, risk, PR
  habits, languages, design taste) into long-term memory so Logan feels
  tailored - especially for Yuval Avidani / YUV.AI. Triggers: "learn my
  preferences", "remember how I like", "update my profile", "what do you know
  about me".
model: tier-fast
effort: low
---

# Learn user (Logan)

Build a living **user preference profile** for long-term memory.

## Default subject

When the user is Yuval Avidani / YUV.AI, seed from known public facts only if
memory is empty:

- Brand YUV.AI, AI Builder & Speaker
- Links: https://yuv.ai, GitHub hoodini, X @yuvalav
- Writing: single hyphen `-` only (never em/en dash)

Always prefer **observed** session evidence over assumptions.

## Steps

1. Scan recent conversation for preferences: communication style, autonomy vs
   confirm, languages (HE/EN), tooling, PR/git habits, design taste.
2. Diff against existing `MEMORY.md` `## Preferences` (use `memory_search` /
   `memory_get` if available).
3. Propose a concise update (bullet list). Show it to the user before writing
   when the preference is sensitive or irreversible.
4. Persist under global memory when cross-project; workspace memory when
   project-only.
5. Confirm path written.

## Preference schema (suggested headings)

```markdown
## Preferences
### Communication
### Autonomy and risk
### Languages
### Engineering
### Design and brand
### Git and PRs
### Avoid
```

## Rules

- Do not invent preferences.
- Do not store secrets.
- Prefer additive updates; do not wipe existing sections blindly.
