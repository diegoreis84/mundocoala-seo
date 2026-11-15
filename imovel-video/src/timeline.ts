/** Linha do tempo do vídeo (pura, usada pelo render e pela composição). */
import type { Storyboard } from "./types.js";

export const FPS = 30;
export const TRANSITION_S = 0.6;
export const OUTRO_S = 4.5;
const TRANSITION = Math.round(TRANSITION_S * FPS);

/** Início/duração de cada cena com sobreposição para o crossfade. */
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
