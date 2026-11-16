/**
 * Mercado Pago — Checkout Pro (o cliente escolhe Pix ou cartão na página do Mercado Pago).
 *
 * Variáveis de ambiente:
 *   MP_ACCESS_TOKEN     Access token da conta (produção ou teste) — obrigatório para cobrar
 *   MP_WEBHOOK_SECRET   Assinatura secreta das notificações (painel do MP > Webhooks)
 *   SITE_URL            URL pública do site (ex.: https://videos.seudominio.com.br)
 *
 *   PAGAMENTO_TESTE=1   Força o MODO TESTE (pagamento simulado). NUNCA usar no site público.
 *
 * Sem MP_ACCESS_TOKEN e fora de produção, o site também usa o MODO TESTE.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRepo } from "./repo";

const API = "https://api.mercadopago.com";

export const modoTeste = () =>
  process.env.PAGAMENTO_TESTE === "1" || (!process.env.MP_ACCESS_TOKEN && process.env.NODE_ENV !== "production");
/** Há como cobrar? (Mercado Pago configurado ou modo teste.) */
export const pagamentosAtivos = () => modoTeste() || Boolean(process.env.MP_ACCESS_TOKEN);

export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function token() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado.");
  return t;
}

/** Cria a preferência de pagamento e devolve a URL do checkout. */
export async function criarCheckout(p: {
  pedidoId: string;
  titulo: string;
  valorCentavos: number;
  email: string;
}): Promise<{ preferenciaId: string; url: string }> {
  const base = siteUrl();
  const res = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", "X-Idempotency-Key": p.pedidoId },
    body: JSON.stringify({
      items: [{ id: p.pedidoId, title: p.titulo, quantity: 1, unit_price: p.valorCentavos / 100, currency_id: "BRL" }],
      payer: { email: p.email },
      external_reference: p.pedidoId,
      notification_url: `${base}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${base}/pagamento/retorno`,
        pending: `${base}/pagamento/retorno`,
        failure: `${base}/pagamento/retorno`,
      },
      auto_return: "approved",
      statement_descriptor: "VIDEO IMOVEL",
    }),
  });
  if (!res.ok) throw new Error(`Mercado Pago recusou a criação do pagamento (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { id: string; init_point: string };
  return { preferenciaId: j.id, url: j.init_point };
}

/** Consulta o pagamento no Mercado Pago e, se aprovado, credita o pedido (idempotente). */
export async function processarPagamento(pagamentoId: string): Promise<"aprovado" | "pendente" | "recusado" | "ignorado"> {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(pagamentoId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(`Falha ao consultar pagamento ${pagamentoId}: ${res.status}`);
  const pg = (await res.json()) as { status: string; external_reference?: string; transaction_amount?: number };
  if (!pg.external_reference) return "ignorado";
  if (pg.status === "approved") {
    await (await getRepo()).confirmarPagamento(pg.external_reference, pagamentoId, Math.round((pg.transaction_amount ?? 0) * 100));
    return "aprovado";
  }
  if (pg.status === "rejected" || pg.status === "cancelled") return "recusado";
  return "pendente";
}

/**
 * Valida o cabeçalho x-signature das notificações:
 * HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com MP_WEBHOOK_SECRET.
 */
export function assinaturaValida(xSignature: string | null, xRequestId: string | null, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // em produção, exige o segredo
  if (!xSignature) return false;
  const partes = Object.fromEntries(xSignature.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${dataId.toLowerCase()};${xRequestId ? `request-id:${xRequestId};` : ""}ts:${partes.ts};`;
  const esperado = createHmac("sha256", secret).update(manifesto).digest("hex");
  return esperado.length === partes.v1.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1));
}
