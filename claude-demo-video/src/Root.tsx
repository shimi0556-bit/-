import "./index.css";
import { Composition, Folder } from "remotion";
import { ClaudeDemo } from "./ClaudeDemo";
import { Scene1Intro } from "./scenes/Scene1Intro";
import { Scene2Coding } from "./scenes/Scene2Coding";
import { Scene3Reasoning } from "./scenes/Scene3Reasoning";
import { Scene4Tools } from "./scenes/Scene4Tools";
import { Scene5Outro } from "./scenes/Scene5Outro";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="ClaudeDemo-Scenes">
        <Composition
          id="Scene1Intro"
          component={Scene1Intro}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene2Coding"
          component={Scene2Coding}
          durationInFrames={110}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene3Reasoning"
          component={Scene3Reasoning}
          durationInFrames={110}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene4Tools"
          component={Scene4Tools}
          durationInFrames={110}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="Scene5Outro"
          component={Scene5Outro}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="ClaudeDemo"
        component={ClaudeDemo}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
