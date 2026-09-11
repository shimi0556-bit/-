# Logan README assets

**Author:** Yuval Avidani (YUV.AI)

## Files used on the README

| File | Role |
| --- | --- |
| `banner.jpg` | Hero |
| `infographic-one-command-install.jpg` | Install story (rendered) |
| `infographic-one-command-install.svg` | Install story (editable source) |
| `infographic-token-visibility.jpg` | Token visibility (rendered) |
| `infographic-token-visibility.svg` | Token visibility (editable source) |
| `infographic-competitive-map.jpg` | Competitive map (rendered) |
| `infographic-competitive-map.svg` | Competitive map (editable source) |
| `infographic-swot-summary.svg` | SWOT-style cards |
| `infographic-prompt-journey.jpg` | Prompt journey |
| `screenshot-tui.jpg` | TUI feel |

## Why pre-rendered assets (no Mermaid)

GitHub does **not** reliably render fenced Mermaid in every README view.  
Logan ships **pre-rendered** `<img>` assets under `docs/assets/`:

- **SVG** - exact labels, editable, crisp on retina  
- **JPG** - raster posters for maximum GitHub markdown compatibility  

Palette: hot pink `#ff4d9a`, yellow `#ffd60a`, bone `#f5f0e8`, dark charcoal. Abstract claw accents only.

## Rules

- No fenced mermaid in root README.  
- Prefer `docs/assets/*` + `<img>` tags.  
- Keep files > 1KB so empty placeholders fail checks.  
- When claims change, edit the SVG first, then re-export JPG if needed.  
