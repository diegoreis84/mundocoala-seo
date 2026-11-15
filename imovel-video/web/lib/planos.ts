/** Preços em centavos. Preço cheio de referência: R$ 27; avulso: R$ 17; pacotes com desconto sobre R$ 17. */
export const PRECO_CHEIO = 2700;
export const PRECO_AVULSO = 1700;

export type Plano = { id: string; nome: string; creditos: number; desconto: number; destaque?: boolean };

export const PLANOS: Plano[] = [
  { id: "avulso", nome: "1 vídeo", creditos: 1, desconto: 0 },
  { id: "p10", nome: "10 vídeos", creditos: 10, desconto: 0.2 },
  { id: "p25", nome: "25 vídeos", creditos: 25, desconto: 0.25, destaque: true },
  { id: "p50", nome: "50 vídeos", creditos: 50, desconto: 0.3 },
];

export function precoPlano(p: Plano): number {
  return Math.round(p.creditos * PRECO_AVULSO * (1 - p.desconto));
}
export function precoPorVideo(p: Plano): number {
  return Math.round(precoPlano(p) / p.creditos);
}
export function planoPorId(id: string): Plano | undefined {
  return PLANOS.find((p) => p.id === id);
}
export const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
