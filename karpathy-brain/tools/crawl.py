#!/usr/bin/env python3
"""Step 1 of the "build another Karpathy" workflow: gather everything raw.

One worker per source family, run in parallel. Each family gets its own
folder under raw/ and a manifest.md listing every file, its word count and
anything that failed. Nothing is summarized here.

    python3 karpathy-brain/tools/crawl.py            # everything
    python3 karpathy-brain/tools/crawl.py blog gh    # only some families

raw/ is gitignored (it is other people's writing); the manifests are kept.
"""
import concurrent.futures as cf
import pathlib
import re
import subprocess
import sys
import time

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
WAYBACK = "https://web.archive.org/web/2026/"

BLOG_POSTS = [  # karpathy.github.io, from the index page
    "2011/04/27/manually-classifying-cifar10", "2012/10/22/state-of-computer-vision",
    "2013/11/23/chrome-extension-programming", "2013/11/27/quantifying-hacker-news",
    "2014/04/26/datascience-weekly-interview", "2014/07/01/switching-to-jekyll",
    "2014/07/02/visualizing-top-tweeps-with-t-sne-in-Javascript", "2014/07/03/feature-learning-escapades",
    "2014/08/03/quantifying-productivity",
    "2014/09/02/what-i-learned-from-competing-against-a-convnet-on-imagenet",
    "2015/03/30/breaking-convnets", "2015/05/21/rnn-effectiveness", "2015/10/25/selfie",
    "2015/11/14/ai", "2016/05/31/rl", "2016/09/07/phd", "2018/01/20/medium",
    "2019/04/25/recipe", "2020/06/11/biohacking-lite", "2021/03/27/forward-pass",
    "2021/06/21/blockchain", "2022/03/14/lecun1989", "2026/02/12/microgpt",
]
BEAR_POSTS = [  # karpathy.bearblog.dev (403s direct, so read through the Wayback Machine)
    "sequoia-ascent-2026", "year-in-review-2025", "chemical-hygiene", "auto-grade-hn",
    "the-space-of-minds", "verifiability", "animals-vs-ghosts", "vibe-coding-menugen",
    "power-to-the-people", "finding-the-best-sleep-tracker", "the-append-and-review-note",
    "digital-hygiene", "i-love-calculator",
]
MEDIUM_POSTS = [
    "software-2-0-a64152b37c35",
    "yes-you-should-understand-backprop-e2f06eab496b",
]
REPOS = {  # repo -> extra files beyond the README
    "nanoGPT": [], "minGPT": [], "micrograd": [], "makemore": [], "minbpe": ["lecture.md"],
    "llm.c": [], "llama2.c": [], "nanochat": [], "nn-zero-to-hero": [], "build-nanogpt": [],
    "ng-video-lecture": [], "char-rnn": [], "LLM101n": [], "autoresearch": [], "llm-council": [],
    "arxiv-sanity-lite": [], "convnetjs": [], "cryptos": [], "randomfun": [],
}
GISTS = {
    "llm-wiki": "442a6bf555914893e9891c11519de94f",
    "min-char-rnn": "d4dee566867f8291f086",
}
INTERVIEWS = {
    "dwarkesh-2025": "https://www.dwarkesh.com/p/andrej-karpathy",
    "lex-fridman-333": "https://lexfridman.com/andrej-karpathy-transcript/",
}
YOUTUBE = {  # his lectures and talks
    "micrograd": "VMj-3S1tku0", "makemore-1": "PaCmpygFfXo", "lets-build-gpt": "kCc8FmEb1nY",
    "tokenizer": "zduSFxRajkE", "reproduce-gpt2": "l8pRSuU81PU", "intro-to-llms": "zjkBMFhNj_g",
    "deep-dive-llms": "7xTGNNLPyMI", "how-i-use-llms": "EWvNQjAaOHw",
    "software-is-changing-again": "LCEmiRjPEtQ",
}


def get(url, tries=3, pause=0):
    # curl rather than urllib: archive.org resets/429s Python's TLS client but
    # serves curl fine.
    for i in range(tries):
        time.sleep(pause)  # archive.org answers 429 to back-to-back requests
        r = subprocess.run(["curl", "-sSL", "--max-time", "60", "-A", UA, "-w", "\\n%{http_code}", url],
                           capture_output=True, text=True, errors="replace")
        body, _, code = r.stdout.rpartition("\n")
        if r.returncode == 0 and code == "200":
            return body
        err = RuntimeError(f"HTTP {code or '-'} {r.stderr.strip()[:120]}")
        time.sleep(10 * (i + 1) if code == "429" else 2 * (i + 1))
    raise err


def html_to_text(html, selectors=("article", "main", ".post", "body")):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
        tag.decompose()
    for wb in soup.select("#wm-ipp-base, #wm-ipp, #donato"):  # Wayback banner
        wb.decompose()
    node = None
    for sel in selectors:
        node = soup.select_one(sel)
        if node:
            break
    # Break lines only at block elements so inline links don't split sentences
    # (the wiki quotes these files verbatim and greps for exact phrases).
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for blk in soup.find_all(["p", "div", "li", "pre", "blockquote", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]):
        blk.append("\n\n")
    text = (node or soup).get_text()
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def words(text):
    return len(text.split())


def family(name, jobs):
    """jobs: list of (filename, source_url, fetch() -> text)."""
    out = RAW / name
    out.mkdir(parents=True, exist_ok=True)
    rows, fails = [], []
    for fname, url, fetch in jobs:
        try:
            text = fetch()
            if words(text) < 30:
                raise ValueError(f"only {words(text)} words came back")
            (out / fname).write_text(f"source: {url}\n\n{text}\n", encoding="utf-8")
            rows.append((fname, words(text), url))
        except Exception as e:  # noqa: BLE001
            fails.append((fname, url, f"{type(e).__name__}: {e}"[:200]))
    lines = [f"# raw/{name} manifest", "", f"crawled: {time.strftime('%Y-%m-%d')}",
             f"files: {len(rows)}, words: {sum(r[1] for r in rows)}, failed: {len(fails)}", "",
             "| file | words | source |", "|---|---|---|"]
    lines += [f"| {f} | {w} | {u} |" for f, w, u in rows]
    if fails:
        lines += ["", "## Failed", "", "| file | source | error |", "|---|---|---|"]
        lines += [f"| {f} | {u} | {e} |" for f, u, e in fails]
    (out / "manifest.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return name, len(rows), sum(r[1] for r in rows), len(fails)


def blog():
    jobs = []
    for p in BLOG_POSTS:
        url = f"https://karpathy.github.io/{p}/"
        jobs.append((p.replace("/", "-") + ".md", url, lambda u=url: html_to_text(get(u), (".post-content", "article", "body"))))
    return family("blog", jobs)


def bearblog():
    jobs = []
    for p in BEAR_POSTS:
        url = f"https://karpathy.bearblog.dev/{p}/"
        jobs.append((p + ".md", url, lambda u=url: html_to_text(get(WAYBACK + u, tries=4, pause=5), ("main", "body"))))
    return family("bearblog", jobs)


def medium():
    jobs = []
    for p in MEDIUM_POSTS:
        url = f"https://karpathy.medium.com/{p}"
        jobs.append((p + ".md", url, lambda u=url: html_to_text(get(WAYBACK + u, tries=4, pause=5), ("article", "body"))))
    return family("medium", jobs)


def github():
    def readme(repo, path):
        for branch in ("master", "main"):
            try:
                return get(f"https://raw.githubusercontent.com/karpathy/{repo}/{branch}/{path}", tries=1)
            except Exception:  # noqa: BLE001
                continue
        raise FileNotFoundError(f"{repo}/{path} on master and main")

    jobs = []
    for repo, extra in REPOS.items():
        for path in ["README.md", *extra]:
            jobs.append((f"{repo}--{path}", f"https://github.com/karpathy/{repo}/blob/HEAD/{path}",
                         lambda r=repo, p=path: readme(r, p)))
    return family("github", jobs)


def gists():
    jobs = [(f"{n}.md", f"https://gist.github.com/karpathy/{gid}",
             lambda g=gid: get(f"https://gist.githubusercontent.com/karpathy/{g}/raw")) for n, gid in GISTS.items()]
    return family("gists", jobs)


def interviews():
    jobs = [(f"{n}.md", u, lambda u=u: html_to_text(get(u), (".available-content", "article", ".entry-content", "body")))
            for n, u in INTERVIEWS.items()]
    return family("interviews", jobs)


def youtube():
    def captions(vid):
        from youtube_transcript_api import YouTubeTranscriptApi
        return "\n".join(s.text for s in YouTubeTranscriptApi().fetch(vid))

    jobs = [(f"{n}.md", f"https://www.youtube.com/watch?v={v}", lambda v=v: captions(v)) for n, v in YOUTUBE.items()]
    return family("youtube", jobs)


def x_posts():
    # The video uses a TwitterAPI.io key from .env. Without one we record the gap
    # instead of scraping around it.
    def fetch():
        raise PermissionError("no TWITTERAPI_IO key configured; X posts not collected")
    return family("x", [("posts.md", "https://x.com/karpathy", fetch)])


FAMILIES = {"blog": blog, "bearblog": bearblog, "medium": medium, "gh": github, "gists": gists,
            "interviews": interviews, "youtube": youtube, "x": x_posts}

if __name__ == "__main__":
    picked = sys.argv[1:] or list(FAMILIES)
    with cf.ThreadPoolExecutor(len(picked)) as pool:
        for name, n, w, f in pool.map(lambda k: FAMILIES[k](), picked):
            print(f"{name:12s} files={n:3d} words={w:7d} failed={f}")
