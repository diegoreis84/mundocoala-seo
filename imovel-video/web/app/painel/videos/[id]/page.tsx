import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoAtualizar } from "@/components/AutoAtualizar";
import { Copiar } from "@/components/Copiar";
import { exigirUsuario } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { STATUS } from "@/lib/status";

type Resultado = { videos: string[]; kit: string | null; legenda: string | null; ganchos: string[]; titulos: string[] };

const NOMES: Record<string, string> = {
  "video-ganchos-vertical.mp4": "Ganchos · vertical (Reels/TikTok)",
  "video-padrao-vertical.mp4": "Padrão · vertical (Reels/TikTok)",
  "video-ganchos-horizontal.mp4": "Ganchos · horizontal (YouTube/portais)",
  "video-padrao-horizontal.mp4": "Padrão · horizontal (YouTube/portais)",
};
const ORDEM = Object.keys(NOMES);

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  const v = await (await getRepo()).videoDoUsuario(id, u.id);
  if (!v) notFound();
  const r: Resultado | null = v.resultado ? JSON.parse(v.resultado) : null;
  const arquivo = (nome: string) => `/api/arquivos/${v.id}/${nome}`;

  return (
    <section>
      <div className="container grid" style={{ gap: 24 }}>
        <AutoAtualizar ativo={v.status === "na_fila" || v.status === "processando"} />
        <div>
          <Link href="/painel" className="small muted">← Meus vídeos</Link>
          <h2 style={{ marginTop: 8 }}>{v.titulo || "Seu vídeo"}</h2>
          <p className="small muted" style={{ wordBreak: "break-all" }}>{v.url}</p>
        </div>

        {v.status !== "pronto" ? (
          <div className="card">
            <span className={`status ${v.status}`}>{STATUS[v.status]}</span>
            {v.status === "erro" ? (
              <>
                <p style={{ marginTop: 12 }}>{v.erro}</p>
                <p className="small muted">O crédito foi devolvido para a sua conta.</p>
              </>
            ) : (
              <>
                <p style={{ marginTop: 12 }}>
                  <span className="spinner" /> {v.etapa ?? "Aguardando na fila"}…
                </p>
                <p className="small muted">Leva alguns minutos. Pode fechar esta página: o vídeo fica salvo em “Meus vídeos”.</p>
              </>
            )}
          </div>
        ) : null}

        {r ? (
          <>
            <div className="videos">
              {[...r.videos].sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b)).map((nome) => (
                <div key={nome} className="card">
                  <h3 style={{ fontSize: "1.05rem" }}>{NOMES[nome] ?? nome}</h3>
                  <video className={nome.includes("vertical") ? "v" : ""} src={arquivo(nome)} controls playsInline preload="metadata" />
                  <a className="btn secondary block" style={{ marginTop: 12 }} href={`${arquivo(nome)}?baixar=1`}>Baixar</a>
                </div>
              ))}
            </div>

            <p className="small muted">Os arquivos ficam disponíveis por 90 dias. Baixe os vídeos para guardar.</p>

            {r.legenda ? (
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0 }}>Legenda</h3>
                  <Copiar texto={r.legenda} />
                </div>
                <pre className="legenda">{r.legenda}</pre>
              </div>
            ) : null}

            <div className="grid grid-2">
              {r.ganchos.length ? (
                <div className="card">
                  <h3>5 ganchos</h3>
                  <ol>{r.ganchos.map((g) => <li key={g}>{g}</li>)}</ol>
                </div>
              ) : null}
              {r.titulos.length ? (
                <div className="card">
                  <h3>Títulos para Reels</h3>
                  <ul>{r.titulos.map((t) => <li key={t}>{t}</li>)}</ul>
                  {r.kit ? <a className="btn secondary" href={`${arquivo(r.kit)}?baixar=1`}>Baixar kit com 3 roteiros</a> : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
