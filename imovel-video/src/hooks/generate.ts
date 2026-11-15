import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, MODEL } from "../ai/client.js";
import { HookPackSchema, type HookPack, type Listing, type Room } from "../types.js";
import { HOOK_METHOD } from "./method.js";

const SYSTEM = `Você é um estrategista de conteúdo para corretores de imóveis no Instagram e TikTok.
${HOOK_METHOD}
Regras obrigatórias:
- Use somente fatos presentes nos dados do imóvel. Nunca invente distância, vista, piscina, tempo até o centro etc.
  Se um tipo de gancho exige um dado que não existe (ex.: minutos até o centro), adapte ou escolha outro.
- Ganchos curtos, falados naturalmente, português do Brasil, sem emojis, sem "imperdível"/"oportunidade única".
- "destaque" deve ser um trecho copiado exatamente do texto do gancho.
- Os roteiros só podem mostrar ambientes que existem na lista de fotos disponíveis.
- Cada roteiro deve ter uma abordagem diferente (ex.: preço, família, lazer), para o corretor não repetir o mesmo anúncio.
- Legenda: 3 a 5 linhas curtas + chamada para WhatsApp no final; pode usar até 3 emojis.`;

export async function generateHookPack(listing: Listing, ambientes: Room[], contato?: string): Promise<HookPack> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(HookPackSchema) },
    messages: [
      {
        role: "user",
        content: [
          `Dados do imóvel:\n${JSON.stringify(listing, null, 2)}`,
          `Ambientes com boas fotos disponíveis: ${[...new Set(ambientes)].join(", ")}`,
          contato ? `WhatsApp do corretor: ${contato}` : "WhatsApp do corretor: não informado (use 'link na bio').",
        ].join("\n\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Falha ao gerar ganchos (stop_reason=${response.stop_reason}).`);
  }
  return response.parsed_output;
}
