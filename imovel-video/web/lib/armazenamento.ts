/**
 * Arquivos (logos, vídeos, kit). ARMAZENAMENTO=gcs + BUCKET=<nome> no Google Cloud; padrão: disco local (DATA_DIR).
 * Chaves: "logos/<usuario>.png", "videos/<id>/<arquivo>".
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { dataDir } from "./caminhos";

type Faixa = { inicio: number; fim: number };

const gcs = () => process.env.ARMAZENAMENTO === "gcs";
const g = globalThis as unknown as { __bucket?: import("@google-cloud/storage").Bucket };

async function bucket() {
  if (!g.__bucket) {
    const { Storage } = await import("@google-cloud/storage");
    const nome = process.env.BUCKET;
    if (!nome) throw new Error("BUCKET não configurado.");
    g.__bucket = new Storage().bucket(nome);
  }
  return g.__bucket;
}
const local = (chave: string) => path.join(dataDir(), chave);

export async function salvarBuffer(chave: string, dados: Buffer, tipo?: string) {
  if (gcs()) return (await bucket()).file(chave).save(dados, { contentType: tipo, resumable: false });
  await fsp.mkdir(path.dirname(local(chave)), { recursive: true });
  await fsp.writeFile(local(chave), dados);
}

export async function enviarArquivo(chave: string, caminhoLocal: string, tipo?: string) {
  if (gcs()) {
    await (await bucket()).upload(caminhoLocal, { destination: chave, contentType: tipo, resumable: false });
    return;
  }
  if (path.resolve(caminhoLocal) === path.resolve(local(chave))) return;
  await fsp.mkdir(path.dirname(local(chave)), { recursive: true });
  await fsp.copyFile(caminhoLocal, local(chave));
}

export async function baixarArquivo(chave: string, destino: string) {
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  if (gcs()) {
    await (await bucket()).file(chave).download({ destination: destino });
    return;
  }
  await fsp.copyFile(local(chave), destino);
}

export async function tamanho(chave: string): Promise<number | null> {
  if (gcs()) {
    const f = (await bucket()).file(chave);
    const [existe] = await f.exists();
    if (!existe) return null;
    const [meta] = await f.getMetadata();
    return Number(meta.size);
  }
  try {
    return (await fsp.stat(local(chave))).size;
  } catch {
    return null;
  }
}

/** Stream web (para Response), opcionalmente de um trecho (Range). */
export async function lerStream(chave: string, faixa?: Faixa): Promise<ReadableStream> {
  const node = gcs()
    ? (await bucket()).file(chave).createReadStream(faixa ? { start: faixa.inicio, end: faixa.fim } : {})
    : fs.createReadStream(local(chave), faixa ? { start: faixa.inicio, end: faixa.fim } : {});
  return Readable.toWeb(node) as ReadableStream;
}
