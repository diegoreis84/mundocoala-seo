/**
 * Heurísticas sem IA. Usadas quando não há credencial da API (modo demo/teste)
 * — o resultado é bem inferior ao da curadoria com IA.
 */
import type { Listing, PhotoAnalysis, PhotoMetrics, Room } from "../types.js";
import { ROOMS } from "../types.js";

const ROOM_HINTS: [Room, RegExp][] = [
  ["fachada", /fachada|frente|entrada|predio|prédio|externa/i],
  ["vista", /vista|panoram/i],
  ["piscina", /piscina/i],
  ["banheiro", /banh|lavabo|wc/i],
  ["suite", /su[ií]te/i],
  ["quarto", /quarto|dormit/i],
  ["cozinha", /cozinha/i],
  ["varanda", /varanda|sacada|terra[cç]o/i],
  ["lazer", /lazer|academia|gourmet|churrasq|playground|salao|salão|quadra/i],
  ["sala", /sala|living|estar|jantar/i],
  ["escritorio", /escrit|home.?office/i],
  ["area_servico", /servi[cç]o|lavanderia/i],
  ["garagem", /garagem|vaga/i],
  ["planta", /planta/i],
];

export function guessRoom(nome: string): Room {
  for (const [room, re] of ROOM_HINTS) if (re.test(nome)) return room;
  return "outro";
}

export function fallbackAnalysis(m: PhotoMetrics): PhotoAnalysis {
  return {
    arquivo: m.arquivo,
    ambiente: guessRoom(m.arquivo),
    nota_estetica: 5,
    problemas: [],
    descricao: m.arquivo,
  };
}

const num = (s: string | undefined) => (s ? Number(s.replace(/\./g, "").replace(",", ".")) : null);

export function fallbackListing(texto: string): Listing {
  const find = (re: RegExp) => num(texto.match(re)?.[1]);
  const preco = find(/(?:R\$|valor|pre[cç]o)[^\d]{0,12}([\d.]+(?:,\d+)?)/i);
  const firstLine = texto.split("\n").find((l) => l.trim()) ?? "Imóvel à venda";
  return {
    titulo: firstLine.trim().slice(0, 40),
    tipo: /casa/i.test(texto) ? "Casa" : /cobertura/i.test(texto) ? "Cobertura" : "Apartamento",
    finalidade: /alug|loca[cç]/i.test(texto) ? "aluguel" : "venda",
    preco,
    condominio: find(/condom[ií]nio[^\d]{0,12}([\d.]+(?:,\d+)?)/i),
    iptu: find(/iptu[^\d]{0,12}([\d.]+(?:,\d+)?)/i),
    area_m2: find(/([\d.,]+)\s*m(?:²|2)/i),
    area_terreno_m2: find(/terreno[^\d]{0,20}([\d.,]+)\s*m/i),
    quartos: find(/(\d+)\s*(?:quartos|dormit)/i),
    suites: find(/(\d+)\s*su[ií]tes?/i),
    banheiros: find(/(\d+)\s*banheiros?/i),
    vagas: find(/(\d+)\s*vagas?/i),
    bairro: texto.match(/bairro[:\s]+([^\n,.]+)/i)?.[1]?.trim() ?? null,
    cidade: null,
    diferenciais: [],
    frases_por_ambiente: [],
  };
}

export { ROOMS };
