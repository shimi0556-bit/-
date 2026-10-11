#!/usr/bin/env python3
"""Lint the Karpathy wiki. "Prove it, don't claim it" applied to the wiki itself.

Checks:
  1. Every quote is found verbatim in the raw file it cites.
     Quote format (blockquote whose last line names the raw file):
         > Don't be a hero.
         > — `raw/blog/2019-04-25-recipe.md`
     "…" marks an elision; each fragment must appear, in order.
  2. Every relative markdown link resolves.
  3. _hot.md is under 500 words.
  4. Every wiki page is reachable from index.md.

raw/ is gitignored; on a fresh clone run tools/crawl.py first, otherwise
quote checks are skipped (and reported as skipped, not passed).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WIKI = ROOT / "wiki"
CITE = re.compile(r"^—\s*`(raw/[^`]+)`")
LINK = re.compile(r"\]\(([^)#\s]+)(?:#[^)]*)?\)")


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("—", "-").replace("–", "-").replace(" ", " ")
    s = re.sub(r"[*_`]", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def quotes(text):
    """Yield (quote, raw_path, line_no) for each cited blockquote."""
    buf, start = [], 0
    for i, line in enumerate(text.splitlines(), 1):
        if line.startswith(">"):
            body = line[1:].strip()
            m = CITE.match(body)
            if m:
                if buf:
                    yield " ".join(buf), m.group(1), start
                buf = []
            else:
                if not buf:
                    start = i
                buf.append(body)
        else:
            buf = []


def main():
    errors, checked, skipped = [], 0, 0
    pages = sorted(WIKI.rglob("*.md"))
    raw_cache = {}
    for page in pages:
        text = page.read_text(encoding="utf-8")
        rel = page.relative_to(ROOT)
        for q, raw, line in quotes(text):
            path = ROOT / raw
            if not path.exists():
                skipped += 1
                continue
            hay = raw_cache.setdefault(path, norm(path.read_text(encoding="utf-8")))
            pos = 0
            for frag in re.split(r"…|\.\.\.", q):
                frag = norm(frag).strip(" .\"'")
                if not frag:
                    continue
                found = hay.find(frag, pos)
                if found < 0:
                    errors.append(f"{rel}:{line}: quote not in {raw}: {frag[:80]!r}")
                    break
                pos = found + len(frag)
            checked += 1
        for target in LINK.findall(text):
            if re.match(r"^[a-z]+:", target):
                continue
            if not (page.parent / target).resolve().exists():
                errors.append(f"{rel}: broken link {target}")

    hot = WIKI / "_hot.md"
    if hot.exists():
        n = len(re.sub(r"^---.*?---", "", hot.read_text(encoding="utf-8"), flags=re.S).split())
        if n >= 500:
            errors.append(f"wiki/_hot.md has {n} words (limit 500)")

    index = (WIKI / "index.md").read_text(encoding="utf-8") if (WIKI / "index.md").exists() else ""
    linked = {(WIKI / t).resolve() for t in LINK.findall(index)}
    for page in pages:
        if page.name not in ("index.md",) and page.resolve() not in linked:
            errors.append(f"{page.relative_to(ROOT)}: not linked from wiki/index.md")

    print(f"pages: {len(pages)}  quotes checked: {checked}  quotes skipped (raw missing): {skipped}")
    for e in errors:
        print("FAIL", e)
    if skipped:
        print("note: run `python3 karpathy-brain/tools/crawl.py` to fetch raw/ and check the skipped quotes")
    print("OK" if not errors else f"{len(errors)} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
