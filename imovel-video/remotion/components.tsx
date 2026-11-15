import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { ROOM_LABEL, type Brand, type Listing, type Scene } from "../src/types";
import { sans, serif } from "./theme";

/** Escala tipográfica: 1 = lado menor de 1080px. */
export const useUnit = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
};
export const useVertical = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

const ease = Easing.bezier(0.25, 0.1, 0.25, 1);

/** Foto com movimento de câmera suave (Ken Burns) ou clipe animado. */
export const CameraPhoto: React.FC<{ scene: Scene; durationInFrames: number; blur?: number }> = ({
  scene,
  durationInFrames,
  blur = 0,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp", easing: ease });
  let scale = 1.12;
  let x = 0;
  switch (scene.movimento) {
    case "zoom_in":
      scale = interpolate(t, [0, 1], [1.04, 1.16]);
      break;
    case "zoom_out":
      scale = interpolate(t, [0, 1], [1.16, 1.04]);
      break;
    case "pan_direita":
      x = interpolate(t, [0, 1], [-4, 4]);
      break;
    case "pan_esquerda":
      x = interpolate(t, [0, 1], [4, -4]);
      break;
  }
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `scale(${scale}) translateX(${x}%)`,
    filter: blur ? `blur(${blur}px) brightness(0.55)` : undefined,
  };
  if (scene.video) return <OffthreadVideo src={staticFile(scene.video)} style={style} muted />;
  return <Img src={staticFile(scene.foto)} style={style} />;
};

/** Gradiente de leitura na base da imagem. */
export const Scrim: React.FC<{ strength?: number }> = ({ strength = 0.75 }) => (
  <AbsoluteFill
    style={{
      background: [
        `linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength * 0.55}) 72%, rgba(0,0,0,${strength}) 100%)`,
        "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 16%)",
      ].join(", "),
    }}
  />
);

const useEnter = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8 } });
  return { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
};

/** Legenda de cena: rótulo do ambiente, título serifado e subtítulo. */
export const Caption: React.FC<{ scene: Scene; brand: Brand; label?: string }> = ({ scene, brand, label }) => {
  const u = useUnit();
  const vertical = useVertical();
  const frame = useCurrentFrame();
  const rotulo = label ?? ROOM_LABEL[scene.ambiente];
  const showLabel = rotulo !== "" && rotulo.toLowerCase() !== scene.titulo.toLowerCase();
  const line = interpolate(frame, [6, 22], [0, 64 * u], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        padding: vertical ? `0 ${80 * u}px ${380 * u}px` : `0 ${110 * u}px ${110 * u}px`,
        color: "white",
      }}
    >
      <div style={{ height: 2 * u, width: line, background: brand.cor, marginBottom: 22 * u }} />
      <div
        style={{
          ...useEnter(4),
          display: showLabel ? "block" : "none",
          fontFamily: sans,
          fontWeight: 600,
          fontSize: 30 * u,
          letterSpacing: 6 * u,
          textTransform: "uppercase",
          color: brand.cor,
          marginBottom: 14 * u,
        }}
      >
        {rotulo}
      </div>
      <div
        style={{
          ...useEnter(8),
          fontFamily: serif,
          fontWeight: 500,
          fontSize: (vertical ? 104 : 92) * u,
          lineHeight: 1.08,
          maxWidth: vertical ? "100%" : "68%",
          textShadow: "0 2px 24px rgba(0,0,0,0.35)",
        }}
      >
        {scene.titulo}
      </div>
      {scene.subtitulo ? (
        <div
          style={{
            ...useEnter(14),
            fontFamily: sans,
            fontWeight: 400,
            fontSize: 48 * u,
            marginTop: 16 * u,
            opacity: 0.92,
          }}
        >
          {scene.subtitulo}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const u = useUnit();
  return (
    <div
      style={{
        ...useEnter(delay),
        fontFamily: sans,
        fontWeight: 400,
        fontSize: 38 * u,
        padding: `${14 * u}px ${30 * u}px`,
        borderRadius: 999,
        background: "rgba(255,255,255,0.14)",
        border: `${1.5 * u}px solid rgba(255,255,255,0.35)`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {text}
    </div>
  );
};

/** Chips de destaque da abertura (vidro fosco). */
export const Highlights: React.FC<{ items: string[] }> = ({ items }) => {
  const u = useUnit();
  const vertical = useVertical();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 * u, marginTop: 34 * u, maxWidth: vertical ? "100%" : "75%" }}>
      {items.map((it, i) => (
        <Chip key={it} text={it} delay={18 + i * 5} />
      ))}
    </div>
  );
};

/**
 * Marca da imobiliária: logo pequeno no canto superior direito
 * (ou o nome, em texto, quando não há logo). Abaixo da barra de progresso no modo ganchos.
 */
export const BrandTag: React.FC<{ brand: Brand; belowBar?: boolean }> = ({ brand, belowBar }) => {
  const u = useUnit();
  const vertical = useVertical();
  const side = (vertical ? 60 : 80) * u;
  const top = (vertical ? (belowBar ? 105 : 80) : belowBar ? 60 : 50) * u;
  if (brand.logo) {
    return (
      <Img
        src={staticFile(brand.logo)}
        style={{
          position: "absolute",
          top,
          right: side,
          height: (vertical ? 62 : 56) * u,
          borderRadius: 4 * u,
          boxShadow: "0 2px 14px rgba(0,0,0,0.25)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        top,
        right: side,
        color: "white",
        fontFamily: sans,
        fontWeight: 600,
        fontSize: 28 * u,
        letterSpacing: 4 * u,
        textTransform: "uppercase",
        textShadow: "0 1px 12px rgba(0,0,0,0.4)",
      }}
    >
      {brand.nome}
    </div>
  );
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Encerramento: preço, custos mensais e contato. */
export const Outro: React.FC<{ listing: Listing; brand: Brand; background: Scene; durationInFrames: number; cta?: string }> = ({
  listing,
  brand,
  background,
  durationInFrames,
  cta,
}) => {
  const u = useUnit();
  const vertical = useVertical();
  const custos = [
    listing.condominio ? `Condomínio ${brl(listing.condominio)}` : null,
    listing.iptu ? `IPTU ${brl(listing.iptu)}` : null,
  ].filter(Boolean);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0d" }}>
      <CameraPhoto scene={{ ...background, movimento: "zoom_out" }} durationInFrames={durationInFrames} blur={18 * u} />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", textAlign: "center", color: "white", padding: 80 * u }}
      >
        {cta ? (
          <div style={{ ...useEnter(0), fontFamily: serif, fontWeight: 500, fontSize: (vertical ? 84 : 74) * u, lineHeight: 1.12, maxWidth: 960 * u, marginBottom: 56 * u }}>
            {cta}
          </div>
        ) : null}
        <div style={{ ...useEnter(2), fontFamily: sans, fontWeight: 600, fontSize: 32 * u, letterSpacing: 8 * u, textTransform: "uppercase", color: brand.cor }}>
          {listing.finalidade === "aluguel" ? "Para alugar" : "À venda"}
        </div>
        {listing.preco ? (
          <div style={{ ...useEnter(6), fontFamily: serif, fontWeight: 500, fontSize: (vertical ? 136 : 140) * u, marginTop: 18 * u }}>
            {brl(listing.preco)}
            {listing.finalidade === "aluguel" ? <span style={{ fontSize: 44 * u }}>/mês</span> : null}
          </div>
        ) : (
          <div style={{ ...useEnter(6), fontFamily: serif, fontSize: 84 * u, marginTop: 18 * u }}>Consulte</div>
        )}
        {custos.length ? (
          <div style={{ ...useEnter(10), fontFamily: sans, fontWeight: 400, fontSize: 38 * u, marginTop: 14 * u, opacity: 0.9 }}>
            {custos.join("  ·  ")}
          </div>
        ) : null}
        <div style={{ ...useEnter(16), height: 1.5 * u, width: 120 * u, background: "rgba(255,255,255,0.5)", margin: `${44 * u}px 0` }} />
        {brand.logo ? <Img src={staticFile(brand.logo)} style={{ ...useEnter(18), height: 90 * u, marginBottom: 20 * u }} /> : null}
        <div style={{ ...useEnter(18), fontFamily: serif, fontSize: 64 * u }}>{brand.nome}</div>
        {brand.contato ? (
          <div style={{ ...useEnter(22), fontFamily: sans, fontWeight: 600, fontSize: 48 * u, marginTop: 14 * u }}>{brand.contato}</div>
        ) : null}
        {brand.creci ? (
          <div style={{ ...useEnter(26), fontFamily: sans, fontWeight: 400, fontSize: 30 * u, marginTop: 12 * u, opacity: 0.8, letterSpacing: 2 * u }}>
            CRECI {brand.creci}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
