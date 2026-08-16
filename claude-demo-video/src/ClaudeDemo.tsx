import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Scene1Intro } from "./scenes/Scene1Intro";
import { Scene2Coding } from "./scenes/Scene2Coding";
import { Scene3Reasoning } from "./scenes/Scene3Reasoning";
import { Scene4Tools } from "./scenes/Scene4Tools";
import { Scene5Outro } from "./scenes/Scene5Outro";

export const ClaudeDemo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={90} name="Intro">
        <Scene1Intro />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={110} name="Coding">
        <Scene2Coding />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={110} name="Reasoning">
        <Scene3Reasoning />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={110} name="Tools">
        <Scene4Tools />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={90} name="Outro">
        <Scene5Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
