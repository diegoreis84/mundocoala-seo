import { Erro } from "@/components/Erro";
import { Planos } from "@/components/Planos";
import { exigirUsuario } from "@/lib/auth";
import { modoTeste, pagamentosAtivos } from "@/lib/mercadopago";

export default async function Comprar({ searchParams }: { searchParams: Promise<{ erro?: string; sem?: string }> }) {
  const u = await exigirUsuario();
  const { erro, sem } = await searchParams;
  return (
    <section>
      <div className="container">
        <h2>Comprar créditos</h2>
        <p className="muted">
          Você tem <strong>{u.creditos}</strong> {u.creditos === 1 ? "crédito" : "créditos"}. Cada crédito gera o kit completo de 1 imóvel.
          Pague com Pix (crédito liberado na hora) ou cartão.
        </p>
        {sem ? <div className="alert warn">Você não tem créditos. Escolha um pacote para gerar seu vídeo.</div> : null}
        <Erro msg={erro} />
        {!pagamentosAtivos() ? (
          <div className="alert warn">Pagamentos disponíveis em breve. Fale com a gente para receber créditos de teste.</div>
        ) : null}
        {modoTeste() ? (
          <div className="alert warn">
            Modo teste: o Mercado Pago ainda não está configurado (MP_ACCESS_TOKEN). O pagamento será simulado.
          </div>
        ) : null}
        <div style={{ marginTop: 24 }}>
          <Planos podeComprar desativado={!pagamentosAtivos()} />
        </div>
      </div>
    </section>
  );
}
