import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ListingSchema, type Listing } from "../types.js";
import { getClient, MODEL } from "./client.js";

const SYSTEM = `Você extrai dados de anúncios imobiliários brasileiros para um vídeo curto de divulgação.
Regras:
- Use somente o que está escrito no anúncio. Se um dado não aparece, devolva null. Nunca invente números.
- "diferenciais": o que mais vende o imóvel, em frases de até 4 palavras, em ordem de impacto.
- "frases_por_ambiente": uma frase curta e elegante (até 5 palavras) por ambiente mencionado, baseada no texto.
- Textos em português do Brasil, sem emojis e sem exageros ("imperdível", "oportunidade única").`;

export async function extractListing(texto: string): Promise<Listing> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(ListingSchema) },
    messages: [{ role: "user", content: `Anúncio:\n\n${texto}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Não foi possível extrair os dados do anúncio (stop_reason=${response.stop_reason}).`);
  }
  return response.parsed_output;
}
