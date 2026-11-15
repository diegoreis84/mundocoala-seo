import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand } from "../src/types";
import { useUnit, useVertical } from "./components";
import { sans } from "./theme";

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}$²]/gu, "");

/** Marca quais palavras do gancho pertencem ao trecho de destaque. */
function tokens(texto: string, destaque?: string) {
  const words = texto.split(/\s+/).filter(Boolean);
  const target = destaque ? destaque.split(/\s+/).map(norm).filter(Boolean) : [];
  const marked = words.map(() => false);
  if (target.length) {
    for (let i = 0; i + target.length <= words.length; i++) {
      if (target.every((t, k) => norm(words[i + k]) === t)) {
        for (let k = 0; k < target.length; k++) marked[i + k] = true;
        break;
      }
    }
  }
  return words.map((w, i) => ({ w, hi: marked[i] }));
}

const Word: React.FC<{ w: string; hi: boolean; delay: number; brand: Brand }> = ({ w, hi, delay, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6, stiffness: 180 } });
  return (
    <span
      style={{
        display: "inline-block",
        opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
        transform: `translateY(${(1 - p) * 30}%) scale(${0.9 + 0.1 * p})`,
        color: hi ? brand.cor : "white",
        marginRight: "0.26em",
      }}
    >
      {w}
    </span>
  );
};

/** Texto do gancho (0–3 s): grande, palavra a palavra, com trecho destacado. */
export const HookText: React.FC<{ texto: string; destaque?: string; brand: Brand }> = ({ texto, destaque, brand }) => {
  const u = useUnit();
  const vertical = useVertical();
  const words = tokens(texto, destaque);
  const size = (vertical ? 112 : 96) * u * (words.length > 11 ? 0.88 : 1);
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.7) 100%)",
        justifyContent: vertical ? "center" : "flex-end",
        padding: vertical ? `${200 * u}px ${80 * u}px ${260 * u}px` : `0 ${110 * u}px ${130 * u}px`,
      }}
    >
      <div
        style={{
          fontFamily: sans,
          fontWeight: 600,
          fontSize: size,
          lineHeight: 1.12,
          letterSpacing: -0.5 * u,
          maxWidth: vertical ? "100%" : "75%",
          textShadow: "0 4px 30px rgba(0,0,0,0.45)",
        }}
      >
        {words.map((t, i) => (
          <Word key={i} w={t.w} hi={t.hi} delay={2 + i * 2} brand={brand} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Barra de progresso no topo (ajuda a reter a atenção até o fim). */
export const ProgressBar: React.FC<{ total: number; brand: Brand }> = ({ total, brand }) => {
  const frame = useCurrentFrame();
  const u = useUnit();
  const vertical = useVertical();
  return (
    <div
      style={{
        position: "absolute",
        top: (vertical ? 70 : 30) * u,
        left: (vertical ? 80 : 110) * u,
        right: (vertical ? 80 : 110) * u,
        height: 5 * u,
        borderRadius: 99,
        background: "rgba(255,255,255,0.25)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: "100%", width: `${Math.min(100, (frame / total) * 100)}%`, background: brand.cor }} />
    </div>
  );
};
