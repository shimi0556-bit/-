import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
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

export const Scene4Tools: React.FC = () => {
  const frame = useCurrentFrame();

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
          opacity: interpolate(frame, [0, 15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Uses tools to get things done
      </Interactive.Div>

      <Interactive.Svg
        name="Connector lines"
        width={1920}
        height={1080}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Interactive.Line
          name="Line to Search"
          x1={660}
          y1={440}
          x2={960}
          y2={800}
          stroke="#2C2925"
          strokeWidth={3}
          strokeDasharray={469}
          strokeDashoffset={interpolate(frame, [48, 63], [469, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
        />
        <Interactive.Line
          name="Line to Terminal"
          x1={960}
          y1={440}
          x2={960}
          y2={800}
          stroke="#2C2925"
          strokeWidth={3}
          strokeDasharray={360}
          strokeDashoffset={interpolate(frame, [54, 69], [360, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
        />
        <Interactive.Line
          name="Line to Files"
          x1={1260}
          y1={440}
          x2={960}
          y2={800}
          stroke="#2C2925"
          strokeWidth={3}
          strokeDasharray={469}
          strokeDashoffset={interpolate(frame, [60, 75], [469, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
        />
      </Interactive.Svg>

      <Interactive.Div
        name="Search node"
        style={{
          position: "absolute",
          top: 370,
          left: 590,
          width: 140,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(frame, [27, 39], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [27, 39], ["0px 20px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
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
          <ToolIcon type="search" />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 32, color: "#9C9690" }}>
          Search
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Terminal node"
        style={{
          position: "absolute",
          top: 370,
          left: 890,
          width: 140,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(frame, [33, 45], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [33, 45], ["0px 20px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
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
          <ToolIcon type="terminal" />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 32, color: "#9C9690" }}>
          Terminal
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Files node"
        style={{
          position: "absolute",
          top: 370,
          left: 1190,
          width: 140,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(frame, [39, 51], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [39, 51], ["0px 20px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
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
          <ToolIcon type="file" />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 32, color: "#9C9690" }}>
          Files
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Claude node"
        style={{
          position: "absolute",
          top: 700,
          left: 860,
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
          scale: interpolate(frame, [69, 81], [0.6, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [69, 78], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Claude
      </Interactive.Div>
    </AbsoluteFill>
  );
};
