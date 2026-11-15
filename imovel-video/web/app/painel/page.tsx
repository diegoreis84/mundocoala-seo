import Link from "next/link";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { Erro } from "@/components/Erro";
import { exigirUsuario } from "@/lib/auth";
import { dispararProcessador } from "@/lib/processador";
import { getRepo } from "@/lib/repo";
import { STATUS } from "@/lib/status";
import { gerarVideo } from "../actions";

export default async function Painel({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario();
  const { erro, ok } = await searchParams;
  const videos = await (await getRepo()).listarVideos(u.id);
  const andamento = videos.some((v) => v.status === "na_fila" || v.status === "processando");
  // Rede de segurança: se um vídeo está na fila há mais de 3 min, o aviso ao processador pode ter se perdido.
  if (videos.some((v) => v.status === "na_fila" && Date.now() - Date.parse(v.criado_em) > 3 * 60_000)) {
    await dispararProcessador();
  }

  return (
    <section>
      <div className="container grid" style={{ gap: 24 }}>
        <AutoAtualizar ativo={andamento} />
        {ok === "creditos" ? <div className="alert ok">Pagamento aprovado! Seus créditos já estão disponíveis.</div> : null}

        <div className="card creditos">
          <div>
            <div className="muted small">Seus créditos</div>
            <div className="n">{u.creditos}</div>
          </div>
          <Link href="/comprar" className="btn secondary">Comprar créditos</Link>
        </div>

        <div className="card">
          <h3>Novo vídeo</h3>
          <p className="muted small">Cole o link da página do imóvel no site da imobiliária. Usa 1 crédito; se não der certo, o crédito volta.</p>
          <Erro msg={erro} />
          <form action={gerarVideo} className="row">
            <input name="url" type="url" placeholder="https://www.suaimobiliaria.com.br/imovel/..." required />
            <button className="btn" type="submit" disabled={u.creditos < 1}>Gerar vídeo</button>
          </form>
          {u.creditos < 1 ? (
            <p className="small" style={{ marginTop: 10 }}>
              Você precisa de créditos. <Link href="/comprar">Comprar agora</Link>
            </p>
          ) : null}
        </div>

        <div>
          <h3>Meus vídeos</h3>
          {videos.length === 0 ? <p className="muted">Nenhum vídeo ainda.</p> : null}
          <div className="lista">
            {videos.map((v) => (
              <Link key={v.id} href={`/painel/videos/${v.id}`} className="item">
                <div style={{ minWidth: 0 }}>
                  <div className="t">{v.titulo || v.url}</div>
                  <div className="small muted">
                    {new Date(v.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {v.etapa ? ` · ${v.etapa}` : ""}
                  </div>
                </div>
                <span className={`status ${v.status}`}>
                  {v.status === "processando" ? <span className="spinner" /> : null} {STATUS[v.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
