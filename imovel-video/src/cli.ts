import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createStoryboard } from "./pipeline.js";
import { renderStoryboard, type Formato } from "./render.js";
import { BrandSchema, StoryboardSchema } from "./types.js";

const HELP = `
Uso:
  npm run gerar -- --fotos <pasta> --anuncio <arquivo.txt> [opções]
  npm run gerar -- --roteiro <saida>/roteiro.json --fotos <pasta>    (renderiza um roteiro revisado)

Opções:
  --fotos <pasta>        Pasta com as fotos do imóvel
  --anuncio <arquivo>    Texto do anúncio (.txt)
  --marca <arquivo>      JSON da imobiliária: {"nome","creci","contato","cor","logo"}
  --saida <pasta>        Pasta de saída (padrão: out/<nome-da-pasta-de-fotos>)
  --formatos <lista>     vertical,horizontal (padrão: ambos)
  --max-cenas <n>        Máximo de fotos no vídeo (padrão: 8)
  --trilha <arquivo>     Música (arquivo dentro da pasta de fotos)
  --so-roteiro           Só gera roteiro.json para revisão, sem renderizar
  --sem-ia               Força o modo heurístico (sem chamadas à API)
`;

async function main() {
  const { values } = parseArgs({
    options: {
      fotos: { type: "string" },
      anuncio: { type: "string" },
      marca: { type: "string" },
      saida: { type: "string" },
      formatos: { type: "string", default: "vertical,horizontal" },
      "max-cenas": { type: "string", default: "8" },
      trilha: { type: "string" },
      roteiro: { type: "string" },
      "so-roteiro": { type: "boolean", default: false },
      "sem-ia": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !values.fotos) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }
  const fotosDir = path.resolve(values.fotos);
  const outDir = path.resolve(values.saida ?? path.join("out", path.basename(fotosDir)));
  await fs.mkdir(outDir, { recursive: true });
  const formatos = values.formatos.split(",").map((f) => f.trim()) as Formato[];

  let storyboard;
  if (values.roteiro) {
    storyboard = StoryboardSchema.parse(JSON.parse(await fs.readFile(values.roteiro, "utf8")));
    console.log(`Roteiro carregado: ${storyboard.cenas.length} cenas.`);
  } else {
    if (!values.anuncio) throw new Error("Informe --anuncio <arquivo.txt>");
    const anuncio = await fs.readFile(values.anuncio, "utf8");
    const marca = BrandSchema.parse(values.marca ? JSON.parse(await fs.readFile(values.marca, "utf8")) : { nome: "Sua Imobiliária" });
    const result = await createStoryboard({
      fotosDir,
      anuncio,
      marca,
      maxCenas: Number(values["max-cenas"]),
      usarIA: values["sem-ia"] ? false : undefined,
      log: console.log,
    });
    storyboard = result.storyboard;
    const roteiroPath = path.join(outDir, "roteiro.json");
    await fs.writeFile(roteiroPath, JSON.stringify(storyboard, null, 2));
    await fs.writeFile(path.join(outDir, "ranking.json"), JSON.stringify(result.ranking, null, 2));

    console.log(`\nCenas escolhidas (${storyboard.cenas.length}):`);
    storyboard.cenas.forEach((c, i) => console.log(`  ${i + 1}. ${c.foto.padEnd(28)} ${c.ambiente.padEnd(10)} "${c.titulo}"${c.subtitulo ? ` — ${c.subtitulo}` : ""}`));
    if (storyboard.descartadas.length) {
      console.log(`Descartadas (${storyboard.descartadas.length}):`);
      storyboard.descartadas.forEach((d) => console.log(`  - ${d.foto}: ${d.motivo}`));
    }
    console.log(`\nRoteiro salvo em ${roteiroPath} (edite e rode com --roteiro para ajustar).`);
    if (values["so-roteiro"]) return;
  }

  console.log("\nRenderizando...");
  let last = "";
  const outputs = await renderStoryboard({
    storyboard,
    assetsDir: fotosDir,
    outDir,
    formatos,
    trilha: values.trilha,
    onProgress: (f, p) => {
      const msg = `  ${f}: ${Math.round(p * 100)}%`;
      if (msg !== last && Math.round(p * 100) % 10 === 0) console.log((last = msg));
    },
  });
  console.log("\nPronto:");
  outputs.forEach((o) => console.log(`  ${o}`));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
