/**
 * Processador de vídeos: pega pedidos da fila, lê o link, gera e renderiza os vídeos
 * e envia o resultado para o armazenamento (disco local ou Cloud Storage).
 *
 *   npx tsx src/worker.ts            fica em loop (servidor próprio / desenvolvimento)
 *   npx tsx src/worker.ts --uma-vez  esvazia a fila e encerra (Cloud Run Job)
 *
 * Um vídeo por vez por processador; vários processadores podem rodar juntos com segurança.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { kitMarkdown } from "./hooks/kit.js";
import { LinkIlegivel, lerAnuncio } from "./ingest/fromUrl.js";
import { createStoryboards } from "./pipeline.js";
import { renderStoryboard } from "./render.js";
import type { Brand } from "./types.js";
import { baixarArquivo, enviarArquivo } from "../web/lib/armazenamento.js";
import { getRepo, type Usuario, type Video } from "../web/lib/repo/index.js";

const INTERVALO_MS = 3000;
const TRAVADO_MIN = 45; // tempo máximo de um vídeo em "processando" antes de voltar para a fila
const UMA_VEZ = process.argv.includes("--uma-vez");

const TIPOS: Record<string, string> = { ".mp4": "video/mp4", ".md": "text/markdown; charset=utf-8" };

async function etapa(id: string, texto: string) {
  await (await getRepo()).atualizarVideo(id, { etapa: texto });
  console.log(`[${id.slice(0, 8)}] ${texto}`);
}

function marcaDoUsuario(u: Usuario, logo?: string): Brand {
  return {
    nome: u.marca_nome || u.nome,
    creci: u.marca_creci || undefined,
    contato: u.marca_contato || undefined,
    cor: u.marca_cor || "#C8A46A",
    logo,
  };
}

async function processar(v: Video) {
  const repo = await getRepo();
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), `video-${v.id.slice(0, 8)}-`));
  const fotos = path.join(pasta, "fotos");
  const saida = path.join(pasta, "saida");
  await fs.mkdir(saida, { recursive: true });
  try {
    const u = await repo.usuario(v.usuario_id);
    if (!u) throw new Error("Usuário não encontrado");

    await etapa(v.id, "Lendo o anúncio e baixando as fotos");
    const anuncio = await lerAnuncio(v.url, fotos);
    await repo.atualizarVideo(v.id, { titulo: anuncio.titulo.slice(0, 140) });

    let logo: string | undefined;
    if (u.marca_logo) {
      logo = "logo" + path.extname(u.marca_logo);
      await baixarArquivo(u.marca_logo, path.join(fotos, logo));
    }

    await etapa(v.id, `Escolhendo as melhores fotos (${anuncio.fotos.length}) e criando os ganchos`);
    const { storyboards, pack } = await createStoryboards({
      fotosDir: fotos,
      anuncio: `${anuncio.titulo}\n\n${anuncio.texto}\n\nFonte: ${v.url}`,
      marca: marcaDoUsuario(u, logo),
      modos: ["padrao", "ganchos"],
    });
    const titulo = storyboards[0]?.imovel.titulo;
    if (titulo) await repo.atualizarVideo(v.id, { titulo });
    if (pack) await fs.writeFile(path.join(saida, "kit-ganchos.md"), kitMarkdown(pack, titulo ?? "Imóvel"));

    const videos: string[] = [];
    for (const sb of storyboards) {
      for (const formato of ["vertical", "horizontal"] as const) {
        await etapa(v.id, `Gerando vídeo ${sb.modo === "ganchos" ? "Ganchos" : "Padrão"} (${formato})`);
        const out = await renderStoryboard({ storyboard: sb, assetsDir: fotos, outDir: saida, formatos: [formato], nome: sb.modo });
        videos.push(...out.map((o) => path.basename(o)));
      }
    }

    await etapa(v.id, "Finalizando");
    for (const nome of [...videos, ...(pack ? ["kit-ganchos.md"] : [])]) {
      await enviarArquivo(`videos/${v.id}/${nome}`, path.join(saida, nome), TIPOS[path.extname(nome)]);
    }

    const resultado = {
      videos,
      kit: pack ? "kit-ganchos.md" : null,
      legenda: pack?.legenda ?? null,
      ganchos: pack?.ganchos.map((g) => g.texto) ?? [],
      titulos: pack?.titulos_reels ?? [],
    };
    await repo.atualizarVideo(v.id, {
      status: "pronto",
      etapa: null,
      resultado: JSON.stringify(resultado),
      concluido_em: new Date().toISOString(),
    });
    console.log(`[${v.id.slice(0, 8)}] pronto`);
  } finally {
    await fs.rm(pasta, { recursive: true, force: true });
  }
}

async function main() {
  const repo = await getRepo();
  const voltaram = await repo.reenfileirarTravados(TRAVADO_MIN);
  if (voltaram) console.log(`${voltaram} vídeo(s) travado(s) voltaram para a fila.`);
  console.log(`Processador de vídeos iniciado (${UMA_VEZ ? "esvazia a fila e encerra" : "loop"}).`);
  for (;;) {
    const v = await repo.reservarProximo();
    if (!v) {
      if (UMA_VEZ) break;
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
      continue;
    }
    try {
      await processar(v);
    } catch (e) {
      const amigavel = e instanceof LinkIlegivel ? e.message : "Não foi possível gerar o vídeo deste anúncio.";
      console.error(`[${v.id.slice(0, 8)}] erro:`, e);
      await repo.falharVideo(v.id, amigavel); // marca erro e devolve o crédito
    }
  }
  console.log("Fila vazia. Encerrando.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
