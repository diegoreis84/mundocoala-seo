import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { Storyboard } from "../src/types";
import { BrandTag, CameraPhoto, Caption, Highlights, Outro, Scrim, useUnit, useVertical } from "./components";
import { HookText, ProgressBar } from "./HookScene";
import { timeline } from "../src/timeline";
import { FPS, TRANSITION_S } from "./theme";

export { timeline };

export type PropertyVideoProps = { storyboard: Storyboard; trilha?: string };

const TRANSITION = Math.round(TRANSITION_S * FPS);

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
  const { items, outro, total } = timeline(sb);
  const ganchos = sb.modo === "ganchos";
  const u = useUnit();
  const vertical = useVertical();
  const last = sb.cenas[sb.cenas.length - 1];
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {sb.cenas.map((scene, i) => (
        <Sequence key={scene.foto + i} from={items[i].start} durationInFrames={items[i].dur}>
          <FadeIn first={i === 0}>
            <CameraPhoto scene={scene} durationInFrames={items[i].dur} />
            {scene.fase === "gancho" ? (
              <HookText texto={scene.titulo} destaque={sb.gancho?.destaque} brand={sb.marca} />
            ) : (
              <>
                <Scrim />
                {/* Abertura do modo padrão: título sobe para dar espaço aos chips. */}
                <AbsoluteFill style={i === 0 && !ganchos ? { transform: `translateY(${-(vertical ? 150 : 110) * u}px)` } : undefined}>
                  <Caption
                    scene={scene}
                    brand={sb.marca}
                    label={i === 0 && !ganchos ? sb.imovel.tipo : scene.fase === "desejo" ? "" : undefined}
                  />
                </AbsoluteFill>
                {i === 0 && !ganchos ? <OpeningText sb={sb} /> : null}
              </>
            )}
            <BrandTag brand={sb.marca} belowBar={ganchos} />
          </FadeIn>
        </Sequence>
      ))}
      {last ? (
        <Sequence from={outro.start} durationInFrames={outro.dur}>
          <FadeIn first={false}>
            <Outro listing={sb.imovel} brand={sb.marca} background={last} durationInFrames={outro.dur} cta={sb.cta} />
          </FadeIn>
        </Sequence>
      ) : null}
      {ganchos ? <ProgressBar total={total} brand={sb.marca} /> : null}
      {trilha ? (
        <Audio
          src={staticFile(trilha)}
          volume={(f) =>
            interpolate(f, [0, FPS * 0.5, total - FPS * 1.5, total], [0, 0.55, 0.55, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
