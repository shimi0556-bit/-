import GROUND from 'virtual:shimotron-ground';

/**
 * Pre-baked ground for the offline (USB) build: every island's height grid
 * and splat map, computed once at packaging time (tools/bake-ground.mjs) and
 * shipped inside the file, so starting the game skips the slowest part of
 * loading. Regular builds carry none (GROUND is null) and bake as before.
 *
 * Heights are baked at the exact resolution the build draws terrain with
 * (GROUND.segments, the same at every quality level, so nothing is
 * resampled and the ground under roads and the trail is the live one), as
 * 16-bit steps between the island's lowest and highest point, predicted from
 * the left, upper and upper-left neighbours (low and high bytes in separate
 * planes) and deflated. The splat map (sand, dirt, rock, reef) is 512² RGBA,
 * delta-coded per channel.
 */
/** Terrain resolution of the baked ground (null in regular builds). */
export const bakedSegments = GROUND ? GROUND.segments : null;

/** Island ground from the bundle, or null when there is none for this exact island layout. */
export async function bakedGround(id, key, terrain) {
  const g = GROUND && GROUND.islands[id];
  if (!g || g.key !== key || g.size !== terrain.size || terrain.segments !== GROUND.segments || typeof DecompressionStream === 'undefined') return null;
  try {
    const planes = await inflate(g.heights);
    const B = GROUND.segments;
    const bw = B + 1;
    const N = bw * bw;
    const q = new Uint16Array(N);
    const heights = new Float32Array(N);
    const scale = (g.max - g.min) / 65535;
    for (let r = 0; r < bw; r++) {
      for (let c = 0; c < bw; c++) {
        const i = r * bw + c;
        const pred = r === 0 ? (c === 0 ? 0 : q[i - 1]) : c === 0 ? q[i - bw] : q[i - 1] + q[i - bw] - q[i - bw - 1];
        q[i] = (pred + (planes[i] | (planes[N + i] << 8))) & 0xffff;
        heights[i] = g.min + q[i] * scale;
      }
    }
    const S = g.splatSize;
    const data = await inflate(g.splat);
    for (let r = 0; r < S; r++) {
      for (let ch = 0; ch < 4; ch++) {
        let acc = 0;
        for (let c = 0; c < S; c++) {
          const i = (r * S + c) * 4 + ch;
          acc = (acc + data[i]) & 0xff;
          data[i] = acc;
        }
      }
    }
    // The height texture is read back from the grid, as the live bake does.
    terrain.heights = heights;
    const hdata = new Float32Array(S * S);
    const half = terrain.size / 2;
    const cell = terrain.size / S;
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) hdata[v * S + u] = terrain.heightAt(-half + (u + 0.5) * cell, -half + (v + 0.5) * cell);
    return { heights, splat: { size: S, data, hdata } };
  } catch {
    terrain.heights = null;
    return null;
  }
}

async function inflate(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
