import grass from './textures/grass.jpg?url';
import grassN from './textures/grass-n.jpg?url';
import rock from './textures/rock.jpg?url';
import rockN from './textures/rock-n.jpg?url';
import sand from './textures/sand.jpg?url';
import sandN from './textures/sand-n.jpg?url';
import dirt from './textures/dirt.jpg?url';
import dirtN from './textures/dirt-n.jpg?url';
import asphalt from './textures/asphalt.jpg?url';
import asphaltN from './textures/asphalt-n.jpg?url';
import bark from './textures/bark.jpg?url';
import barkN from './textures/bark-n.jpg?url';

/**
 * Photographed materials (Poly Haven scans, CC0; tools/photos.mjs) laid over
 * the procedurally baked textures of the same name, so the ground, cliffs,
 * beaches, dirt, asphalt and tree bark look like the real thing up close.
 * `repeat`: how many photo tiles fill the baked texture, so a photo covers
 * the few metres of ground it was taken of (the terrain stretches one baked
 * tile over 10–20 m). If anything fails the baked textures simply stay.
 */
const PHOTOS = [
  ['grass', grass, 4],
  ['grassNormal', grassN, 4],
  ['rock', rock, 4],
  ['rockNormal', rockN, 4],
  ['sand', sand, 5],
  ['sandNormal', sandN, 5],
  ['dirt', dirt, 4],
  ['dirtNormal', dirtN, 4],
  ['asphalt', asphalt, 1],
  ['asphaltNormal', asphaltN, 1],
  ['bark', bark, 1],
  ['barkNormal', barkN, 1],
];

export const PHOTO_CREDIT = 'הקרקע, הסלעים, החול, דרכי העפר, האספלט וקליפות העצים מצולמים: חומרים סרוקים מ-Poly Haven (Leafy Grass, Rock Face, Coast Sand 01, Gravel Road, Asphalt 02, Bark Willow 02), ברישיון CC0.';

/** Decodes an inlined image without fetch() (refused by the claude.ai viewer's sandbox for data: URLs). */
async function bitmap(src) {
  let blob;
  if (src.startsWith('data:')) {
    const bin = atob(src.slice(src.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: 'image/jpeg' });
  } else blob = await (await fetch(src)).blob();
  return createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

export async function applyPhotoTextures(materials) {
  if (typeof createImageBitmap === 'undefined') return;
  await Promise.all(
    PHOTOS.map(async ([name, src, repeat]) => {
      try {
        const img = await bitmap(src);
        materials.baker.blit(name, img, { repeat });
        img.close?.();
      } catch (e) {
        console.warn(`photo texture ${name} did not load; keeping the baked one`, e);
      }
    }),
  );
}
