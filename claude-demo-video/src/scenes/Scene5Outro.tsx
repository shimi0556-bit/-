import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { headlineFont, bodyFont } from "../fonts";

export const Scene5Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Outro"
      style={{
        backgroundColor: "#141311",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Interactive.Div
        name="Outro wordmark"
        style={{
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 120,
          color: "#F5F0EB",
          letterSpacing: "-1.5px",
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 0.5 * fps], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      >
        Claude
      </Interactive.Div>
      <Interactive.Div
        name="Outro tagline"
        style={{
          fontFamily: bodyFont,
          fontWeight: 500,
          fontSize: 40,
          color: "#DA7756",
          marginTop: 24,
          opacity: interpolate(frame, [0.6 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        claude.ai
      </Interactive.Div>
    </AbsoluteFill>
  );
};
