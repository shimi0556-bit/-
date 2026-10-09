# brain-graph (אטלס המוח)

Single-file Hebrew (RTL) knowledge graph laid out as a brain: each node lives in the region that matches its psychological function. Source in `brain-graph/src/*.js` + `style.css`, `python3 build.py` inlines everything into `brain-graph/index.html`. No dependencies; PDF support lazy-loads pdf.js from cdnjs only when a PDF is added.

## How it works

- 12 regions (`src/regions.js`): pfc (values/goals), motor (actions), parietal (attention/space), occipital (images), temporal (knowledge/language/people), basal ganglia (habits), ACC (motivation/conflict), amygdala (emotions), hippocampus (memories), hypothalamus (needs), cerebellum (skills), brainstem (energy/state). Geometry is a 1000x700 viewBox, brain front on the right. Deep regions are drawn as an x-ray overlay; surface ones are clipped to the cortex path.
- Layout (`layout.js`): per-region spring + soft ellipse containment, grid-based repulsion, weak link springs, deep ellipses repel foreign nodes. Regions swell with population (scale up to 1.7).
- AI (`ai.js`): Anthropic (browser-direct header) or any OpenAI-compatible `/chat/completions`. Four prompts: extract, seeds (where in the graph is the request), work (answer + actions from the visited nodes), organize (batches of 50). Always strict JSON; `parseJSON` strips fences and trailing commas.
- The command flow (`app.js` `runCommand`): seeds → BFS walk (max 26 nodes, depth 2, 4 strongest neighbours each) animated with `BG.pulse` → work call. Activation lives in `node.act/hold` and `edge.act/hold`; `view.js` frame loop eases act toward hold, regions glow by the max act of their nodes. Nothing writes to the graph without the user ticking the proposed actions.
- Without a key: local extractor (word frequency + lexicon in `LEXICON`) and keyword seeds.
- Exports (`exportx.js`): the SVG layers (background, brain, regions, edges, nodes per region) are the single source; PNG and each PSD layer rasterise those SVG strings to canvas. The PSD writer is hand-written (RGB 8-bit, PackBits RLE, Pascal name + `luni` Unicode name block), checked by reading it back with `psd-tools`.

## Notes

- **2026-10-09, first version.** Built from the request "mind map that stores knowledge as a graph, ingests documents/links, arranges nodes like a brain by function, AI via API key organises it, marks regions in colour while it walks the memory, works with drawing/editing tools". Related earlier project: `mapat-hanefesh` (Obsidian-style journal, branch `claude/serene-cannon-p1evet`, not merged into main). They are separate apps; no import path between them yet.
- Tested headless with Playwright: mocked Anthropic endpoint (ingest, seeds, work, actions, PSD export), docx via the zip reader, URL via the reader fallback, local extraction, drag-to-reassign, persistence, mobile layout. The real AI call was NOT exercised (no key in the sandbox), only the request shape and headers.
- Bug found while testing: native `Element.append(null)` writes the text "null" — the node panel passed optional children to it. Filter before append (the `h()` helper already skips null).
- Imported/ingested node URLs are restricted to http(s) so `javascript:` links in a crafted backup can't run.
- Open: no import from `mapat-hanefesh`; the local extractor produces noisy Hebrew bigrams (no morphology); not in the playground launcher (needs a key for the AI part); pdf.js needs internet.
