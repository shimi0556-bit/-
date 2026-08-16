import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { headlineFont, bodyFont } from "../fonts";

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Intro"
      style={{
        backgroundColor: "#141311",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(218,119,86,0.25) 0%, rgba(218,119,86,0) 70%)",
          scale: interpolate(frame, [0, 2 * fps], [0.8, 1.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.ease),
          }),
        }}
      />
      <Interactive.Div
        name="Claude wordmark"
        style={{
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 148,
          color: "#F5F0EB",
          letterSpacing: "-2px",
          opacity: interpolate(frame, [0, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 0.7 * fps], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Claude
      </Interactive.Div>
      <Interactive.Div
        name="Intro subtitle"
        style={{
          fontFamily: bodyFont,
          fontWeight: 500,
          fontSize: 44,
          color: "#9C9690",
          marginTop: 28,
          opacity: interpolate(frame, [0.8 * fps, 1.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        An AI assistant built by Anthropic
      </Interactive.Div>
    </AbsoluteFill>
  );
};
