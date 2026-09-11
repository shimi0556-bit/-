# Logan modes + skills (opt-in)

**Author:** Yuval Avidani (YUV.AI)

## Defaults

| Thing | Default |
| --- | --- |
| Active skills (`~/.logan/skills/`) | **Empty** |
| Modes (caveman / ponytail / think) | **All off** |
| Profile / preferences | **Empty** (you fill with `/whoami` if you want) |
| Creative HyperFrames rules | **Not injected** unless you install those skills |

You own the set: add, remove, change anytime.

## Thinking - is it prebaked?

**No.** `yuvai-thinking` is only a catalog entry until you:

1. `/skills add yuvai-thinking`
2. `/think full`

Then sticky rules file gets the teach-every-crumb instructions.  
`/think off` or `/skills remove yuvai-thinking` removes that behavior.

## Modes (after you install their skills)

| Command | Needs skill | Purpose |
| --- | --- | --- |
| `/caveman off\|lite\|full\|ultra` | `caveman` | Terse talk - save tokens |
| `/ponytail off\|lite\|full\|ultra` | `ponytail` | YAGNI / minimal code |
| `/think off\|lite\|full\|ultra` | `yuvai-thinking` | Deep explain every crumb |
| `/modes` | - | Status |

**`/think` ↔ `/caveman` exclusive.**

## Skills management

```text
/skills                  # modal
/skills list
/skills catalog
/skills add pack modes
/skills add pack creative
/skills add <name>
/skills remove <name>
```

Packs:

| Pack | Skills |
| --- | --- |
| `modes` | caveman, ponytail, yuvai-thinking, whoami, self-improve |
| `creative` | hyperframes-master, cinematic-scrub, parallax, video-to-landing, video-edit, yuv-pilot |
| `all` | entire catalog |

## Whoami / improve

Also optional - they use memory files under `~/.logan/memory/`.  
`/whoami grill` works without a skill file, but the **whoami** skill adds richer interview structure if installed.

## Persistence

- Modes → `~/.logan/modes.toml` + `~/.logan/rules/logan-modes.md` (only ON modes + installed skill list)
- Skills → files you copy in/out of `~/.logan/skills/`
- Catalog → `~/.logan/catalog/skills/` (read-only library from install)

Env overrides:

| Env | Effect |
| --- | --- |
| `LOGAN_SEED_SKILLS=1` | Install all catalog skills as active (not default) |
| `LOGAN_SYNC_SIBLING_SKILLS=1` | Also copy from ~/.claude / ~/.grok skills |
| `LOGAN_SKILL_CATALOG=path` | Custom catalog root |

## Why empty default?

Different users want different agents. Forcing HyperFrames + yuvai-thinking + caveman on everyone is wrong. Logan ships a **library** and **commands**; you compose your agent.
