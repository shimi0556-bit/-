import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: headlineFont } = loadSpaceGrotesk("normal", {
  weights: ["700"],
  subsets: ["latin"],
});

export const { fontFamily: bodyFont } = loadInter("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const { fontFamily: monoFont } = loadJetBrainsMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});
