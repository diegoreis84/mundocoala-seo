import type { HookPack } from "../types.js";

const LABEL: Record<string, string> = {
  preco: "Preço e oportunidade",
  localizacao: "Localização",
  estrutura: "Metragem e estrutura",
  desejo: "Desejo e estilo de vida",
  curiosidade: "Curiosidade",
};

/** Kit de divulgação em Markdown para o corretor. */
export function kitMarkdown(pack: HookPack, titulo: string): string {
  const lines: string[] = [`# Kit de divulgação — ${titulo}`, ""];
  lines.push("## 5 ganchos", "");
  pack.ganchos.forEach((h, i) => lines.push(`${i + 1}. **${LABEL[h.tipo] ?? h.tipo}:** "${h.texto}"${i === pack.gancho_escolhido ? "  ← usado no vídeo" : ""}`));
  lines.push("", `**Mostrar primeiro:** ${pack.primeira_cena} — ${pack.motivo_primeira_cena}`, "");
  lines.push("## Benefícios por ambiente", "");
  pack.beneficios.forEach((b) => lines.push(`- ${b.ambiente}: ${b.frase}`));
  lines.push("", "## 3 roteiros de até 30 s", "");
  pack.roteiros.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.nome}`, "", "| Tempo | Fase | Mostrar | Fala |", "|---|---|---|---|");
    r.blocos.forEach((b) => lines.push(`| ${b.tempo} | ${b.fase} | ${b.mostrar} | ${b.fala.replace(/\|/g, "/")} |`));
    lines.push("");
  });
  lines.push("## 3 títulos para Reels", "");
  pack.titulos_reels.forEach((t) => lines.push(`- ${t}`));
  lines.push("", "## Legenda", "", "```", pack.legenda, "```", "");
  return lines.join("\n");
}
