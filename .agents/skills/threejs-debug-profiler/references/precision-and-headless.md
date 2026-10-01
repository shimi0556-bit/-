# Depth precision, thin shells, triangle hunting, headless rendering (local lessons)

From `daily-3d-library` (procedural vehicles with layered armour, glass plies and interiors).

## Thin stacked shells z-fight
- Layers closer than ~8 mm (a door skin with steel/Kevlar/ceramic layers behind it) bled through the paint as vertical streaks at distance, especially on SwiftShader, which has a coarse depth buffer.
- Fix: keep stacked shells ≥ 8 mm apart (move inner layers ≥ 20 mm in), and raise the camera's near plane (0.05 instead of 0.02 with far 120). Prove it with an A/B render that hides the suspected system.

## Find what eats the triangle budget
Run in the page (or via Playwright `page.evaluate`):
```js
const out = {}; root.traverse((o) => { if (!o.isMesh) return; const g = o.geometry;
  const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  let p = o; while (p && !p.userData.part) p = p.parent; const k = (p ? p.userData.part.he : '?') + ' / ' + o.name; out[k] = (out[k] || 0) + n; });
Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25);
```
- `RoundedBoxGeometry` costs ~600–1,200 triangles even at low segment counts. 680 rounded ceramic tiles alone were 400K triangles. Use `BoxGeometry` + `InstancedMesh` for anything repeated dozens of times.

## Headless rendering on SwiftShader
- A continuous `requestAnimationFrame` loop on a ~0.5M-triangle scene with soft shadows starves SwiftShader, so `page.screenshot` times out. Give the app a shot mode (`?shot=1`): no loop, camera changes applied instantly, and a `window.__render()` the harness calls before each screenshot.
- `page.waitForFunction(() => window.__ready || window.__error)` with app-level error capture (`window.addEventListener('error', …)` → `window.__error`) turns silent hangs into readable failures.
