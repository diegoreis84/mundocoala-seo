import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { z } from "zod";
import { PhotoAnalysisSchema, type PhotoAnalysis, type PhotoMetrics } from "../types.js";
import { getClient, MODEL } from "./client.js";

const BATCH = 12;

const SYSTEM = `Você é um diretor de fotografia imobiliária escolhendo fotos para um vídeo de divulgação.
Para cada foto, identifique o ambiente e dê uma nota estética de 0 a 10 considerando:
composição, luz natural, sensação de amplitude, organização e apelo comercial.
Liste problemas objetivos (escura, estourada, torta, borrada, bagunça, pessoas, marca d'água, distorção forte).
Fotos de planta baixa: ambiente "planta". Use o nome do arquivo exatamente como informado.`;

async function toImageBlock(m: PhotoMetrics): Promise<Anthropic.ImageBlockParam> {
  // 1024px no maior lado: suficiente para julgar e reduz custo de tokens.
  const buf = await sharp(m.caminho).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } };
}

async function analyzeBatch(batch: PhotoMetrics[]): Promise<PhotoAnalysis[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const m of batch) {
    content.push({ type: "text", text: `Arquivo: ${m.arquivo}` });
    content.push(await toImageBlock(m));
  }
  content.push({ type: "text", text: `Avalie as ${batch.length} fotos acima.` });

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: zodOutputFormat(z.object({ fotos: z.array(PhotoAnalysisSchema) })),
    },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Falha ao analisar fotos (stop_reason=${response.stop_reason}).`);
  }
  return response.parsed_output.fotos;
}

export async function analyzePhotos(metrics: PhotoMetrics[]): Promise<PhotoAnalysis[]> {
  const batches: PhotoMetrics[][] = [];
  for (let i = 0; i < metrics.length; i += BATCH) batches.push(metrics.slice(i, i + BATCH));
  const results = await Promise.all(batches.map(analyzeBatch));
  return results.flat();
}
