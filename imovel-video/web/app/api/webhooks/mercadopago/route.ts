import { NextResponse, type NextRequest } from "next/server";
import { assinaturaValida, processarPagamento } from "@/lib/mercadopago";

/** Notificações do Mercado Pago (configure a URL no painel: <SITE_URL>/api/webhooks/mercadopago). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string | number } };
  const tipo = body.type ?? req.nextUrl.searchParams.get("type");
  const dataId = String(body.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? "");
  if (tipo !== "payment" || !dataId) return NextResponse.json({ ok: true });

  if (!assinaturaValida(req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }
  try {
    const r = await processarPagamento(dataId);
    return NextResponse.json({ ok: true, status: r });
  } catch (e) {
    console.error("webhook mercadopago", e);
    // 500 faz o Mercado Pago reenviar a notificação depois.
    return NextResponse.json({ erro: "falha temporária" }, { status: 500 });
  }
}
