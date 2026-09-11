# Logan creative stack (opt-in)

**Author:** Yuval Avidani (YUV.AI)

Creative skills are **available in the catalog**, not forced on.

## Default: empty

| Path | Role |
| --- | --- |
| `~/.logan/skills/` | **Active** skills - starts **empty** |
| `~/.logan/catalog/skills/` | Library install can pull from |

You choose what to add or remove.

## Install packs

```text
/skills catalog
/skills add pack creative    # HyperFrames + scrub + reels + yuv-pilot
/skills add pack modes       # caveman + ponytail + yuvai-thinking + whoami + self-improve
/skills add yuvai-thinking   # one skill
/skills remove video-edit
```

## After pack creative

| Intent | Command | Skill |
| --- | --- | --- |
| Mouse-scrub landing | `/site mouse video.mp4` | `cinematic-scrub-landing` |
| Scroll-scrub parallax | `/site parallax video.mp4` | `parallax-landing-page` |
| Apple sticky scroll | `/site scroll video.mp4` | `video-to-landing-page` |
| Captioned reel | `/reel video.mp4` | `video-edit` |
| Stack map | `/creative` | - |

If the skill is missing, Logan tells you how to add it - it will not silently invent the stack.

## Thinking (yuvai-thinking)

**Not prebaked.** Normal install does not enable teach-every-crumb mode.

```text
/skills add yuvai-thinking
/think full          # sticky ON
/think off           # back to normal
/skills remove yuvai-thinking
```

`/think` and `/caveman` are exclusive.

## Project save paths (when you use creative skills)

| Output | Default folder |
| --- | --- |
| Landings | `~/Documents/yuv-projects/landings/<slug>/` |
| Videos | `~/Documents/yuv-projects/videos/<slug>/` |

See also: [MODES.md](MODES.md) · [skills/README.md](../skills/README.md)
