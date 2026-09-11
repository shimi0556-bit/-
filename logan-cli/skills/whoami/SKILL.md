---
name: whoami
description: >
  Profile interview and identity memory. Grill the user for who they are,
  social links, brand, tech stack, likes/dislikes. Persist to MEMORY.md /
  PROFILE.md. Trigger: /whoami, first-run onboarding, "update my profile",
  "remember who I am".
---

# Whoami - know the human

Goal: Logan should **always know who is driving** - identity, brand, stack,
taste - and keep improving that map over time.

## Commands (user-facing)

| Command | Meaning |
| --- | --- |
| `/whoami` | Show what Logan already knows + offer update grill |
| `/whoami grill` | Full interview (socials, stack, preferences) |
| `/whoami update <note>` | Append a fact immediately |
| `/remember ...` | Ad-hoc durable note (existing) |

## Files

- `~/.logan/memory/PROFILE.md` - structured identity (source of truth for whoami)
- `~/.logan/memory/MEMORY.md` - preferences + lessons + auto reflections
- Project: optional `.logan/memory/MEMORY.md` for repo-only facts

## Grill flow (when profile thin or user said grill)

Ask **one cluster at a time** (not a 40-question wall). Save after each cluster.

### Cluster A - Identity
1. Preferred name / how to address them
2. Brand / company / role
3. Home base (city/country optional)
4. Languages (e.g. Hebrew + English)

### Cluster B - Social / web
1. Website
2. GitHub
3. X / LinkedIn / YouTube / other
4. Anything **not** to mention publicly

### Cluster C - Tech stack defaults
1. Preferred frontend (e.g. Next.js, React)
2. Animation / motion (e.g. GSAP, Three.js)
3. Video / creative (e.g. **HyperFrames** as first choice for HTML→video)
4. Backend / infra preferences
5. Hard avoids

### Cluster D - Taste
1. Writing style (plain hyphen `-`, no em-dash)
2. Design system / brand colors if any
3. What "great work" looks like for them
4. What annoys them in AI assistants

After save, confirm with a short **Whoami card** they can correct.

## Always-on behavior

When PROFILE.md or MEMORY Preferences exist:

- Prefer their stack without re-asking every session
- For video/motion work: **default to HyperFrames** if they listed it (see skill `hyperframes-master`)
- Never invent personal facts - if missing, ask or stay neutral
- On preference conflicts mid-session, update PROFILE with their correction

## Output after grill

Write structured markdown:

```markdown
# PROFILE

## Identity
- Name:
- Brand:
- ...

## Links
- Web:
- GitHub:
- X:

## Tech stack defaults
- Frontend:
- Motion:
- Video: HyperFrames (default) ...

## Taste
- ...

## Last updated
- ISO timestamp
```

Also merge a short `## Preferences` summary into MEMORY.md if needed.
