import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { Storyboard } from "../src/types";
import { BrandTag, CameraPhoto, Caption, Highlights, Outro, Scrim, useUnit, useVertical } from "./components";
import { FPS, OUTRO_S, TRANSITION_S } from "./theme";

export type PropertyVideoProps = { storyboard: Storyboard; trilha?: string };

const TRANSITION = Math.round(TRANSITION_S * FPS);

/** Calcula início/duração de cada cena com sobreposição para o crossfade. */
export function timeline(sb: Storyboard) {
  let start = 0;
  const items = sb.cenas.map((c) => {
    const dur = Math.round(c.duracao_s * FPS) + TRANSITION;
    const item = { start, dur };
    start += dur - TRANSITION;
    return item;
  });
  const outro = { start, dur: Math.round(OUTRO_S * FPS) + TRANSITION };
  return { items, outro, total: outro.start + outro.dur };
}

const FadeIn: React.FC<{ children: React.ReactNode; first: boolean }> = ({ children, first }) => {
  const frame = useCurrentFrame();
  const opacity = first ? 1 : interpolate(frame, [0, TRANSITION], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const OpeningText: React.FC<{ sb: Storyboard }> = ({ sb }) => {
  const u = useUnit();
  const vertical = useVertical();
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        padding: vertical ? `0 ${80 * u}px ${380 * u}px` : `0 ${110 * u}px ${110 * u}px`,
      }}
    >
      <Highlights items={sb.destaques} />
    </AbsoluteFill>
  );
};

export const PropertyVideo: React.FC<PropertyVideoProps> = ({ storyboard: sb, trilha }) => {
  const { items, outro } = timeline(sb);
  const u = useUnit();
  const vertical = useVertical();
  const last = sb.cenas[sb.cenas.length - 1];
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {sb.cenas.map((scene, i) => (
        <Sequence key={scene.foto + i} from={items[i].start} durationInFrames={items[i].dur}>
          <FadeIn first={i === 0}>
            <CameraPhoto scene={scene} durationInFrames={items[i].dur} />
            <Scrim />
            {/* Abertura: título sobe para dar espaço aos chips. */}
            <AbsoluteFill style={i === 0 ? { transform: `translateY(${-(vertical ? 150 : 110) * u}px)` } : undefined}>
              <Caption scene={scene} brand={sb.marca} label={i === 0 ? sb.imovel.tipo : undefined} />
            </AbsoluteFill>
            {i === 0 ? <OpeningText sb={sb} /> : null}
            <BrandTag brand={sb.marca} />
          </FadeIn>
        </Sequence>
      ))}
      {last ? (
        <Sequence from={outro.start} durationInFrames={outro.dur}>
          <FadeIn first={false}>
            <Outro listing={sb.imovel} brand={sb.marca} background={last} durationInFrames={outro.dur} />
          </FadeIn>
        </Sequence>
      ) : null}
      {trilha ? <Audio src={staticFile(trilha)} volume={(f) => interpolate(f, [outro.start + outro.dur - FPS, outro.start + outro.dur], [0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /> : null}
    </AbsoluteFill>
  );
};
