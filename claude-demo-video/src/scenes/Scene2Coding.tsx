import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { headlineFont, monoFont } from "../fonts";

const codeLines: { t: string; c: string }[][] = [
  [
    { t: "def ", c: "#DA7756" },
    { t: "fibonacci", c: "#F5F0EB" },
    { t: "(n):", c: "#9C9690" },
  ],
  [
    { t: "    if", c: "#DA7756" },
    { t: " n <= 1:", c: "#9C9690" },
  ],
  [
    { t: "        return", c: "#DA7756" },
    { t: " n", c: "#9C9690" },
  ],
  [
    { t: "    return", c: "#DA7756" },
    { t: " fibonacci(n-1) + fibonacci(n-2)", c: "#9C9690" },
  ],
];

export const Scene2Coding: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Writes and debugs code
      </Interactive.Div>
      <div
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
        {codeLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: monoFont,
              fontSize: 34,
              lineHeight: 1.6,
              whiteSpace: "pre",
              opacity: interpolate(
                frame,
                [0.6 * fps + i * 0.35 * fps, 0.9 * fps + i * 0.35 * fps],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
              translate: interpolate(
                frame,
                [0.6 * fps + i * 0.35 * fps, 0.9 * fps + i * 0.35 * fps],
                ["0px 10px", "0px 0px"],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
            }}
          >
            {line.map((seg, j) => (
              <span key={j} style={{ color: seg.c }}>
                {seg.t}
              </span>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
