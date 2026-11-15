import Link from "next/link";
import { Planos } from "@/components/Planos";
import { usuarioAtual } from "@/lib/auth";
import { PRECO_AVULSO, PRECO_CHEIO, brl } from "@/lib/planos";

export default async function Home() {
  const u = await usuarioAtual();
  return (
    <>
      <section className="hero">
        <div className="container grid grid-2">
          <div>
            <h1>Seu anúncio vira vídeo para Reels em minutos.</h1>
            <p className="lead">
              Cole o link do imóvel. A gente escolhe as melhores fotos, destaca o que vende e entrega vídeos prontos para
              postar, com gancho, música e a sua marca.
            </p>
            <div className="row">
              <Link className="btn" href={u ? "/painel" : "/cadastrar"}>
                Criar meu vídeo
              </Link>
              <span className="muted">
                <s>{brl(PRECO_CHEIO)}</s> <strong>{brl(PRECO_AVULSO)}</strong> por imóvel
              </span>
            </div>
          </div>
          <div aria-hidden>
            <div className="phone">
              <div className="ph-bar"><i /></div>
              <div className="ph-hook">
                Imagine receber os amigos nesta <b>sacada com vista.</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--surface)" }}>
        <div className="container">
          <h2>Como funciona</h2>
          <div className="grid grid-3 steps" style={{ marginTop: 20 }}>
            <div>
              <div className="num">1</div>
              <h3>Cole o link</h3>
              <p className="muted">Do anúncio no site da sua imobiliária. Lemos as fotos, o preço e a descrição.</p>
            </div>
            <div>
              <div className="num">2</div>
              <h3>A gente monta</h3>
              <p className="muted">Curadoria das melhores fotos, roteiro de visita, ganchos para os 3 primeiros segundos e música própria.</p>
            </div>
            <div>
              <div className="num">3</div>
              <h3>Baixe e poste</h3>
              <p className="muted">Receba 2 vídeos (Padrão e Ganchos) em vertical e horizontal, mais legenda e roteiros.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="precos">
        <div className="container">
          <h2>Preços</h2>
          <p className="muted">1 crédito = 1 imóvel com o kit completo: 4 vídeos, 5 ganchos, 3 roteiros, 3 títulos e legenda. Créditos não expiram.</p>
          <div style={{ marginTop: 24 }}>
            <Planos podeComprar={Boolean(u)} />
          </div>
        </div>
      </section>

      <section style={{ background: "var(--surface)" }}>
        <div className="container grid grid-2">
          <div>
            <h3>Quais links funcionam?</h3>
            <p className="muted">
              Links da página do imóvel no site da imobiliária. Portais como ZAP, VivaReal e OLX bloqueiam leitura
              automática; se o link não puder ser lido, o crédito volta para você.
            </p>
          </div>
          <div>
            <h3>As fotos são alteradas?</h3>
            <p className="muted">
              Não. Usamos as fotos do anúncio como estão, com movimentos de câmera suaves. Nada é inventado: os textos
              vêm do próprio anúncio.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
