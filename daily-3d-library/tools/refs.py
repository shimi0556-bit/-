#!/usr/bin/env python3
"""Reference photos for the photo-comparison QA step (BUILD_GUIDE §6).

  python3 tools/refs.py search "Tesla Model Y Juniper"            # list matching Wikimedia Commons files
  python3 tools/refs.py fetch  "Tesla Model Y Juniper" DIR [MATCH]  # download up to 30 (1024 px) into DIR
  python3 tools/refs.py sheet  OUT.jpg DIR/*.jpg                   # contact sheet with file names
  python3 tools/refs.py pair   REAL.jpg MODEL.png OUT.jpg          # side-by-side REAL | MODEL

Photos come from Wikimedia Commons (free licences). Keep them OUT of the repo
(download into the scratchpad); list the files you compared against in the
model's README instead. Needs Pillow for sheet/pair (pip install pillow).
"""
import json, os, subprocess, sys, urllib.parse

UA = "l3d-ref-bot/1.0"

def get(url):
    return subprocess.run(["curl", "-sSL", "-A", UA, url], capture_output=True, check=True).stdout

def search(q, n=30):
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrsearch": q, "gsrnamespace": 6, "gsrlimit": n,
        "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 1024, "format": "json"})
    pages = (json.loads(get(u)).get("query", {}) or {}).get("pages", {}) or {}
    return sorted((p["title"], p.get("imageinfo", [{}])[0].get("thumburl")) for p in pages.values())

def fetch(q, dest, match=None):
    os.makedirs(dest, exist_ok=True)
    i = 0
    for title, url in search(q):
        if not url or (match and match.lower() not in title.lower()):
            continue
        fn = os.path.join(dest, f"{i:02d}.jpg")
        with open(fn, "wb") as f:
            f.write(get(url))
        print(fn, title)
        i += 1

def sheet(out, files, cols=4, W=400, H=300):
    from PIL import Image, ImageDraw
    rows = (len(files) + cols - 1) // cols
    S = Image.new("RGB", (cols * W, rows * H), "white"); d = ImageDraw.Draw(S)
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGB"); im.thumbnail((W, H))
        x, y = (i % cols) * W, (i // cols) * H
        S.paste(im, (x, y)); d.text((x + 5, y + 5), os.path.basename(f), fill="red")
    S.save(out, quality=85)

def pair(real, model, out, H=420):
    from PIL import Image, ImageDraw
    A = Image.open(real).convert("RGB"); B = Image.open(model).convert("RGB")
    A = A.resize((int(A.width * H / A.height), H)); B = B.resize((int(B.width * H / B.height), H))
    S = Image.new("RGB", (A.width + B.width + 10, H), "white"); S.paste(A, (0, 0)); S.paste(B, (A.width + 10, 0))
    d = ImageDraw.Draw(S); d.text((8, 8), "REAL", fill="red"); d.text((A.width + 18, 8), "MODEL", fill="red")
    S.save(out, quality=85)

if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "search": [print(t) for t, _ in search(a[0])]
    elif cmd == "fetch": fetch(a[0], a[1], a[2] if len(a) > 2 else None)
    elif cmd == "sheet": sheet(a[0], a[1:])
    elif cmd == "pair": pair(*a[:3])
