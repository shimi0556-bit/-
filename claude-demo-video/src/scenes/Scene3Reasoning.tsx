import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { headlineFont, bodyFont } from "../fonts";

export const Scene3Reasoning: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Reasoning"
      style={{
        backgroundColor: "#141311",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 140,
      }}
    >
      <Interactive.Div
        name="Reasoning label"
        style={{
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 72,
          color: "#F5F0EB",
          marginBottom: 64,
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Thinks through problems
      </Interactive.Div>

      <div
        style={{
          width: 1200,
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <Interactive.Div
          name="User bubble"
          style={{
            alignSelf: "flex-end",
            maxWidth: 640,
            backgroundColor: "#2C2925",
            color: "#F5F0EB",
            fontFamily: bodyFont,
            fontWeight: 500,
            fontSize: 36,
            padding: "24px 32px",
            borderRadius: "28px 28px 4px 28px",
            opacity: interpolate(frame, [0.6 * fps, 1.0 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [0.6 * fps, 1.0 * fps],
              ["40px 0px", "0px 0px"],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        >
          How should I structure this API?
        </Interactive.Div>
        <Interactive.Div
          name="Claude bubble"
          style={{
            alignSelf: "flex-start",
            maxWidth: 760,
            backgroundColor: "#DA7756",
            color: "#141311",
            fontFamily: bodyFont,
            fontWeight: 500,
            fontSize: 36,
            padding: "24px 32px",
            borderRadius: "28px 28px 28px 4px",
            opacity: interpolate(frame, [1.4 * fps, 1.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [1.4 * fps, 1.8 * fps],
              ["-40px 0px", "0px 0px"],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        >
          Let's break it down: resources, versioning, then auth — step by
          step.
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
