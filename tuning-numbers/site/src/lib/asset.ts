/**
 * Resolve a public-folder asset against Vite's base URL so runtime string paths
 * (video src, canvas frame sequences, lazy <img>s) work both in dev (base "/")
 * and when deployed under a subpath like GitHub Pages (base "./").
 * asset("/hero.mp4") -> "<base>hero.mp4".
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, "");
}
