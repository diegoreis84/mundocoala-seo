import { NextResponse, type NextRequest } from "next/server";
import { lerStream, tamanho } from "@/lib/armazenamento";
import { usuarioAtual } from "@/lib/auth";
import { getRepo } from "@/lib/repo";

const TIPOS: Record<string, string> = { mp4: "video/mp4", md: "text/markdown; charset=utf-8" };

/** Entrega os arquivos do vídeo só para o dono, com suporte a Range (avançar o vídeo no player). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const u = await usuarioAtual();
  const { id, arquivo } = await params;
  if (!u) return new NextResponse("Não autorizado", { status: 401 });
  const ext = arquivo.match(/^[\w.-]+\.(mp4|md)$/)?.[1];
  if (!ext || !(await (await getRepo()).videoDoUsuario(id, u.id))) return new NextResponse("Não encontrado", { status: 404 });

  const chave = `videos/${id}/${arquivo}`;
  const total = await tamanho(chave);
  if (total === null) return new NextResponse("Não encontrado", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": TIPOS[ext], "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (req.nextUrl.searchParams.get("baixar")) headers["Content-Disposition"] = `attachment; filename="${arquivo}"`;

  const m = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const inicio = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2] || 0));
    const fim = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (inicio >= total || inicio > fim) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    return new NextResponse(await lerStream(chave, { inicio, fim }), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${total}`, "Content-Length": String(fim - inicio + 1) },
    });
  }
  return new NextResponse(await lerStream(chave), { headers: { ...headers, "Content-Length": String(total) } });
}
