# Logan skill catalog (opt-in library)

These skills ship **in the repo** and are copied on install to:

```text
~/.logan/catalog/skills/     ← library (available)
~/.logan/skills/             ← active (starts EMPTY)
```

**Nothing is auto-enabled.** Modes (`/think`, `/caveman`, …) stay off until you install the skill and turn the mode on.

## Manage inside Logan

```text
/skills                  # UI modal
/skills list             # what you installed
/skills catalog          # what you can add
/skills add yuvai-thinking
/skills add pack modes      # caveman + ponytail + yuvai-thinking + whoami + self-improve
/skills add pack creative   # HyperFrames + scrub landings + reels + yuv-pilot
/skills add pack all
/skills remove video-edit
```

Power-user install flag (not default):

```bash
LOGAN_SEED_SKILLS=1 bash scripts/install-logan.sh   # installs entire catalog active
LOGAN_SYNC_SIBLING_SKILLS=1 …                       # also pull ~/.claude / ~/.grok skills
```

## Catalog

| Skill | Purpose |
| --- | --- |
| `caveman` | Terse talk (token-saving) |
| `ponytail` | YAGNI / minimal code |
| `yuvai-thinking` | Deep explain / every crumb + why |
| `whoami` | Identity + stack memory |
| `self-improve` | Heal / improve visibility |
| `hyperframes-master` | HyperFrames video stack |
| `cinematic-scrub-landing` | Mouse-scrub landings |
| `parallax-landing-page` | Scroll-scrub parallax |
| `video-to-landing-page` | Apple sticky scroll landings |
| `video-edit` | Captioned reels |
| `yuv-pilot` | Brand multi-output orchestrator |

Also: [hoodini/ai-agents-skills](https://github.com/hoodini/ai-agents-skills).

## Thinking is NOT prebaked

`yuvai-thinking` only applies when:

1. You install it: `/skills add yuvai-thinking`
2. You turn mode on: `/think full`

Otherwise Logan speaks normally. Remove anytime: `/skills remove yuvai-thinking` (also turns think off).
