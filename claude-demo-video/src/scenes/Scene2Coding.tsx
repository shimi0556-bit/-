import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { headlineFont, monoFont } from "../fonts";

export const Scene2Coding: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Coding"
      style={{
        backgroundColor: "#141311",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 140,
      }}
    >
      <Interactive.Div
        name="Coding label"
        style={{
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 72,
          color: "#F5F0EB",
          marginBottom: 56,
          opacity: interpolate(frame, [0, 15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Writes and debugs code
      </Interactive.Div>

      <Interactive.Div
        name="Code editor card"
        style={{
          width: 1200,
          borderRadius: 24,
          backgroundColor: "#1E1C19",
          border: "1px solid #2C2925",
          padding: "36px 48px",
          boxShadow: "0 40px 80px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: "#4A453F",
            }}
          />
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: "#4A453F",
            }}
          />
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: "#4A453F",
            }}
          />
        </div>

        <Interactive.Div
          name="Code line 1"
          style={{
            fontFamily: monoFont,
            fontSize: 34,
            lineHeight: 1.6,
            whiteSpace: "pre",
            opacity: interpolate(frame, [18, 27], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [18, 27], ["0px 10px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ color: "#DA7756" }}>def </span>
          <span style={{ color: "#F5F0EB" }}>fibonacci</span>
          <span style={{ color: "#9C9690" }}>(n):</span>
        </Interactive.Div>

        <Interactive.Div
          name="Code line 2"
          style={{
            fontFamily: monoFont,
            fontSize: 34,
            lineHeight: 1.6,
            whiteSpace: "pre",
            opacity: interpolate(frame, [29, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [29, 38], ["0px 10px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ color: "#DA7756" }}>    if</span>
          <span style={{ color: "#9C9690" }}> n &lt;= 1:</span>
        </Interactive.Div>

        <Interactive.Div
          name="Code line 3"
          style={{
            fontFamily: monoFont,
            fontSize: 34,
            lineHeight: 1.6,
            whiteSpace: "pre",
            opacity: interpolate(frame, [40, 49], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [40, 49], ["0px 10px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ color: "#DA7756" }}>        return</span>
          <span style={{ color: "#9C9690" }}> n</span>
        </Interactive.Div>

        <Interactive.Div
          name="Code line 4"
          style={{
            fontFamily: monoFont,
            fontSize: 34,
            lineHeight: 1.6,
            whiteSpace: "pre",
            opacity: interpolate(frame, [51, 60], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [51, 60], ["0px 10px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ color: "#DA7756" }}>    return</span>
          <span style={{ color: "#9C9690" }}>
            {" "}
            fibonacci(n-1) + fibonacci(n-2)
          </span>
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
