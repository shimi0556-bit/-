#!/usr/bin/env python3
"""Builds the single-file deck:  src/deck.src.html  ->  index.html

  {{SVG:name}}   inline assets/art/name.svg (sized by CSS)
  {{IMG:name}}   data-URI of assets/frames/name.jpg
  {{VIDEO_B64}}  base64 of assets/video/atlas-gets-a-grip.mp4
  {{Y1}}..{{Y5}} vertical positions of the anatomy labels (match the markers in art.py)

then injects the Edit Mode editor (repo CLAUDE.md: every HTML deck gets it).
Run:  python3 tools/art.py && python3 tools/build.py
"""
import base64
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = ROOT.parent
ART = ROOT / "assets" / "art"
FRAMES = ROOT / "assets" / "frames"
VIDEO = ROOT / "assets" / "video" / "atlas-gets-a-grip.mp4"
INJECT = REPO / ".claude" / "skills" / "deck-edit-mode" / "scripts" / "inject_editor.py"

# anatomy.svg geometry (see art_anatomy): robot scale/origin and the svg's placement in the deck
S, Y0 = 1.62, 920
ANAT_TOP, ANAT_SCALE, LABEL_H = 196, 768 / 960, 150
MARKS = {1: -441, 2: -500, 3: -325, 4: -112, 5: -192}


def inline_svg(name: str) -> str:
    s = (ART / f"{name}.svg").read_text(encoding="utf-8")
    head_end = s.index(">")
    head = re.sub(r'\s(width|height)="[^"]*"', "", s[:head_end])
    return head + s[head_end:]


def data_uri(name: str) -> str:
    p = FRAMES / f"{name}.jpg"
    if name == "halftone-cyan" and shutil.which("ffmpeg"):
        # decorative texture: shrink it, the dots survive and the file stays small
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(p), "-vf", "scale=960:-1", "-q:v", "12", "-f", "mjpeg", "-"],
            check=True, capture_output=True).stdout
    else:
        raw = p.read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def main():
    html = (ROOT / "src" / "deck.src.html").read_text(encoding="utf-8")
    html = re.sub(r"\{\{SVG:([\w-]+)\}\}", lambda m: inline_svg(m.group(1)), html)
    html = re.sub(r"\{\{IMG:([\w-]+)\}\}", lambda m: data_uri(m.group(1)), html)
    for num, ly in MARKS.items():
        y = ANAT_TOP + (Y0 + ly * S) * ANAT_SCALE - LABEL_H / 2
        html = html.replace("{{Y%d}}" % num, str(round(y)))
    html = html.replace("{{VIDEO_B64}}", base64.b64encode(VIDEO.read_bytes()).decode())
    left = re.findall(r"\{\{[^}]+\}\}", html)
    if left:
        sys.exit("unresolved placeholders: %s" % sorted(set(left)))
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    subprocess.run([sys.executable, str(INJECT), str(out)], check=True)
    print("built", out, "%.1f MB" % (out.stat().st_size / 1e6))


if __name__ == "__main__":
    main()
