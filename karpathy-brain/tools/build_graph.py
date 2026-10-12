#!/usr/bin/env python3
"""Build graph.html: the wiki as an interactive node graph (like Obsidian's graph view).

Nodes: the 7 rules (from rules.md sections), principles, methods, sources, _hot.
Edges: markdown links between pages + quote citations (a page quoting
raw/x.md links to the source page of raw/x.md). index.md and log.md are left
out, since they link to everything.

    python3 karpathy-brain/tools/build_graph.py   # writes karpathy-brain/graph.html
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
WIKI = ROOT / "wiki"
TEMPLATE = pathlib.Path(__file__).with_name("graph_template.html")
OUT = ROOT / "graph.html"
REPO_URL = "https://github.com/shimi0556-bit/-/blob/claude/charming-lamport-5j3jkt/karpathy-brain/wiki/"
SKIP = {"index.md", "log.md"}
LINK = re.compile(r"\]\(([^)#\s]+\.md)(?:#[^)]*)?\)")
CITE = re.compile(r"^>\s*—\s*`(raw/[^`]+)`", re.M)


def first_para(text, after=None):
    if after and after in text:
        text = text.split(after, 1)[1]
    for block in re.split(r"\n\s*\n", text):
        b = block.strip()
        if b and not b.startswith(("#", ">", "-", "|", "```")):
            return re.sub(r"\*\*|`|\[([^\]]+)\]\([^)]+\)", lambda m: m.group(1) or "", b)[:400]
    return ""


def main():
    pages = {p.relative_to(WIKI).as_posix(): p.read_text(encoding="utf-8")
             for p in sorted(WIKI.rglob("*.md")) if p.name not in SKIP}

    raw_to_source = {}
    nodes = {}
    for rel, text in pages.items():
        title = text.splitlines()[0].lstrip("# ").strip()
        kind = rel.split("/")[0] if "/" in rel else "core"
        node = {"id": rel, "title": title, "kind": {"sources": "source", "principles": "principle", "methods": "method"}.get(kind, "core"),
                "url": REPO_URL + rel, "quotes": len(CITE.findall(text))}
        if kind == "sources":
            m = re.search(r"\*\*raw:\*\* `(raw/[^`]+)`", text)
            raw_to_source[m.group(1)] = rel
            node["family"] = m.group(1).split("/")[1]
            meta = re.search(r"\*\*type:\*\* (.*?) · \*\*date:\*\* (.*?) · \*\*words:\*\* (\d+)", text)
            node.update(type=meta.group(1), date=meta.group(2), words=int(meta.group(3)))
            attr = re.search(r"\*\*attribution:\*\* (.*)", text)
            node["attribution"] = attr.group(1) if attr else ""
            node["summary"] = first_para(text, "## Summary")
        elif rel == "rules.md":
            node["summary"] = first_para(text)
        else:
            node["summary"] = first_para(text.split("\n", 1)[1])
        nodes[rel] = node

    edges = set()

    def add(a, b):
        if a != b and a in nodes and b in nodes:
            edges.add(tuple(sorted((a, b))))

    def targets(rel, text):
        base = pathlib.PurePosixPath(rel).parent
        for t in LINK.findall(text):
            parts = []
            for seg in (base / t).parts:
                if seg == "..":
                    parts.pop() if parts else None
                elif seg != ".":
                    parts.append(seg)
            yield "/".join(parts)
        for raw in CITE.findall(text):
            if raw in raw_to_source:
                yield raw_to_source[raw]

    # The seven rules become their own nodes, linked to what each section cites.
    rules_text = pages["rules.md"]
    sections = re.split(r"^## (\d)\. (.+)$", rules_text.split("## Candidates")[0], flags=re.M)
    for i in range(1, len(sections), 3):
        num, name, body = sections[i], sections[i + 1].strip(), sections[i + 2]
        rid = f"rule-{num}"
        nodes[rid] = {"id": rid, "title": f"{num}. {name}", "kind": "rule", "url": REPO_URL + "rules.md",
                      "quotes": len(CITE.findall(body)), "summary": first_para(body)}
        add(rid, "rules.md")
        for t in targets("rules.md", body):
            add(rid, t)

    for rel, text in pages.items():
        if rel == "rules.md":
            text = "## Candidates" + text.split("## Candidates", 1)[-1]
        for t in targets(rel, text):
            add(rel, t)

    deg = {n: 0 for n in nodes}
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    for n in nodes.values():
        n["degree"] = deg[n["id"]]

    srcs = [n for n in nodes.values() if n["kind"] == "source"]
    stats = {"sources": len(srcs), "words": sum(n["words"] for n in srcs),
             "quotes": sum(len(CITE.findall(t)) for t in pages.values()),
             "pages": len(pages), "edges": len(edges)}
    data = {"nodes": list(nodes.values()), "links": [{"source": a, "target": b} for a, b in sorted(edges)], "stats": stats}
    html = TEMPLATE.read_text(encoding="utf-8").replace("/*__GRAPH_DATA__*/null", json.dumps(data, ensure_ascii=False))
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT.parent)}: {len(nodes)} nodes, {len(edges)} edges, {stats['quotes']} quotes")


if __name__ == "__main__":
    main()
