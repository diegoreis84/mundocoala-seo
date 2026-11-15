/**
 * Kit de ganchos por modelos (sem IA). Preenche os modelos do método com os dados
 * do anúncio e só usa um modelo quando o dado que ele exige existe.
 */
import type { Hook, HookPack, Listing, Room, Script } from "../types.js";

type G = { f: boolean; art: string; este: string; deste: string; neste: string; ela: string; nome: string };

function gender(l: Listing): G {
  const nome = (l.tipo || "imóvel").toLowerCase();
  const f = /casa|cobertura|kitnet|sala comercial|loja/.test(nome);
  return f
    ? { f, art: "a", este: "esta", deste: "desta", neste: "nesta", ela: "ela", nome }
    : { f, art: "o", este: "este", deste: "deste", neste: "neste", ela: "ele", nome };
}

/** R$ 1.490.000 → "R$ 1,49 milhão"; R$ 650.000 → "R$ 650 mil". */
export function brlShort(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    const txt = m.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return `R$ ${txt} ${m < 2 ? "milhão" : "milhões"}`;
  }
  if (v >= 1000) return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  return `R$ ${v.toLocaleString("pt-BR")}`;
}

const has = (l: Listing, re: RegExp) => l.diferenciais.some((d) => re.test(d));
const LAZER = /churrasq|gourmet|piscina|p[aá]tio|quintal|jardim|lazer|espa[cç]o externo|deck/i;

/** "na Vila Mariana", "no Jardim Botânico", "em Petrópolis" (sem artigo quando não dá para saber). */
export function bairroPrep(bairro: string) {
  if (/^(vila|cidade|praia|lagoa|ilha|barra|ch[aá]cara|chapada|serra|freguesia|fazenda|aldeia|granja|col[oô]nia)\b/i.test(bairro)) return `na ${bairro}`;
  if (/^(jardim|parque|alto|centro|morro|bairro|recreio|bom|porto|setor|n[uú]cleo|conjunto|residencial|condom[ií]nio)\b/i.test(bairro)) return `no ${bairro}`;
  return `em ${bairro}`;
}

export function templateHooks(l: Listing): Hook[] {
  const g = gender(l);
  const out: Hook[] = [];
  // Preço
  if (l.preco) {
    const p = brlShort(l.preco);
    out.push({
      tipo: "preco",
      texto: `Olha o que você consegue comprar com ${p} ${l.bairro ? bairroPrep(l.bairro) : "nesta região"}.`,
      destaque: p,
    });
  }
  // Localização
  if (l.bairro) {
    out.push({
      tipo: "localizacao",
      texto: `Se você quer morar ${bairroPrep(l.bairro)}, preste atenção ${g.neste} ${g.nome}.`,
      destaque: l.bairro,
    });
  }
  // Estrutura
  if (l.area_terreno_m2) {
    const t = `${l.area_terreno_m2.toLocaleString("pt-BR")} m²`;
    out.push({ tipo: "estrutura", texto: `O que você faria com um terreno de ${t}?`, destaque: t });
  } else if (l.area_m2) {
    const a = `${l.area_m2.toLocaleString("pt-BR")} m²`;
    out.push({ tipo: "estrutura", texto: `São ${a} muito bem aproveitados. Vem conhecer.`, destaque: a });
  }
  if (l.quartos && l.quartos >= 3) {
    out.push({
      tipo: "estrutura",
      texto: g.f
        ? "Sabe aquela casa onde cada pessoa da família tem seu espaço?"
        : "Sabe aquele imóvel onde cada pessoa da família tem seu espaço?",
      destaque: "seu espaço",
    });
  }
  // Desejo
  if (has(l, LAZER)) {
    out.push({ tipo: "desejo", texto: "Essa é para quem sonha em receber a família e os amigos em casa.", destaque: "receber a família" });
  } else {
    out.push({ tipo: "desejo", texto: "Se você procura espaço, conforto e privacidade, olha isso.", destaque: "espaço, conforto" });
  }
  // Curiosidade
  if (g.f && /casa/.test(g.nome) && has(l, LAZER)) {
    out.push({ tipo: "curiosidade", texto: `Espere até ver o que tem nos fundos ${g.deste} casa.`, destaque: "nos fundos" });
  } else {
    out.push({ tipo: "curiosidade", texto: "Por fora, você não imagina o que vai encontrar aqui dentro.", destaque: "aqui dentro" });
  }
  return out;
}

/** Características → benefícios (sem inventar fatos). */
export function templateBenefits(l: Listing): { ambiente: Room; frase: string }[] {
  const b: { ambiente: Room; frase: string }[] = [];
  if (l.quartos && l.quartos >= 3) b.push({ ambiente: "quarto", frase: "Espaço para toda a família" });
  else if (l.quartos) b.push({ ambiente: "quarto", frase: `${l.quartos} ${l.quartos === 1 ? "quarto" : "quartos"} bem distribuídos` });
  if (l.suites) b.push({ ambiente: "suite", frase: "Mais privacidade e conforto" });
  if (l.vagas && l.vagas >= 2) b.push({ ambiente: "garagem", frase: "Chega de disputar vaga" });
  if (has(l, /piscina/i)) b.push({ ambiente: "piscina", frase: "Seu lazer sem sair de casa" });
  if (has(l, /churrasq|gourmet/i)) b.push({ ambiente: "lazer", frase: "Receba quem você ama" });
  if (l.area_terreno_m2) b.push({ ambiente: "fachada", frase: `${l.area_terreno_m2.toLocaleString("pt-BR")} m² de terreno` });
  if (l.area_m2) b.push({ ambiente: "sala", frase: `${l.area_m2.toLocaleString("pt-BR")} m² para viver bem` });
  return b;
}

function pickHook(hooks: Hook[], l: Listing): number {
  const prefer = has(l, LAZER) ? ["desejo", "preco", "estrutura"] : ["preco", "estrutura", "desejo"];
  for (const t of prefer) {
    const i = hooks.findIndex((h) => h.tipo === t);
    if (i >= 0) return i;
  }
  return 0;
}

export function templateHookPack(l: Listing, ambientes: Room[], contato?: string): HookPack {
  const hooks = templateHooks(l).slice(0, 5);
  const escolhido = pickHook(hooks, l);
  const lazerRoom: Room | undefined = (["piscina", "lazer", "varanda", "vista"] as Room[]).find((r) => ambientes.includes(r));
  const desejoRoom: Room = lazerRoom ?? (ambientes.includes("sala") ? "sala" : ambientes[0] ?? "outro");
  const primeira: Room = hooks[escolhido]?.tipo === "desejo" && lazerRoom ? lazerRoom : ambientes.includes("fachada") ? "fachada" : ambientes[0] ?? "outro";
  const g = gender(l);
  const local = [l.bairro, l.cidade].filter(Boolean).join(", ");
  const resumo = [
    l.quartos ? `${l.quartos} quartos` : null,
    l.suites ? `${l.suites} ${l.suites === 1 ? "suíte" : "suítes"}` : null,
    l.vagas ? `${l.vagas} vagas` : null,
    l.area_m2 ? `${l.area_m2.toLocaleString("pt-BR")} m²` : null,
  ].filter(Boolean).join(", ");
  const preco = l.preco ? brlShort(l.preco) : null;
  const cta = "Quer conhecer pessoalmente? Agende sua visita.";
  const whats = contato ? `Chama no WhatsApp ${contato}` : "Chama no WhatsApp (link na bio)";

  const roteiro = (nome: string, h: Hook, desejo: string): Script => ({
    nome,
    gancho: h.texto,
    blocos: [
      { tempo: "0–3 s", fase: "gancho", mostrar: primeira === "fachada" ? "Fachada" : "Melhor ambiente", fala: h.texto },
      { tempo: "3–15 s", fase: "apresentacao", mostrar: "Fachada, sala, cozinha, quartos", fala: `${g.f ? "Uma" : "Um"} ${g.nome} com ${resumo}${local ? `, ${local}` : ""}.` },
      { tempo: "15–25 s", fase: "desejo", mostrar: desejoRoom, fala: desejo },
      { tempo: "25–30 s", fase: "cta", mostrar: "Preço e contato", fala: `${preco ? `Tudo isso por ${preco}. ` : ""}Quer conhecer pessoalmente? Me chama no direct e agende sua visita.` },
    ],
  });
  const desejoFrase = lazerRoom ? "Imagine os finais de semana com a família neste espaço." : "Cada ambiente pensado para o seu conforto.";
  const roteiros = [0, 1, 2]
    .map((k) => hooks[(escolhido + k) % hooks.length])
    .map((h, k) => roteiro(["Principal", "Alternativo", "Terceira abordagem"][k] + ` (${h.tipo})`, h, desejoFrase));

  return {
    ganchos: hooks,
    gancho_escolhido: escolhido,
    primeira_cena: primeira,
    motivo_primeira_cena: primeira === "fachada" ? "Apresenta o imóvel de cara." : "Mostra o principal diferencial logo no gancho.",
    beneficios: templateBenefits(l),
    desejo: { ambiente: desejoRoom, frase: lazerRoom ? "Seu lazer sem sair de casa" : "Conforto em cada detalhe" },
    roteiros,
    titulos_reels: [
      `${l.tipo} com ${resumo || "ótima estrutura"}${l.bairro ? ` ${bairroPrep(l.bairro)}` : ""}`,
      preco ? `O que dá para comprar com ${preco}${l.bairro ? ` ${bairroPrep(l.bairro)}` : ""}?` : `Conheça ${g.este} ${g.nome}`,
      hooks.find((h) => h.tipo === "desejo")?.texto ?? hooks[0].texto,
    ],
    legenda: [
      hooks[escolhido].texto,
      "",
      `🏡 ${l.tipo}${resumo ? ` com ${resumo}` : ""}${local ? ` — ${local}` : ""}.`,
      ...l.diferenciais.slice(0, 3).map((d) => `✔ ${d}`),
      preco ? `💰 ${preco}` : "",
      "",
      `📲 ${whats} e agende sua visita.`,
    ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n"),
    cta,
  };
}
