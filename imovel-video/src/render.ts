import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
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
  trilha?: string;
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

  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion/index.ts"), publicDir });
  const browserExecutable = process.env.REMOTION_BROWSER || null;
  const inputProps = { storyboard, trilha: opts.trilha ? path.basename(opts.trilha) : undefined };

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
