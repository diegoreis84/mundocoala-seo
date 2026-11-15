import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { gerarTrilha } from "./audio/trilha.js";
import { FPS, timeline } from "./timeline.js";
import type { Storyboard } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type Formato = "vertical" | "horizontal";
const COMPOSITION: Record<Formato, string> = { vertical: "Vertical", horizontal: "Horizontal" };

/**
 * Renderiza o roteiro. `assetsDir` precisa conter as fotos (e logo/trilha, se houver)
 * com os nomes usados no roteiro.
 */
export async function renderStoryboard(opts: {
  storyboard: Storyboard;
  assetsDir: string;
  outDir: string;
  formatos: Formato[];
  /** Prefixo do arquivo (ex.: "padrao" → video-padrao-vertical.mp4). */
  nome?: string;
  /** Música própria (arquivo dentro de assetsDir). Sem ela, a trilha é composta automaticamente. */
  trilha?: string;
  /** false = vídeo sem música. */
  musica?: boolean;
  onProgress?: (formato: Formato, p: number) => void;
}): Promise<string[]> {
  const { storyboard, outDir } = opts;

  // Pasta pública só com o que o vídeo usa.
  const publicDir = path.join(outDir, `public-${opts.nome ?? "video"}`);
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.mkdir(publicDir, { recursive: true });
  const files = new Set(storyboard.cenas.flatMap((c) => [c.foto, c.video].filter(Boolean) as string[]));
  if (storyboard.marca.logo) files.add(storyboard.marca.logo);
  if (opts.trilha) files.add(opts.trilha);
  for (const f of files) await fs.copyFile(path.join(opts.assetsDir, f), path.join(publicDir, path.basename(f)));
  await fs.cp(path.join(ROOT, "remotion/fonts"), path.join(publicDir, "fonts"), { recursive: true });

  // Trilha composta sob medida (livre de direitos), com a duração exata do vídeo.
  let trilha = opts.trilha ? path.basename(opts.trilha) : undefined;
  if (!trilha && opts.musica !== false) {
    trilha = "trilha.wav";
    const duracao = timeline(storyboard).total / FPS;
    await gerarTrilha(path.join(publicDir, trilha), duracao, storyboard.modo === "ganchos" ? "ritmo" : "suave");
  }

  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir });
  const browserExecutable = process.env.REMOTION_BROWSER || null;
  const inputProps = { storyboard, trilha };

  const outputs: string[] = [];
  for (const formato of opts.formatos) {
    const composition = await selectComposition({ serveUrl, id: COMPOSITION[formato], inputProps, browserExecutable });
    const outputLocation = path.join(outDir, `video-${opts.nome ? opts.nome + "-" : ""}${formato}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps,
      browserExecutable,
      onProgress: ({ progress }) => opts.onProgress?.(formato, progress),
    });
    outputs.push(outputLocation);
  }
  return outputs;
}
