import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { modoTeste } from "@/lib/mercadopago";
import { brl } from "@/lib/planos";
import { simularPagamento } from "../../../actions";

export default async function PagamentoTeste({ params }: { params: Promise<{ id: string }> }) {
  if (!modoTeste()) notFound();
  const u = await exigirUsuario();
  const { id } = await params;
  const p = await (await getRepo()).pedidoDoUsuario(id, u.id);
  if (!p) notFound();
  return (
    <section>
      <div className="container narrow">
        <div className="card">
          <div className="alert warn">Modo teste — nenhuma cobrança real.</div>
          <h2>Pagamento simulado</h2>
          <p>
            {p.creditos} {p.creditos === 1 ? "crédito" : "créditos"} por <strong>{brl(p.valor_centavos)}</strong>
          </p>
          <form action={simularPagamento}>
            <input type="hidden" name="pedido" value={id} />
            <button className="btn block" type="submit">Simular pagamento aprovado</button>
          </form>
        </div>
      </div>
    </section>
  );
}
