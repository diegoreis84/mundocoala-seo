import fs from "node:fs/promises";
import path from "node:path";
import { analyzePhotos } from "./ai/analyzePhotos.js";
import { hasCredentials } from "./ai/client.js";
import { extractListing } from "./ai/extractListing.js";
import { fallbackAnalysis, fallbackListing } from "./curation/fallback.js";
import { computeMetrics } from "./curation/metrics.js";
import { generateHookPack } from "./hooks/generate.js";
import { templateHookPack } from "./hooks/templates.js";
import { buildHookStoryboard, buildStoryboard, scorePhotos, selectPhotos } from "./storyboard.js";
import type { Brand, HookPack, Listing, PhotoAnalysis, Storyboard } from "./types.js";

export type Modo = "padrao" | "ganchos";

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|heic)$/i;

export async function listPhotos(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries.filter((f) => IMAGE_EXT.test(f)).sort().map((f) => path.join(dir, f));
}

export async function createStoryboards(opts: {
  fotosDir: string;
  anuncio: string;
  marca: Brand;
  modos: Modo[];
  maxCenas?: number;
  usarIA?: boolean;
  /** Resultados prontos (revisados ou de outra execução) que substituem a etapa de IA. */
  prontos?: { dados?: Listing; analise?: PhotoAnalysis[]; ganchos?: HookPack };
  log?: (msg: string) => void;
}): Promise<{
  storyboards: Storyboard[];
  pack?: HookPack;
  ranking: { arquivo: string; ambiente: string; nota: number }[];
}> {
  const log = opts.log ?? (() => {});
  const usarIA = opts.usarIA ?? hasCredentials();
  const files = await listPhotos(opts.fotosDir);
  if (!files.length) throw new Error(`Nenhuma foto encontrada em ${opts.fotosDir}`);

  log(`Analisando ${files.length} fotos (nitidez, exposição, duplicadas)...`);
  const metrics = await Promise.all(files.map(computeMetrics));

  let listingP: Promise<Listing>;
  let analysesP: Promise<PhotoAnalysis[]>;
  const pr = opts.prontos ?? {};
  if (pr.dados && pr.analise) {
    log("Usando dados do anúncio e avaliação das fotos já prontos.");
    listingP = Promise.resolve(pr.dados);
    analysesP = Promise.resolve(pr.analise);
  } else if (usarIA) {
    log("Lendo o anúncio e avaliando as fotos com IA...");
    listingP = extractListing(opts.anuncio);
    analysesP = analyzePhotos(metrics);
  } else {
    log("Sem credencial da API: usando heurísticas locais (modo demo).");
    listingP = Promise.resolve(fallbackListing(opts.anuncio));
    analysesP = Promise.resolve(metrics.map(fallbackAnalysis));
  }
  const prontos = opts.prontos ?? {};
  if (prontos.dados) listingP = Promise.resolve(prontos.dados);
  if (prontos.analise) analysesP = Promise.resolve(prontos.analise);
  const [listing, analyses] = await Promise.all([listingP, analysesP]);
  const scored = scorePhotos(metrics, analyses);

  const storyboards: Storyboard[] = [];
  if (opts.modos.includes("padrao")) {
    storyboards.push(buildStoryboard({ photos: scored, listing, brand: opts.marca, maxCenas: opts.maxCenas }));
  }
  let pack: HookPack | undefined;
  if (opts.modos.includes("ganchos")) {
    const ambientes = selectPhotos(scored, 12).pool.map((p) => p.ambiente);
    log(pr.ganchos ? "Usando kit de ganchos já pronto." : usarIA ? "Criando ganchos, roteiros e legenda com IA..." : "Criando ganchos a partir dos modelos...");
    pack = prontos.ganchos
      ? prontos.ganchos
      : usarIA
      ? await generateHookPack(listing, ambientes, opts.marca.contato)
      : templateHookPack(listing, ambientes, opts.marca.contato);
    storyboards.push(buildHookStoryboard({ photos: scored, listing, brand: opts.marca, pack }));
  }

  const ranking = [...scored]
    .sort((a, b) => b.nota_final - a.nota_final)
    .map((p) => ({ arquivo: p.arquivo, ambiente: p.ambiente, nota: p.nota_final }));
  return { storyboards, pack, ranking };
}
