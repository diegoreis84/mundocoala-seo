import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { PropertyVideo, timeline, type PropertyVideoProps } from "./PropertyVideo";
import { FPS } from "./theme";
import demo from "./demo-storyboard.json";
import type { Storyboard } from "../src/types";

const calc: CalculateMetadataFunction<PropertyVideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, timeline(props.storyboard).total),
});

const defaultProps: PropertyVideoProps = { storyboard: demo as Storyboard };

export const Root: React.FC = () => (
  <>
    <Composition id="Vertical" component={PropertyVideo} width={1080} height={1920} fps={FPS} durationInFrames={1} defaultProps={defaultProps} calculateMetadata={calc} />
    <Composition id="Horizontal" component={PropertyVideo} width={1920} height={1080} fps={FPS} durationInFrames={1} defaultProps={defaultProps} calculateMetadata={calc} />
  </>
);
