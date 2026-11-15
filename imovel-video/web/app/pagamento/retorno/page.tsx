import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { processarPagamento } from "@/lib/mercadopago";

/** Volta do checkout do Mercado Pago. Confere o pagamento na hora (o webhook também credita). */
export default async function Retorno({
  searchParams,
}: {
  searchParams: Promise<{ payment_id?: string; collection_id?: string; status?: string }>;
}) {
  await exigirUsuario();
  const sp = await searchParams;
  const pagamento = sp.payment_id ?? sp.collection_id;
  let status: string = sp.status ?? "pendente";
  if (pagamento && pagamento !== "null") {
    try {
      status = await processarPagamento(pagamento);
    } catch {
      // O webhook confirma depois.
    }
  }
  const aprovado = status === "aprovado" || status === "approved";
  return (
    <section>
      <div className="container narrow">
        <div className="card">
          {aprovado ? (
            <>
              <h2>Pagamento aprovado!</h2>
              <p>Seus créditos já estão na sua conta.</p>
            </>
          ) : status === "recusado" || status === "rejected" ? (
            <>
              <h2>Pagamento não aprovado</h2>
              <p className="muted">Nenhum valor foi cobrado. Você pode tentar de novo com outra forma de pagamento.</p>
            </>
          ) : (
            <>
              <h2>Pagamento em processamento</h2>
              <p className="muted">Assim que o Mercado Pago confirmar, os créditos aparecem na sua conta. No Pix, costuma ser imediato.</p>
            </>
          )}
          <Link className="btn block" href="/painel">Ir para meus vídeos</Link>
        </div>
      </div>
    </section>
  );
}
