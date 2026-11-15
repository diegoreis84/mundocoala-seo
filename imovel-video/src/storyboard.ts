import path from "node:path";
import { colorDistance, hamming } from "./curation/metrics.js";
import {
  ROOM_LABEL,
  type Brand,
  type Listing,
  type Motion,
  type PhotoAnalysis,
  type PhotoMetrics,
  type Room,
  type Scene,
  type ScoredPhoto,
  type Storyboard,
} from "./types.js";

/** Roteiro de visita: [ambiente, máximo de fotos]. Abertura (fachada/vista) é tratada à parte. */
const TOUR: [Room, number][] = [
  ["sala", 2],
  ["varanda", 1],
  ["cozinha", 1],
  ["suite", 1],
  ["quarto", 1],
  ["banheiro", 1],
  ["escritorio", 1],
  ["piscina", 1],
  ["lazer", 2],
  ["outro", 1],
];
/** Ambientes que normalmente não entram no vídeo. */
const SKIP: Room[] = ["planta", "area_servico", "garagem"];

const MOTIONS: Motion[] = ["zoom_in", "pan_direita", "zoom_out", "pan_esquerda"];
const DUP_DISTANCE = 10; // bits de diferença no dHash para considerar "mesma foto"
const DUP_COLOR = 18; // e cor média parecida (estrutura igual + mesma paleta)

const clamp = (v: number) => Math.max(0, Math.min(10, v));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Nota final = estética (IA) + nitidez relativa ao próprio anúncio + exposição,
 * menos penalidades. Nitidez é relativa porque as fotos de um anúncio vêm da mesma câmera.
 */
export function scorePhotos(metrics: PhotoMetrics[], analyses: PhotoAnalysis[]): ScoredPhoto[] {
  const byName = new Map(analyses.map((a) => [a.arquivo, a]));
  const med = median(metrics.map((m) => m.nitidez_bruta));
  return metrics.flatMap((m) => {
    const a = byName.get(m.arquivo);
    if (!a) return [];
    const diff = m.nitidez_bruta - med; // log10: -0.6 ≈ 4x menos detalhe
    const nitidez = clamp(7 + 5 * diff);
    const tecnicos: string[] = [];
    if (diff < -0.6 || m.nitidez_bruta < 1.5) tecnicos.push("borrada");
    if (m.exposicao < 4) tecnicos.push("exposição ruim");
    if (Math.max(m.largura, m.altura) < 1000) tecnicos.push("baixa resolução");
    let nota = 0.65 * a.nota_estetica + 0.2 * nitidez + 0.15 * m.exposicao;
    nota -= 1.0 * a.problemas.length + 2.5 * tecnicos.length;
    return [{ ...m, ...a, nitidez, problemas_tecnicos: tecnicos, nota_final: Math.round(nota * 100) / 100 }];
  });
}

/** Remove quase-duplicadas mantendo a de maior nota. */
export function dedupe(photos: ScoredPhoto[]) {
  const sorted = [...photos].sort((a, b) => b.nota_final - a.nota_final);
  const kept: ScoredPhoto[] = [];
  const dropped: { foto: string; motivo: string }[] = [];
  for (const p of sorted) {
    const twin = kept.find((k) => hamming(k.hash, p.hash) <= DUP_DISTANCE && colorDistance(k.cor, p.cor) <= DUP_COLOR);
    if (twin) dropped.push({ foto: p.arquivo, motivo: `parecida com ${twin.arquivo}` });
    else kept.push(p);
  }
  return { kept, dropped };
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
const fmtArea = (n: number) => `${n.toLocaleString("pt-BR")} m²`;

function caption(room: Room, l: Listing, used: Set<string>): { titulo: string; subtitulo?: string } {
  const frase = l.frases_por_ambiente.find((f) => f.ambiente === room && !used.has(f.frase))?.frase;
  if (frase) used.add(frase);
  const titulo = frase ?? ROOM_LABEL[room];
  let subtitulo: string | undefined;
  switch (room) {
    case "sala":
      if (l.area_m2) subtitulo = `${fmtArea(l.area_m2)} privativos`;
      break;
    case "suite":
      if (l.suites) subtitulo = plural(l.suites, "suíte", "suítes");
      break;
    case "quarto":
      if (l.quartos) subtitulo = plural(l.quartos, "quarto", "quartos");
      break;
    case "banheiro":
      if (l.banheiros) subtitulo = plural(l.banheiros, "banheiro", "banheiros");
      break;
    case "garagem":
      if (l.vagas) subtitulo = plural(l.vagas, "vaga", "vagas");
      break;
  }
  if (!subtitulo) {
    const dif = l.diferenciais.find((d) => !used.has(d));
    if (dif) {
      used.add(dif);
      subtitulo = dif;
    }
  }
  return { titulo, subtitulo };
}

export function highlights(l: Listing): string[] {
  const h: string[] = [];
  if (l.area_m2) h.push(fmtArea(l.area_m2));
  if (l.quartos) h.push(plural(l.quartos, "quarto", "quartos"));
  if (l.suites) h.push(plural(l.suites, "suíte", "suítes"));
  if (l.vagas) h.push(plural(l.vagas, "vaga", "vagas"));
  return h.slice(0, 4);
}

export function buildStoryboard(opts: {
  photos: ScoredPhoto[];
  listing: Listing;
  brand: Brand;
  maxCenas?: number;
  notaMinima?: number;
}): Storyboard {
  const { listing, brand } = opts;
  const maxCenas = opts.maxCenas ?? 8;
  const notaMinima = opts.notaMinima ?? 3;

  const { kept, dropped } = dedupe(opts.photos);
  const descartadas = [...dropped];
  const pool = kept.filter((p) => {
    if (p.nota_final < notaMinima) descartadas.push({ foto: p.arquivo, motivo: `nota baixa (${p.nota_final}${[...p.problemas_tecnicos, ...p.problemas].length ? ": " + [...p.problemas_tecnicos, ...p.problemas].join(", ") : ""})` });
    else if (SKIP.includes(p.ambiente)) descartadas.push({ foto: p.arquivo, motivo: `ambiente ${p.ambiente}` });
    else return true;
    return false;
  });
  const best = (room: Room) => pool.filter((p) => p.ambiente === room).sort((a, b) => b.nota_final - a.nota_final);

  const chosen: ScoredPhoto[] = [];
  // Abertura: melhor fachada ou vista; senão, a melhor foto geral.
  const opening = [...best("fachada"), ...best("vista")].sort((a, b) => b.nota_final - a.nota_final)[0]
    ?? [...pool].sort((a, b) => b.nota_final - a.nota_final)[0];
  if (opening) chosen.push(opening);

  // Primeira passada: 1 por ambiente; segunda: completa com extras permitidos.
  for (const pass of [1, 2]) {
    for (const [room, max] of TOUR) {
      const already = chosen.filter((c) => c.ambiente === room).length;
      const limit = pass === 1 ? 1 : max;
      for (const p of best(room)) {
        if (chosen.length >= maxCenas || already >= limit) break;
        if (chosen.includes(p)) continue;
        chosen.push(p);
        break;
      }
    }
  }
  // Mantém a ordem do roteiro (a 2ª passada adiciona no fim).
  const order = (r: Room) => (r === "fachada" || r === "vista" ? -1 : TOUR.findIndex(([t]) => t === r));
  const [first, ...rest] = chosen;
  const ordered = first ? [first, ...rest.sort((a, b) => order(a.ambiente) - order(b.ambiente))] : [];

  for (const p of pool) if (!chosen.includes(p)) descartadas.push({ foto: p.arquivo, motivo: "fora do limite de cenas" });

  const used = new Set<string>();
  const local = [listing.bairro, listing.cidade].filter(Boolean).join(", ");
  const cenas: Scene[] = ordered.map((p, i) => {
    const cap = i === 0 ? { titulo: listing.titulo, subtitulo: local || listing.tipo } : caption(p.ambiente, listing, used);
    return {
      foto: path.basename(p.caminho),
      ambiente: p.ambiente,
      ...cap,
      movimento: MOTIONS[i % MOTIONS.length],
      duracao_s: i === 0 ? 3.5 : 3,
    };
  });

  return { versao: 1, imovel: listing, marca: brand, destaques: highlights(listing), cenas, descartadas };
}
