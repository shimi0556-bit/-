// Fingerprint of everything the game is built from (src/, the page, the
// config): pre-baked ground data is only valid for the exact sources it was
// baked from, so the offline build refuses stale data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sourceHash(root) {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(path.join(root, 'src'));
  files.push(path.join(root, 'race.html'));
  const h = crypto.createHash('sha256');
  for (const f of files.sort()) {
    h.update(path.relative(root, f).split(path.sep).join('/'));
    h.update(fs.readFileSync(f));
  }
  return h.digest('hex').slice(0, 16);
}
