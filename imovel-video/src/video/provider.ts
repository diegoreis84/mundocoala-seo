/**
 * Camada de animação por IA (imagem -> vídeo), independente de fornecedor.
 *
 * Modelos de vídeo mudam rápido (preço, versões, endpoints que saem do ar), então o
 * resto do pipeline só conhece esta interface. Para plugar um fornecedor (Veo no Gemini
 * API/Vertex, Kling, Runway, Luma...), implemente `VideoProvider` e registre em `providers`.
 * O clipe gerado é gravado em `Scene.video` no roteiro e substitui o efeito de câmera.
 */
import type { Scene } from "../types.js";

export type AnimateInput = {
  imagePath: string;
  prompt: string;
  durationS: number;
  aspect: "9:16" | "16:9";
  outPath: string;
};

export interface VideoProvider {
  readonly name: string;
  /** Gera o clipe e devolve o caminho local do .mp4. */
  animate(input: AnimateInput): Promise<string>;
}

const CAMERA: Record<Scene["movimento"], string> = {
  zoom_in: "slow, smooth dolly-in toward the center of the room",
  zoom_out: "slow, smooth dolly-out revealing the space",
  pan_direita: "slow, smooth lateral truck to the right",
  pan_esquerda: "slow, smooth lateral truck to the left",
};

/**
 * Prompt conservador: a IA só pode mover a câmera. Alterar o imóvel (móveis, janelas,
 * vista, acabamentos) caracteriza propaganda enganosa.
 */
export function cameraPrompt(scene: Scene): string {
  return [
    `Real estate photograph brought to life with a ${CAMERA[scene.movimento]}.`,
    "Keep the architecture, furniture, materials, windows, view and lighting exactly as in the photo.",
    "Do not add, remove or change any object. No people, no text, no logos.",
    "Subtle natural parallax only. Photorealistic, stable, no warping.",
  ].join(" ");
}

export const providers: Record<string, VideoProvider> = {};
