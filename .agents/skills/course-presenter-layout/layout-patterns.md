# Layout Patterns

Concrete Remotion code for each presenter+content pattern. All examples use `<Video>` from `@remotion/media` for the presenter clip — see [Embedding Videos](../remotion-markup/embedding-videos.md) for the full trim/volume/speed API — and `<AbsoluteFill>` / `<Sequence>` from `remotion` for layout and timing.

## Side panel

Presenter occupies a fixed strip for the whole lesson; content fills the rest. Good default for code/text-heavy lessons.

```tsx
import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

export const SidePanelLesson: React.FC = () => {
  return (
    <AbsoluteFill style={{ flexDirection: "row" }}>
      <AbsoluteFill style={{ position: "relative", width: "68%" }}>
        {/* Content goes here — see remotion-markup for authoring it */}
        <LessonContent />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          position: "relative",
          left: "68%",
          width: "32%",
          backgroundColor: "#111",
        }}
      >
        <Video
          src={staticFile("presenter.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

Keep the panel width consistent across a lesson's content layouts (don't let it drift between 30% and 40% scene to scene) so it doesn't read as a layout bug.

## Corner picture-in-picture (circular)

Presenter in a small circular box in a corner; content fills the frame. Good when the content itself needs full attention.

```tsx
import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

const PIP_SIZE = 220;

export const CornerPipLesson: React.FC = () => {
  return (
    <AbsoluteFill>
      <LessonContent />

      <div
        style={{
          position: "absolute",
          bottom: 48,
          right: 48,
          width: PIP_SIZE,
          height: PIP_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          border: "3px solid rgba(255,255,255,0.85)",
        }}
      >
        <Video
          src={staticFile("presenter.mp4")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Recenter if the source framing isn't already tight on the face
            transform: "scale(1.4)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
```

`objectFit: "cover"` combined with `borderRadius: "50%"` on the clipping wrapper (not the `<Video>` itself) is what keeps the circle clean regardless of the source video's aspect ratio. If the recording wasn't background-removed at capture time (see [Presenter Source](presenter-source.md)), this circular crop is usually enough on its own to hide a plain background without needing a real key.

Before finalizing a corner position, check it against every content layout the lesson uses — a bottom-right PiP is a common default, but if content also lives in that corner (e.g. a code minimap, a diagram legend), move the PIP to whichever corner is actually clear for this lesson.

## Full presenter cutaway (intro/outro/emphasis beats)

Presenter fills the frame alone, then the lesson transitions into a content layout.

```tsx
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

export const LessonWithCutaway: React.FC = () => {
  const { fps } = useVideoConfig();
  const introDuration = 4 * fps;

  return (
    <>
      <Sequence durationInFrames={introDuration}>
        <AbsoluteFill>
          <Video
            src={staticFile("presenter-intro.mp4")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={introDuration}>
        <SidePanelLesson />
      </Sequence>
    </>
  );
};
```

Cross-fade rather than hard-cut between the cutaway and the content layout if the tone should feel continuous — wrap both in an opacity `interpolate` over a short overlap window rather than a jump cut, unless a hard cut is the intended pacing (e.g., an energetic course intro).

## Split-screen sync

Presenter and content each get roughly half the frame — for "here's what I'm doing and why" explanation style, not long demos.

```tsx
import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

export const SplitScreenLesson: React.FC = () => {
  return (
    <AbsoluteFill style={{ flexDirection: "row" }}>
      <AbsoluteFill style={{ position: "relative", width: "50%" }}>
        <Video
          src={staticFile("presenter.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ position: "relative", left: "50%", width: "50%" }}>
        <LessonContent />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

## Restraint between the two sides

Don't animate the presenter panel and the content aggressively at the same moment — pick which one is "leading" at any given point in the lesson (usually the content, while the presenter panel stays visually calm) so the viewer isn't asked to track two changing things at once. A presenter panel that's simply static video (no extra motion added in code) is usually correct — its own talking motion is already enough life; reserve deliberate animation (scale/position changes, transitions) for lesson-structure moments like the cutaway-to-content transition above, not continuously.
