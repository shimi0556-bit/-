import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { headlineFont, bodyFont } from "../fonts";

type IconType = "search" | "terminal" | "file";

const ToolIcon: React.FC<{ type: IconType }> = ({ type }) => {
  if (type === "search") {
    return (
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
        <circle cx="10" cy="10" r="7" stroke="#DA7756" strokeWidth="2" />
        <line
          x1="15.5"
          y1="15.5"
          x2="21"
          y2="21"
          stroke="#DA7756"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "terminal") {
    return (
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
        <rect
          x="2"
          y="4"
          width="20"
          height="16"
          rx="2"
          stroke="#DA7756"
          strokeWidth="2"
        />
        <path
          d="M6 9L10 12L6 15"
          stroke="#DA7756"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="12"
          y1="15"
          x2="18"
          y2="15"
          stroke="#DA7756"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 2H14L19 7V22H6V2Z"
        stroke="#DA7756"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line
        x1="9"
        y1="13"
        x2="15"
        y2="13"
        stroke="#DA7756"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="17"
        x2="15"
        y2="17"
        stroke="#DA7756"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

const nodes: { x: number; label: string; type: IconType; start: number }[] = [
  { x: 660, label: "Search", type: "search", start: 0.9 },
  { x: 960, label: "Terminal", type: "terminal", start: 1.1 },
  { x: 1260, label: "Files", type: "file", start: 1.3 },
];

const NODE_Y = 440;
const CENTER_X = 960;
const CENTER_Y = 800;

export const Scene4Tools: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Tools" style={{ backgroundColor: "#141311" }}>
      <Interactive.Div
        name="Tools label"
        style={{
          position: "absolute",
          top: 140,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 72,
          color: "#F5F0EB",
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Uses tools to get things done
      </Interactive.Div>

      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <line
          x1={660}
          y1={NODE_Y}
          x2={CENTER_X}
          y2={CENTER_Y}
          stroke="#2C2925"
          strokeWidth={3}
          strokeDasharray={469}
          strokeDashoffset={interpolate(
            frame,
            [1.6 * fps, 2.1 * fps],
            [469, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          )}
        />
        <line
          x1={960}
          y1={NODE_Y}
          x2={CENTER_X}
          y2={CENTER_Y}
          stroke="#2C2925"
          strokeWidth={3}
          strokeDasharray={360}
          strokeDashoffset={interpolate(
            frame,
            [1.8 * fps, 2.3 * fps],
            [360, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          )}
        />
        <line
          x1={1260}
          y1={NODE_Y}
          x2={CENTER_X}
          y2={CENTER_Y}
          stroke="#2C2925"
          strokeWidth={3}
          strokeDasharray={469}
          strokeDashoffset={interpolate(
            frame,
            [2.0 * fps, 2.5 * fps],
            [469, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          )}
        />
      </svg>

      {nodes.map((node) => (
        <div
          key={node.label}
          style={{
            position: "absolute",
            top: NODE_Y - 70,
            left: node.x - 70,
            width: 140,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            opacity: interpolate(
              frame,
              [node.start * fps, (node.start + 0.4) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
            translate: interpolate(
              frame,
              [node.start * fps, (node.start + 0.4) * fps],
              ["0px 20px", "0px 0px"],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            ),
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: "50%",
              backgroundColor: "#1E1C19",
              border: "2px solid #2C2925",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ToolIcon type={node.type} />
          </div>
          <div style={{ fontFamily: bodyFont, fontSize: 32, color: "#9C9690" }}>
            {node.label}
          </div>
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          top: CENTER_Y - 100,
          left: CENTER_X - 100,
          width: 200,
          height: 200,
          borderRadius: "50%",
          backgroundColor: "#DA7756",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: headlineFont,
          fontWeight: 700,
          fontSize: 44,
          color: "#141311",
          scale: interpolate(frame, [2.3 * fps, 2.7 * fps], [0.6, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [2.3 * fps, 2.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Claude
      </div>
    </AbsoluteFill>
  );
};
