/**
 * Processador de vídeos: pega pedidos da fila (tabela videos), lê o link, gera e renderiza
 * os vídeos e grava o resultado. Rodar junto com o site:  npm run worker  (na pasta web/)
 *
 * Um vídeo por vez (render usa bastante CPU). Para escalar: vários workers em máquinas
 * diferentes com Postgres, ou render no Remotion Lambda.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { kitMarkdown } from "./hooks/kit.js";
import { LinkIlegivel, lerAnuncio } from "./ingest/fromUrl.js";
import { createStoryboards } from "./pipeline.js";
import { renderStoryboard } from "./render.js";
import { DATA_DIR, db, estornarVideo, type Usuario, type Video } from "../web/lib/db.js";
import type { Brand } from "./types.js";

const INTERVALO_MS = 3000;

function etapa(id: string, texto: string) {
  db().prepare("UPDATE videos SET etapa = ? WHERE id = ?").run(texto, id);
  console.log(`[${id.slice(0, 8)}] ${texto}`);
}

/** Reserva o próximo vídeo da fila (atômico). */
function proximo(): Video | null {
  const d = db();
  const v = d.prepare("SELECT * FROM videos WHERE status = 'na_fila' ORDER BY criado_em LIMIT 1").get() as Video | undefined;
  if (!v) return null;
  const r = d.prepare("UPDATE videos SET status = 'processando', etapa = 'Iniciando' WHERE id = ? AND status = 'na_fila'").run(v.id);
  return r.changes ? v : null;
}

function marcaDoUsuario(u: Usuario, pasta: string, logoCopiado?: string): Brand {
  return {
    nome: u.marca_nome || u.nome,
    creci: u.marca_creci || undefined,
    contato: u.marca_contato || undefined,
    cor: u.marca_cor || "#C8A46A",
    logo: logoCopiado,
  };
}

async function processar(v: Video) {
  const pasta = path.join(DATA_DIR, "videos", v.id);
  const fotos = path.join(pasta, "fotos");
  const saida = path.join(pasta, "saida");
  await fs.mkdir(saida, { recursive: true });

  const u = db().prepare("SELECT * FROM usuarios WHERE id = ?").get(v.usuario_id) as Usuario;

  etapa(v.id, "Lendo o anúncio e baixando as fotos");
  const anuncio = await lerAnuncio(v.url, fotos);
  db().prepare("UPDATE videos SET titulo = ? WHERE id = ?").run(anuncio.titulo.slice(0, 140), v.id);

  let logo: string | undefined;
  if (u.marca_logo) {
    logo = "logo" + path.extname(u.marca_logo);
    await fs.copyFile(path.join(DATA_DIR, u.marca_logo), path.join(fotos, logo));
  }

  etapa(v.id, `Escolhendo as melhores fotos (${anuncio.fotos.length}) e criando os ganchos`);
  const { storyboards, pack } = await createStoryboards({
    fotosDir: fotos,
    anuncio: `${anuncio.titulo}\n\n${anuncio.texto}\n\nFonte: ${v.url}`,
    marca: marcaDoUsuario(u, pasta, logo),
    modos: ["padrao", "ganchos"],
  });
  const titulo = storyboards[0]?.imovel.titulo;
  if (titulo) db().prepare("UPDATE videos SET titulo = ? WHERE id = ?").run(titulo, v.id);
  for (const sb of storyboards) await fs.writeFile(path.join(saida, `roteiro-${sb.modo}.json`), JSON.stringify(sb, null, 2));
  if (pack) await fs.writeFile(path.join(saida, "kit-ganchos.md"), kitMarkdown(pack, titulo ?? "Imóvel"));

  const arquivos: string[] = [];
  for (const sb of storyboards) {
    for (const formato of ["vertical", "horizontal"] as const) {
      etapa(v.id, `Gerando vídeo ${sb.modo === "ganchos" ? "Ganchos" : "Padrão"} (${formato})`);
      const out = await renderStoryboard({ storyboard: sb, assetsDir: fotos, outDir: saida, formatos: [formato], nome: sb.modo });
      arquivos.push(...out.map((o) => path.basename(o)));
    }
  }
  await fs.rm(path.join(saida, "public-padrao"), { recursive: true, force: true });
  await fs.rm(path.join(saida, "public-ganchos"), { recursive: true, force: true });

  const resultado = {
    videos: arquivos,
    kit: pack ? "kit-ganchos.md" : null,
    legenda: pack?.legenda ?? null,
    ganchos: pack?.ganchos.map((g) => g.texto) ?? [],
    titulos: pack?.titulos_reels ?? [],
  };
  db()
    .prepare("UPDATE videos SET status = 'pronto', etapa = NULL, resultado = ?, concluido_em = datetime('now') WHERE id = ?")
    .run(JSON.stringify(resultado), v.id);
  console.log(`[${v.id.slice(0, 8)}] pronto`);
}

async function loop() {
  // Vídeos que ficaram "processando" após uma queda do worker voltam para a fila.
  db().prepare("UPDATE videos SET status = 'na_fila', etapa = NULL WHERE status = 'processando'").run();
  console.log("Processador de vídeos iniciado. Banco:", DATA_DIR);
  for (;;) {
    const v = proximo();
    if (!v) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
      continue;
    }
    try {
      await processar(v);
    } catch (e) {
      const amigavel = e instanceof LinkIlegivel ? e.message : "Não foi possível gerar o vídeo deste anúncio.";
      console.error(`[${v.id.slice(0, 8)}] erro:`, e);
      db().prepare("UPDATE videos SET status = 'erro', etapa = NULL, erro = ?, concluido_em = datetime('now') WHERE id = ?").run(amigavel, v.id);
      estornarVideo(v.id); // devolve o crédito
    }
  }
}

loop();
