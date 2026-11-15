import fs from "node:fs/promises";
import path from "node:path";
import { analyzePhotos } from "./ai/analyzePhotos.js";
import { hasCredentials } from "./ai/client.js";
import { extractListing } from "./ai/extractListing.js";
import { fallbackAnalysis, fallbackListing } from "./curation/fallback.js";
import { computeMetrics } from "./curation/metrics.js";
import { buildStoryboard, scorePhotos } from "./storyboard.js";
import type { Brand, Storyboard } from "./types.js";

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|heic)$/i;

export async function listPhotos(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries.filter((f) => IMAGE_EXT.test(f)).sort().map((f) => path.join(dir, f));
}

export async function createStoryboard(opts: {
  fotosDir: string;
  anuncio: string;
  marca: Brand;
  maxCenas?: number;
  usarIA?: boolean;
  log?: (msg: string) => void;
}): Promise<{ storyboard: Storyboard; ranking: { arquivo: string; ambiente: string; nota: number }[] }> {
  const log = opts.log ?? (() => {});
  const usarIA = opts.usarIA ?? hasCredentials();
  const files = await listPhotos(opts.fotosDir);
  if (!files.length) throw new Error(`Nenhuma foto encontrada em ${opts.fotosDir}`);

  log(`Analisando ${files.length} fotos (nitidez, exposição, duplicadas)...`);
  const metrics = await Promise.all(files.map(computeMetrics));

  let listingP;
  let analysesP;
  if (usarIA) {
    log("Lendo o anúncio e avaliando as fotos com IA...");
    listingP = extractListing(opts.anuncio);
    analysesP = analyzePhotos(metrics);
  } else {
    log("Sem credencial da API: usando heurísticas locais (modo demo).");
    listingP = Promise.resolve(fallbackListing(opts.anuncio));
    analysesP = Promise.resolve(metrics.map(fallbackAnalysis));
  }
  const [listing, analyses] = await Promise.all([listingP, analysesP]);

  const scored = scorePhotos(metrics, analyses);
  const storyboard = buildStoryboard({ photos: scored, listing, brand: opts.marca, maxCenas: opts.maxCenas });
  const ranking = [...scored]
    .sort((a, b) => b.nota_final - a.nota_final)
    .map((p) => ({ arquivo: p.arquivo, ambiente: p.ambiente, nota: p.nota_final }));
  return { storyboard, ranking };
}
