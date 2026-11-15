import { z } from "zod";

/** Cômodos/ambientes reconhecidos. A ordem define o roteiro de "visita". */
export const ROOMS = [
  "fachada",
  "vista",
  "sala",
  "varanda",
  "cozinha",
  "suite",
  "quarto",
  "banheiro",
  "escritorio",
  "area_servico",
  "lazer",
  "piscina",
  "garagem",
  "planta",
  "outro",
] as const;
export const RoomSchema = z.enum(ROOMS);
export type Room = z.infer<typeof RoomSchema>;

export const ROOM_LABEL: Record<Room, string> = {
  fachada: "Fachada",
  vista: "Vista",
  sala: "Sala",
  varanda: "Varanda",
  cozinha: "Cozinha",
  suite: "Suíte",
  quarto: "Quarto",
  banheiro: "Banheiro",
  escritorio: "Escritório",
  area_servico: "Área de serviço",
  lazer: "Lazer",
  piscina: "Piscina",
  garagem: "Garagem",
  planta: "Planta",
  outro: "Ambiente",
};

/** Dados estruturados extraídos do anúncio. */
export const ListingSchema = z.object({
  titulo: z.string().describe("Título curto e atraente, até 40 caracteres"),
  tipo: z.string().describe("Apartamento, Casa, Cobertura, Terreno..."),
  finalidade: z.enum(["venda", "aluguel"]),
  preco: z.number().nullable().describe("Preço em reais, sem centavos"),
  condominio: z.number().nullable(),
  iptu: z.number().nullable(),
  area_m2: z.number().nullable().describe("Área privativa/útil/construída"),
  area_terreno_m2: z.number().nullable().describe("Área do terreno (casas), se informada"),
  quartos: z.number().nullable(),
  suites: z.number().nullable(),
  banheiros: z.number().nullable(),
  vagas: z.number().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  diferenciais: z
    .array(z.string())
    .describe("Diferenciais curtos (até 4 palavras cada), do mais ao menos vendedor"),
  frases_por_ambiente: z
    .array(z.object({ ambiente: RoomSchema, frase: z.string() }))
    .describe("Frase curta (até 5 palavras) que destaca cada ambiente citado no anúncio"),
});
export type Listing = z.infer<typeof ListingSchema>;

/** Avaliação de uma foto. */
export const PhotoAnalysisSchema = z.object({
  arquivo: z.string(),
  ambiente: RoomSchema,
  nota_estetica: z.number().describe("0 a 10: composição, luz, apelo comercial"),
  problemas: z.array(z.string()).describe("Ex.: escura, torta, bagunça, pessoas, borrada"),
  descricao: z.string().describe("Até 8 palavras descrevendo o que a foto mostra"),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;

/** Métricas técnicas calculadas localmente (sem IA). */
export type PhotoMetrics = {
  arquivo: string;
  caminho: string;
  largura: number;
  altura: number;
  nitidez_bruta: number; // log10 da variância do Laplaciano
  exposicao: number; // 0..10 (10 = bem exposta)
  hash: string; // dHash 64 bits em hex
  cor: [number, number, number]; // cor média RGB
};

export type ScoredPhoto = PhotoMetrics & PhotoAnalysis & { nitidez: number; problemas_tecnicos: string[]; nota_final: number };

export type Motion = "zoom_in" | "zoom_out" | "pan_esquerda" | "pan_direita";

export const SceneSchema = z.object({
  foto: z.string(),
  ambiente: RoomSchema,
  titulo: z.string(),
  subtitulo: z.string().optional(),
  movimento: z.enum(["zoom_in", "zoom_out", "pan_esquerda", "pan_direita"]),
  duracao_s: z.number(),
  /** Se definido, um clipe animado (ex.: Veo) substitui o efeito de câmera. */
  video: z.string().optional(),
  /** Papel da cena no vídeo com gancho. */
  fase: z.enum(["gancho", "apresentacao", "desejo"]).optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const BrandSchema = z.object({
  nome: z.string(),
  creci: z.string().optional(),
  contato: z.string().optional(),
  cor: z.string().default("#C8A46A"),
  logo: z.string().optional(),
});
export type Brand = z.infer<typeof BrandSchema>;

export const StoryboardSchema = z.object({
  versao: z.literal(1),
  imovel: ListingSchema,
  marca: BrandSchema,
  destaques: z.array(z.string()).describe("Chips da cena de abertura"),
  cenas: z.array(SceneSchema),
  descartadas: z.array(z.object({ foto: z.string(), motivo: z.string() })),
  modo: z.enum(["padrao", "ganchos"]).default("padrao"),
  /** Texto do gancho (0–3 s) e palavra a destacar. */
  gancho: z.object({ texto: z.string(), destaque: z.string().optional() }).optional(),
  /** Chamada para ação do encerramento. */
  cta: z.string().optional(),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

/* ------------------------------------------------------------------ */
/* Kit de ganchos                                                       */
/* ------------------------------------------------------------------ */

export const HOOK_TYPES = ["preco", "localizacao", "estrutura", "desejo", "curiosidade"] as const;
export const HookTypeSchema = z.enum(HOOK_TYPES);
export type HookType = z.infer<typeof HookTypeSchema>;

export const HookSchema = z.object({
  tipo: HookTypeSchema,
  texto: z.string().describe("Gancho para os 3 primeiros segundos, até 14 palavras"),
  destaque: z.string().describe("Trecho do gancho (1 a 3 palavras, copiado exatamente) para destacar na tela"),
});
export type Hook = z.infer<typeof HookSchema>;

export const ScriptSchema = z.object({
  nome: z.string().describe("Nome curto da abordagem"),
  gancho: z.string(),
  blocos: z.array(
    z.object({
      tempo: z.string().describe('Ex.: "0–3 s"'),
      fase: z.enum(["gancho", "apresentacao", "desejo", "cta"]),
      mostrar: z.string().describe("O que aparece na tela (ambientes/fotos)"),
      fala: z.string().describe("O que o corretor fala ou o texto narrado"),
    }),
  ),
});
export type Script = z.infer<typeof ScriptSchema>;

export const HookPackSchema = z.object({
  ganchos: z.array(HookSchema).describe("5 ganchos de tipos variados"),
  gancho_escolhido: z.number().describe("Índice (0-4) do gancho mais forte para o vídeo"),
  primeira_cena: RoomSchema.describe("Ambiente/característica que deve aparecer primeiro"),
  motivo_primeira_cena: z.string(),
  beneficios: z
    .array(z.object({ ambiente: RoomSchema, frase: z.string() }))
    .describe("Característica transformada em benefício, até 6 palavras, por ambiente"),
  desejo: z.object({ ambiente: RoomSchema, frase: z.string() }).describe("Melhor ambiente/diferencial para a fase de desejo"),
  roteiros: z.array(ScriptSchema).describe("3 roteiros de até 30 s com abordagens diferentes"),
  titulos_reels: z.array(z.string()).describe("3 títulos para Reels"),
  legenda: z.string().describe("Legenda do post com chamada para WhatsApp"),
  cta: z.string().describe("Chamada para ação curta para a tela final, até 10 palavras"),
});
export type HookPack = z.infer<typeof HookPackSchema>;
