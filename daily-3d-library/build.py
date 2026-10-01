#!/usr/bin/env python3
"""Daily 3D Library build.

For every folder in models/ this bundles engine/kit.js + the model's model.js
+ engine/viewer.js + meta.json into one self-contained models/<id>/index.html
(only three.js and fonts come from a CDN), then regenerates the gallery
(index.html) and catalog.json from all models' meta.json (+ stats.json when
tools/check.cjs has produced one).

    python3 build.py            # build every model + gallery
    python3 build.py <id>       # build one model + gallery
    python3 build.py --check    # build, then render + screenshot + stats every model (needs Playwright)
"""
import html
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
ENGINE = ROOT / "engine"
MODELS = ROOT / "models"


def js_safe(text: str) -> str:
    # an inline <script> must never contain a closing script tag
    return text.replace("</script", "<\\/script")


def fill(template: str, values: dict) -> str:
    # single pass so model code containing "{{...}}" is never re-substituted
    out, i = [], 0
    while True:
        j = template.find("{{", i)
        if j < 0:
            out.append(template[i:])
            return "".join(out)
        k = template.find("}}", j)
        key = template[j + 2:k]
        out.append(template[i:j])
        out.append(values[key] if key in values else template[j:k + 2])
        i = k + 2


def build_model(d: pathlib.Path) -> dict:
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    page = fill((ENGINE / "page.html").read_text(encoding="utf-8"), {
        "TITLE": html.escape(f"{meta['title']} · ספריית התלת־ממד היומית"),
        "TITLE_SHORT": html.escape(meta["title"]),
        "DESCRIPTION": html.escape(meta.get("description", "")),
        "ID": d.name,
        "CSS": (ENGINE / "viewer.css").read_text(encoding="utf-8"),
        "META": js_safe(json.dumps(meta, ensure_ascii=False)),
        "KIT": js_safe((ENGINE / "kit.js").read_text(encoding="utf-8")),
        "MODEL": js_safe((d / "model.js").read_text(encoding="utf-8")),
        "VIEWER": js_safe((ENGINE / "viewer.js").read_text(encoding="utf-8")),
    })
    (d / "index.html").write_text(page, encoding="utf-8")
    print(f"  built models/{d.name}/index.html ({len(page) // 1024} KB)")
    return entry(d)


def build_gallery(entries: list) -> None:
    entries.sort(key=lambda e: e.get("number") or 0, reverse=True)
    queue = json.loads((ROOT / "queue.json").read_text(encoding="utf-8"))
    done = {e["id"].split("-", 1)[1] for e in entries}
    upcoming = [q for q in queue["items"] if q["slug"] not in done][:6]
    (ROOT / "catalog.json").write_text(json.dumps({"models": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    page = fill((ENGINE / "gallery.html").read_text(encoding="utf-8"), {
        "CATALOG": js_safe(json.dumps(entries, ensure_ascii=False)),
        "QUEUE": js_safe(json.dumps(upcoming, ensure_ascii=False)),
    })
    (ROOT / "index.html").write_text(page, encoding="utf-8")
    print(f"  built index.html (gallery, {len(entries)} models, next: {upcoming[0]['he'] if upcoming else '—'})")


def entry(d: pathlib.Path) -> dict:
    """Gallery / catalog entry for a model folder (meta.json + stats.json from tools/check.cjs)."""
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    stats_file = d / "stats.json"
    return {
        "id": d.name, "number": meta.get("number"), "date": meta.get("date"), "dateHe": meta.get("dateHe"),
        "category": meta.get("category"), "title": meta["title"], "titleEn": meta.get("titleEn"),
        "subtitle": meta.get("subtitle"), "description": meta.get("description"),
        "page": f"models/{d.name}/index.html",
        "thumb": f"models/{d.name}/thumb.jpg" if (d / "thumb.jpg").exists() else None,
        "stats": json.loads(stats_file.read_text()) if stats_file.exists() else {},
    }


def main(argv):
    check = "--check" in argv
    only = [a for a in argv if not a.startswith("--")]
    dirs = sorted(p for p in MODELS.iterdir() if (p / "model.js").exists())
    targets = [d for d in dirs if not only or d.name in only or d.name.split("-", 1)[0] in only]
    for d in targets:
        build_model(d)
    if check:
        subprocess.run(["node", str(ROOT / "tools" / "check.cjs"), *[d.name for d in targets]], check=True)
    build_gallery([entry(d) for d in dirs])


if __name__ == "__main__":
    main(sys.argv[1:])
