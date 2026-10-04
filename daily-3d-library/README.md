# Daily 3D Library · ספריית התלת־ממד היומית

**בכל יום חפץ אחד נבנה מאפס בתלת־ממד, בקוד בלבד (בלי קבצי מודל ובלי תמונות), עד הפרט הקטן ביותר: ברגים, אטמים, שכבות זכוכית, תפרים.** מתחילים ברכבים. כל דגם הוא דף HTML אחד שנפתח ישר בדפדפן, ובו: פירוק לחלקים, חתך, רנטגן, מבטים מוכנים, ופתיחה של דלתות ומכסים. כל חלק מקבל שם וגם הסבר בעברית.

One object a day, modelled procedurally in Three.js down to the fasteners, as a single self-contained page with an exploded view, cutaway, x-ray and a Hebrew parts browser.

**Open:** [`index.html`](index.html) (the gallery). Each model is at `models/<NNN-slug>/index.html`. The pages need internet only to load three.js and fonts from the CDN.

## The collection

| # | Model | Date | Parts | Triangles |
|---|---|---|---|---|
| 001 | [Cadillac One “The Beast” (2018)](models/001-cadillac-one-the-beast/) — רכב השרד של נשיא ארה״ב | 2026-10-01 | 246 | ~610K |
| 002 | [Merkava Mk 4M (IDF main battle tank)](models/002-merkava-mk4m/) — טנק מרכבה סימן 4M | 2026-10-03 | 258 | ~400K |
| 003 | [Tesla Model Y (Juniper, 2025)](models/003-tesla-model-y/) — טסלה מודל Y | 2026-10-03 | 156 | ~427K |
| 004 | [Ford Model T Touring (1915)](models/004-ford-model-t/) — פורד מודל T | 2026-10-04 | 164 | ~112K |

The queue of upcoming objects is [`queue.json`](queue.json). Reorder or edit it freely: each daily run takes the first item that has no folder yet.

## How it's built

```
daily-3d-library/
  engine/
    kit.js         modelling kit: materials, primitives, parametric surfaces, canvas textures, part registry, toggles
    viewer.js      shared viewer: studio, Hebrew UI, explode / cutaway / x-ray, part cards, camera views
    viewer.css     viewer styles (RTL, mobile layout)
    page.html      page template one model is bundled into
    gallery.html   gallery template
  models/NNN-slug/
    model.js       the model (window.L3D_MODEL = { async build({ K, THREE, sys }) { … } })
    meta.json      title, systems, specs, facts, sources, camera views
    README.md      what was modelled, sources, notes
    index.html     GENERATED: the self-contained page (kit + model + viewer inlined)
    thumb.jpg      GENERATED: gallery thumbnail
    stats.json     GENERATED: parts / meshes / triangles
  tools/check.cjs  headless render: fails on errors, writes thumb + stats, --qa writes shots/*.png
  build.py         bundles every model + regenerates index.html and catalog.json
  queue.json       what to build next
  BUILD_GUIDE.md   the daily procedure + quality bar (read this before building a model)
```

```bash
python3 build.py              # bundle every model + gallery
python3 build.py --check      # … then render each model headless (Playwright), refresh thumb.jpg + stats.json
node tools/check.cjs --qa 001-cadillac-one-the-beast   # + QA shots of every view into models/<id>/shots/ (git-ignored)
```

Never edit a generated `index.html` by hand. Edit `engine/*` or the model's `model.js` / `meta.json`, then rebuild.

## Daily schedule

A Claude Code routine runs once a day. It picks the next item from `queue.json`, researches it, builds it following [`BUILD_GUIDE.md`](BUILD_GUIDE.md), verifies it headless, commits, and publishes it to `main`. To change the time or pause it, edit the routine at [claude.ai/code](https://claude.ai/code) (Routines).
