import path from "node:path";
import { colorDistance, hamming } from "./curation/metrics.js";
import {
  ROOM_LABEL,
  type Brand,
  type HookPack,
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
  // Sem dado específico do ambiente, fica sem subtítulo (nunca mistura diferencial de outro ambiente).
  return { titulo, subtitulo: subtitulo && !redundant(titulo, subtitulo) ? subtitulo : undefined };
}

export function highlights(l: Listing): string[] {
  const h: string[] = [];
  if (l.area_m2) h.push(fmtArea(l.area_m2));
  if (l.quartos && l.quartos !== l.suites) h.push(plural(l.quartos, "quarto", "quartos"));
  if (l.suites) h.push(plural(l.suites, "suíte", "suítes"));
  if (l.vagas) h.push(plural(l.vagas, "vaga", "vagas"));
  return h.slice(0, 4);
}

/** Escolhe as fotos: remove duplicadas/ruins e monta o roteiro de visita. */
export function selectPhotos(photos: ScoredPhoto[], maxCenas = 8, notaMinima = 3) {
  const { kept, dropped } = dedupe(photos);
  const descartadas = [...dropped];
  const pool = kept.filter((p) => {
    const probs = [...p.problemas_tecnicos, ...p.problemas];
    if (p.nota_final < notaMinima) descartadas.push({ foto: p.arquivo, motivo: `nota baixa (${p.nota_final}${probs.length ? ": " + probs.join(", ") : ""})` });
    else if (SKIP.includes(p.ambiente)) descartadas.push({ foto: p.arquivo, motivo: `ambiente ${p.ambiente}` });
    else return true;
    return false;
  });
  const best = (room: Room) => pool.filter((p) => p.ambiente === room).sort((a, b) => b.nota_final - a.nota_final);

  const semAmbientes = pool.filter((p) => p.ambiente === "outro").length > pool.length / 2;
  const chosen: ScoredPhoto[] = [];
  // Abertura: melhor fachada ou vista; senão, a melhor foto geral.
  const opening = [...best("fachada"), ...best("vista")].sort((a, b) => b.nota_final - a.nota_final)[0]
    ?? [...pool].sort((a, b) => b.nota_final - a.nota_final)[0];
  if (opening) chosen.push(opening);

  // Primeira passada: 1 por ambiente; segunda: completa com extras permitidos.
  for (const pass of [1, 2]) {
    for (const [room, max] of TOUR) {
      const already = chosen.filter((c) => c.ambiente === room).length;
      // Sem classificação de ambientes (modo sem IA), "outro" pode ocupar as vagas restantes.
      const limit = pass === 1 ? 1 : room === "outro" && semAmbientes ? maxCenas : max;
      let count = already;
      for (const p of best(room)) {
        if (chosen.length >= maxCenas || count >= limit) break;
        if (chosen.includes(p)) continue;
        chosen.push(p);
        count++;
      }
    }
  }
  // Mantém a ordem do roteiro (a 2ª passada adiciona no fim).
  const [first, ...rest] = chosen;
  const ordered = first ? [first, ...rest.sort((a, b) => tourOrder(a.ambiente) - tourOrder(b.ambiente))] : [];
  return { ordered, pool, best, descartadas };
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Subtítulo que só repete o título ("Três suítes amplas" / "3 suítes"). */
function redundant(titulo: string, subtitulo: string) {
  if (fold(titulo) === fold(subtitulo)) return true;
  const noun = fold(subtitulo).split(/\s+/).pop() ?? "";
  return noun.length > 3 && fold(titulo).includes(noun);
}

const numbers = (s: string) => s.match(/\d[\d.,]*/g)?.join("|") ?? "";
const sameNumbers = (a: string, b: string) => numbers(a) !== "" && numbers(a) === numbers(b);

const tourOrder = (r: Room) => (r === "fachada" || r === "vista" ? -1 : TOUR.findIndex(([t]) => t === r));
const base = (p: ScoredPhoto) => path.basename(p.caminho);

export function buildStoryboard(opts: {
  photos: ScoredPhoto[];
  listing: Listing;
  brand: Brand;
  maxCenas?: number;
  notaMinima?: number;
}): Storyboard {
  const { listing, brand } = opts;
  const { ordered, pool, descartadas } = selectPhotos(opts.photos, opts.maxCenas, opts.notaMinima);
  for (const p of pool) if (!ordered.includes(p)) descartadas.push({ foto: p.arquivo, motivo: "fora do limite de cenas" });

  const used = new Set<string>();
  const local = [listing.bairro, listing.cidade].filter(Boolean).join(", ");
  const cenas: Scene[] = ordered.map((p, i) => {
    const cap = i === 0 ? { titulo: listing.titulo, subtitulo: local || listing.tipo } : caption(p.ambiente, listing, used);
    return {
      foto: base(p),
      ambiente: p.ambiente,
      ...cap,
      movimento: MOTIONS[i % MOTIONS.length],
      duracao_s: i === 0 ? 3.5 : 3,
    };
  });

  return { versao: 1, modo: "padrao", imovel: listing, marca: brand, destaques: highlights(listing), cenas, descartadas };
}

/**
 * Vídeo com gancho (até ~30 s):
 * 0–3 s gancho · 3–15 s apresentação (cortes rápidos, benefícios) · 15–25 s desejo · 25–30 s CTA.
 */
export function buildHookStoryboard(opts: {
  photos: ScoredPhoto[];
  listing: Listing;
  brand: Brand;
  pack: HookPack;
  notaMinima?: number;
}): Storyboard {
  const { listing, brand, pack } = opts;
  const { ordered, pool, best, descartadas } = selectPhotos(opts.photos, 10, opts.notaMinima);
  const top = [...pool].sort((a, b) => b.nota_final - a.nota_final);
  const hook = pack.ganchos[pack.gancho_escolhido] ?? pack.ganchos[0];

  const hookPhoto = best(pack.primeira_cena)[0] ?? ordered[0];
  const desirePhoto =
    best(pack.desejo.ambiente).find((p) => p !== hookPhoto) ?? top.find((p) => p !== hookPhoto);
  // Apresentação: um ambiente por corte (ritmo rápido), até 5 cortes.
  const seen = new Set<Room>();
  const apresentacao = ordered
    .filter((p) => p !== hookPhoto && p !== desirePhoto)
    .filter((p) => p.ambiente === "outro" || (seen.has(p.ambiente) ? false : (seen.add(p.ambiente), true)))
    .slice(0, 5);
  // Segunda cena de desejo: outro ambiente de lazer/vista, senão a melhor foto ainda não usada.
  const taken = new Set([hookPhoto, desirePhoto, ...apresentacao]);
  const desire2 =
    (["piscina", "lazer", "varanda", "vista"] as Room[]).flatMap((r) => best(r)).find((p) => !taken.has(p)) ??
    top.find((p) => !taken.has(p));
  const usedPhotos = [hookPhoto, ...apresentacao, desirePhoto, desire2].filter(Boolean) as ScoredPhoto[];
  for (const p of pool) if (!usedPhotos.includes(p)) descartadas.push({ foto: p.arquivo, motivo: "fora do limite de cenas" });

  const used = new Set<string>();
  const benefits = [...pack.beneficios];
  const benefitFor = (room: Room) => {
    const i = benefits.findIndex((b) => b.ambiente === room);
    return i >= 0 ? benefits.splice(i, 1)[0].frase : undefined;
  };

  const cenas: Scene[] = [];
  if (hookPhoto) {
    cenas.push({
      foto: base(hookPhoto),
      ambiente: hookPhoto.ambiente,
      titulo: hook.texto,
      movimento: "zoom_in",
      duracao_s: 3,
      fase: "gancho",
    });
  }
  apresentacao.forEach((p, i) => {
    const cap = caption(p.ambiente, listing, used);
    const beneficio = benefitFor(p.ambiente);
    // Benefício no título; o dado concreto (m², nº de suítes...) no subtítulo.
    const dado = caption(p.ambiente, { ...listing, frases_por_ambiente: [] }, new Set()).subtitulo;
    const titulo = beneficio ?? cap.titulo;
    const sub = beneficio
      ? dado && !sameNumbers(titulo, dado) && !redundant(titulo, dado) ? dado : undefined
      : cap.subtitulo;
    cenas.push({
      foto: base(p),
      ambiente: p.ambiente,
      titulo,
      subtitulo: sub,
      movimento: MOTIONS[(i + 1) % MOTIONS.length],
      duracao_s: 2.4,
      fase: "apresentacao",
    });
  });
  if (desirePhoto) {
    cenas.push({
      foto: base(desirePhoto),
      ambiente: desirePhoto.ambiente,
      titulo: pack.desejo.frase,
      movimento: "zoom_out",
      duracao_s: 4.5,
      fase: "desejo",
    });
  }
  if (desire2) {
    // Fecha o desejo com o resumo do imóvel antes da chamada para ação.
    const resumo = highlights(listing).join(" · ");
    const beneficio = benefitFor(desire2.ambiente);
    cenas.push({
      foto: base(desire2),
      ambiente: desire2.ambiente,
      titulo: beneficio ?? (resumo || caption(desire2.ambiente, listing, used).titulo),
      subtitulo: beneficio && resumo ? resumo : undefined,
      movimento: "pan_direita",
      duracao_s: 3.5,
      fase: "desejo",
    });
  }

  return {
    versao: 1,
    modo: "ganchos",
    imovel: listing,
    marca: brand,
    destaques: highlights(listing),
    cenas,
    descartadas,
    gancho: { texto: hook.texto, destaque: hook.destaque },
    cta: pack.cta,
  };
}
