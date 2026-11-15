import path from "node:path";
import sharp from "sharp";
import type { PhotoMetrics } from "../types.js";

const clamp = (v: number, a = 0, b = 10) => Math.max(a, Math.min(b, v));

/** Nitidez bruta: log10 da variância do Laplaciano (512px, tons de cinza). Comparar só dentro do mesmo anúncio. */
async function sharpness(file: string): Promise<number> {
  const { data, info } = await sharp(file)
    .rotate()
    .resize(512, 512, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const variance = sumSq / n - (sum / n) ** 2;
  return Math.log10(Math.max(variance, 1));
}

/** Exposição 0..10: só penaliza extremos (interiores bem fotografados costumam ser claros). */
async function exposure(file: string): Promise<number> {
  const stats = await sharp(file).rotate().greyscale().stats();
  const mean = stats.channels[0].mean; // 0..255
  if (mean < 80) return clamp(((mean - 20) / 60) * 10);
  if (mean > 215) return clamp(((250 - mean) / 35) * 10);
  return 10;
}

/** dHash 64 bits: fotos quase iguais têm distância de Hamming pequena. */
async function dhash(file: string): Promise<string> {
  const data = await sharp(file).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hamming(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let c = 0;
  while (x) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

export async function computeMetrics(file: string): Promise<PhotoMetrics> {
  const meta = await sharp(file).rotate().metadata();
  const [nitidez, exposicao, hash, stats] = await Promise.all([
    sharpness(file),
    exposure(file),
    dhash(file),
    sharp(file).removeAlpha().stats(),
  ]);
  const cor = stats.channels.slice(0, 3).map((c) => Math.round(c.mean)) as [number, number, number];
  const portrait = (meta.orientation ?? 1) >= 5;
  return {
    arquivo: path.basename(file),
    caminho: file,
    largura: (portrait ? meta.height : meta.width) ?? 0,
    altura: (portrait ? meta.width : meta.height) ?? 0,
    nitidez_bruta: nitidez,
    exposicao,
    hash,
    cor,
  };
}

/** Distância euclidiana entre cores médias (0..441). */
export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
