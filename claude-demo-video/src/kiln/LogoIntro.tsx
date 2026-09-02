import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { kilnDisplayFont } from "../fonts";

const EMBER = "#FF6B35";
const EMBER_SOFT = "#FFB199";
const GROUND = "#16110D";
const INK = "#F2E9DE";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export const LogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Ambient warmth behind everything, breathes in slowly.
  const ambientOpacity = interpolate(frame, [0, 1.2 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  // The ember ignites first — a small hot point at the kiln's mouth.
  const emberScale = interpolate(frame, [0.27 * fps, 0.93 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1), // slight overshoot, like a spark catching
  });
  const emberOpacity = interpolate(frame, [0.27 * fps, 0.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Continuous ember breathing once lit, held through the rest of the sting.
  const breathe =
    0.5 +
    0.5 *
      Math.sin(((frame - 0.6 * fps) / fps) * Math.PI * 1.1) *
      interpolate(frame, [0.6 * fps, 0.9 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // The kiln arch rises into place around the lit ember.
  const archProgress = interpolate(frame, [0.67 * fps, 1.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const archOpacity = interpolate(frame, [0.67 * fps, 1.1 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const archScale = interpolate(archProgress, [0, 1], [0.82, 1]);
  const archTranslateY = interpolate(archProgress, [0, 1], [18, 0]);

  // Wordmark settles in below the mark, tracking tightening from wide to normal.
  const wordProgress = interpolate(frame, [1.33 * fps, 1.9 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  const wordOpacity = interpolate(frame, [1.33 * fps, 1.7 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const wordTracking = interpolate(wordProgress, [0, 1], [26, 6]);
  const wordTranslateY = interpolate(wordProgress, [0, 1], [14, 0]);

  return (
    <AbsoluteFill
      name="KILN Logo Intro"
      style={{
        backgroundColor: GROUND,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Interactive.Div
        name="Ambient warmth"
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,107,53,0.16) 0%, rgba(255,107,53,0) 68%)`,
          opacity: ambientOpacity,
        }}
      />

      <Interactive.Div
        name="Mark group"
        style={{
          position: "relative",
          width: 220,
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Kiln arch — a rounded dome silhouette, the shape of the mark. */}
        <svg
          width={220}
          height={220}
          viewBox="0 0 220 220"
          style={{
            position: "absolute",
            opacity: archOpacity,
            scale: archScale,
            translate: `0px ${archTranslateY}px`,
          }}
        >
          <path
            d="M 40 190
               L 40 130
               C 40 74, 78 30, 110 30
               C 142 30, 180 74, 180 130
               L 180 190
               Z"
            fill="none"
            stroke={INK}
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Ember glow — the kiln's lit mouth, breathing continuously once ignited. */}
        <Interactive.Div
          name="Ember glow"
          style={{
            position: "absolute",
            bottom: 34,
            width: 46,
            height: 46,
            borderRadius: "50%",
            scale: emberScale * (1 + breathe * 0.08),
            opacity: emberOpacity,
            background: EMBER,
            boxShadow: `0 0 ${18 + breathe * 14}px ${6 + breathe * 4}px ${EMBER_SOFT}`,
          }}
        />
      </Interactive.Div>

      <Interactive.Div
        name="KILN wordmark"
        style={{
          marginTop: 36,
          fontFamily: kilnDisplayFont,
          fontWeight: 900,
          fontSize: 72,
          color: INK,
          letterSpacing: `${wordTracking}px`,
          opacity: wordOpacity,
          translate: `0px ${wordTranslateY}px`,
        }}
      >
        KILN
      </Interactive.Div>
    </AbsoluteFill>
  );
};
