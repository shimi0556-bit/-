# Game-ready models · מוכנים למשחק

Every model in the library ships ready to drop into a game, mainly a racing game. Nothing here is a game; it's the contract and the files a game needs.

**בעברית בקצרה:** לכל דגם יש תיקייה `game/` עם קובץ GLB (הפורמט הסטנדרטי של Unity, Godot, Unreal ו־three.js) בשתי גרסאות, מלאה וקלה למירוץ, וקובץ JSON עם המידות, נתוני הפיזיקה ושמות צמתי הגלגלים. הבדיקה (`build.py --check`) מייצאת אותם מחדש ובודקת במספרים שהגלגלים מסתובבים ופונים לכיוון הנכון.

## Files per model: `models/<id>/game/`

| File | What |
|---|---|
| `<id>.glb` | Full model: every part, interior, engine. Welded, deduplicated, quantized. |
| `<id>.race.glb` | Light version for racing: hides internal systems (`meta.game.lodHide`) and parts under 2 cm, simplified ×0.5 with meshoptimizer. |
| `<id>.game.json` | Dimensions, box collider, physics (`meta.game`), wheel list with node names, radii, positions and spin rates. |
| `preview.png` | The `.glb` rendered by a plain three.js `GLTFLoader` (proof that it loads). |

| # | Model | Kind | `.glb` | `.race.glb` | Triangles (full → race) |
|---|---|---|---|---|---|
| 001 | Cadillac One "The Beast" | car, RWD | 6.8 MB | 3.8 MB | 613K → 301K |
| 002 | Merkava Mk 4M | tracked | 2.1 MB | 1.7 MB | 400K → 290K |
| 003 | Tesla Model Y | car, AWD | 4.3 MB | 2.8 MB | 456K → 216K |
| 004 | Ford Model T | car, RWD | 1.1 MB | 1.0 MB | 112K → 81K |

## Conventions (glTF)

- Metres; **+Y up, the vehicle faces +Z, +X is its left**; origin on the ground under the middle of the vehicle.
- Wheels: nodes `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`, each centred on its hub. **Spin:** rotate about the node's own local Z by `spinRadPerMetre × metres driven forward` (from `game.json`; the sign differs per side).
- Front wheels sit under `Steer_FL` / `Steer_FR`, whose rest rotation is identity: **set** rotation about local Y; a positive angle turns toward the vehicle's left.
- Tracked vehicles (`"tracked": true`): no wheel nodes. The track links are instanced and only animate inside the library page; in a game, scroll a texture or animate the track yourself.
- Each node carries its Hebrew part card as glTF `extras` (`part.he`, `part.desc`), and the root has `extras.l3d` = the same data as `game.json`.

## `meta.game` (physics, in each model's `meta.json`)

`kind` (`car` / `tracked`), `drive`, `massKg`, `topSpeedKmh`, `accel0to100s` or `accelMs2`, `steerMaxRad` or `turnRateRad`, `wheelbase`, `track`, `wheelRadius`, `grip` (0–1, relative), `lodHide`, `note` (which numbers are estimates).

## Use it: three.js

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const gltf = await new GLTFLoader().loadAsync('models/004-ford-model-t/game/004-ford-model-t.race.glb');
const car = gltf.scene, info = car.children[0].userData.l3d;          // same as .game.json
const wheels = info.wheels.map((w) => ({ ...w, node: car.getObjectByName(w.node), steer: w.steerNode && car.getObjectByName(w.steerNode) }));
scene.add(car);
// every frame: distance = speed * dt (metres), steer = -0.5…0.5 rad (positive = left)
for (const w of wheels) { w.node.rotateZ(w.spinRadPerMetre * distance); if (w.steer) w.steer.rotation.y = steer; }
```

Box collider: `info.collider.center` / `info.collider.halfExtents`. Other engines (Unity glTFast, Godot 4, Unreal): import the `.glb`, find the same node names, and rotate them about the same local axes (engines that flip handedness on import swap the sign of X, so check `Steer_*` once).

## Inside the library (procedural)

The models also expose the same handles at runtime: `model.js` calls `K.gameRig({ kind: 'car', wheels: [{ steer, spin, s, front, r }] })` or `K.gameRig({ kind: 'tracked', setTravel })` at the end of `build()`, and the viewer page keeps them in `L3D.kit.registry.rig`.

## Checks (`python3 build.py --check`)

1. `tools/sanity.cjs`: fails if `meta.game` is set and the model never calls `K.gameRig()`.
2. `tools/export_glb.cjs`: writes the three files above (needs `cd tools && npm i`, done automatically).
3. `tools/glb_check.cjs`: loads every `.glb` with `GLTFLoader` and fails unless all four wheel nodes exist, the front is +Z, the model rests on y = 0, the extras are there, **rolling forward turns each wheel the right way, and a positive steer angle turns left**.
