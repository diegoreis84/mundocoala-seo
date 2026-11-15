import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { DATA_DIR, db } from "@/lib/db";

const TIPOS: Record<string, string> = { ".mp4": "video/mp4", ".md": "text/markdown; charset=utf-8" };

/** Entrega os arquivos do vídeo só para o dono, com suporte a Range (avançar o vídeo no player). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const u = await usuarioAtual();
  const { id, arquivo } = await params;
  if (!u) return new NextResponse("Não autorizado", { status: 401 });
  const v = db().prepare("SELECT 1 FROM videos WHERE id = ? AND usuario_id = ?").get(id, u.id);
  if (!v || !/^[\w.-]+\.(mp4|md)$/.test(arquivo)) return new NextResponse("Não encontrado", { status: 404 });

  const caminho = path.join(DATA_DIR, "videos", id, "saida", arquivo);
  if (!fs.existsSync(caminho)) return new NextResponse("Não encontrado", { status: 404 });
  const tamanho = fs.statSync(caminho).size;
  const tipo = TIPOS[path.extname(arquivo)] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (req.nextUrl.searchParams.get("baixar")) headers["Content-Disposition"] = `attachment; filename="${arquivo}"`;

  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const inicio = m[1] ? Number(m[1]) : 0;
    const fim = m[2] ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1;
    if (inicio >= tamanho || inicio > fim) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
    const stream = Readable.toWeb(fs.createReadStream(caminho, { start: inicio, end: fim })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) },
    });
  }
  return new NextResponse(Readable.toWeb(fs.createReadStream(caminho)) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(tamanho) },
  });
}
