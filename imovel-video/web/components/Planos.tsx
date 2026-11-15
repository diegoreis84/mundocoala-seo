import Link from "next/link";
import { comprar } from "@/app/actions";
import { PLANOS, PRECO_CHEIO, brl, precoPlano, precoPorVideo } from "@/lib/planos";

/** Cartões de preço. Com `comprar`, cada cartão vira um botão de compra; senão, leva ao cadastro. */
export function Planos({ podeComprar }: { podeComprar: boolean }) {
  return (
    <div className="grid grid-4">
      {PLANOS.map((p) => (
        <div key={p.id} className={`card plan${p.destaque ? " destaque" : ""}`}>
          {p.destaque ? <span className="tag">Mais escolhido</span> : null}
          <h3>{p.nome}</h3>
          {p.desconto > 0 ? (
            <span className="desconto">{Math.round(p.desconto * 100)}% de desconto</span>
          ) : (
            <span className="de">de {brl(PRECO_CHEIO)}</span>
          )}
          <div className="preco">{brl(precoPlano(p))}</div>
          <div className="por-video">
            {p.creditos > 1 ? `${brl(precoPorVideo(p))} por vídeo` : "por vídeo"}
          </div>
          <p className="small muted" style={{ margin: "8px 0 16px" }}>
            {p.creditos} {p.creditos === 1 ? "crédito" : "créditos"} · Pix ou cartão
          </p>
          {podeComprar ? (
            <form action={comprar}>
              <input type="hidden" name="plano" value={p.id} />
              <button className={`btn block${p.destaque ? "" : " secondary"}`} type="submit">
                Comprar
              </button>
            </form>
          ) : (
            <Link className={`btn block${p.destaque ? "" : " secondary"}`} href="/cadastrar">
              Começar
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
