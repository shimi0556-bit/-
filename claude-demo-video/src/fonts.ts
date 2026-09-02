import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const headlineFont = "Space Grotesk";
export const bodyFont = "Inter";
export const monoFont = "JetBrains Mono";
export const kilnDisplayFont = "Fraunces";

await Promise.all([
  loadFont({
    family: headlineFont,
    url: staticFile("fonts/space-grotesk-700.woff2"),
    weight: "700",
  }),
  loadFont({
    family: kilnDisplayFont,
    url: staticFile("fonts/fraunces-900.woff2"),
    weight: "900",
  }),
  loadFont({
    family: bodyFont,
    url: staticFile("fonts/inter-400.woff2"),
    weight: "400",
  }),
  loadFont({
    family: bodyFont,
    url: staticFile("fonts/inter-500.woff2"),
    weight: "500",
  }),
  loadFont({
    family: monoFont,
    url: staticFile("fonts/jetbrains-mono-400.woff2"),
    weight: "400",
  }),
  loadFont({
    family: monoFont,
    url: staticFile("fonts/jetbrains-mono-500.woff2"),
    weight: "500",
  }),
]);
