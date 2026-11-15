import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.IMOVEL_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Há credencial para a API? Sem ela, o pipeline usa heurísticas locais. */
export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
