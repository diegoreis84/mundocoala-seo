import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { kitMarkdown } from "./hooks/kit.js";
import { createStoryboards, type Modo } from "./pipeline.js";
import { renderStoryboard, type Formato } from "./render.js";
import { BrandSchema, StoryboardSchema, type Storyboard } from "./types.js";

const HELP = `
Uso:
  npm run gerar -- --fotos <pasta> --anuncio <arquivo.txt> [opções]
  npm run gerar -- --fotos <pasta> --roteiro <saida>/roteiro-ganchos.json   (renderiza um roteiro revisado)

Opções:
  --fotos <pasta>        Pasta com as fotos do imóvel
  --anuncio <arquivo>    Texto do anúncio (.txt)
  --marca <arquivo>      JSON da imobiliária: {"nome","creci","contato","cor","logo"}
  --saida <pasta>        Pasta de saída (padrão: out/<nome-da-pasta-de-fotos>)
  --modos <lista>        padrao,ganchos (padrão: ambos)
  --formatos <lista>     vertical,horizontal (padrão: ambos)
  --max-cenas <n>        Máximo de fotos no vídeo padrão (padrão: 8)
  --trilha <arquivo>     Música (arquivo dentro da pasta de fotos)
  --so-roteiro           Só gera roteiros e kit para revisão, sem renderizar
  --sem-ia               Força o modo sem IA (heurísticas e modelos de gancho)
`;

function printStoryboard(sb: Storyboard) {
  console.log(`\n[${sb.modo}] ${sb.cenas.length} cenas:`);
  sb.cenas.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.foto.padEnd(28)} ${(c.fase ?? c.ambiente).padEnd(12)} "${c.titulo}"${c.subtitulo ? ` — ${c.subtitulo}` : ""}`),
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      fotos: { type: "string" },
      anuncio: { type: "string" },
      marca: { type: "string" },
      saida: { type: "string" },
      modos: { type: "string", default: "padrao,ganchos" },
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

  let storyboards: Storyboard[];
  if (values.roteiro) {
    storyboards = [StoryboardSchema.parse(JSON.parse(await fs.readFile(values.roteiro, "utf8")))];
    printStoryboard(storyboards[0]);
  } else {
    if (!values.anuncio) throw new Error("Informe --anuncio <arquivo.txt>");
    const anuncio = await fs.readFile(values.anuncio, "utf8");
    const marca = BrandSchema.parse(values.marca ? JSON.parse(await fs.readFile(values.marca, "utf8")) : { nome: "Sua Imobiliária" });
    const result = await createStoryboards({
      fotosDir,
      anuncio,
      marca,
      modos: values.modos.split(",").map((m) => m.trim()) as Modo[],
      maxCenas: Number(values["max-cenas"]),
      usarIA: values["sem-ia"] ? false : undefined,
      log: console.log,
    });
    storyboards = result.storyboards;
    for (const sb of storyboards) {
      await fs.writeFile(path.join(outDir, `roteiro-${sb.modo}.json`), JSON.stringify(sb, null, 2));
      printStoryboard(sb);
    }
    await fs.writeFile(path.join(outDir, "ranking.json"), JSON.stringify(result.ranking, null, 2));
    const desc = storyboards[0]?.descartadas ?? [];
    if (desc.length) {
      console.log(`\nDescartadas (${desc.length}):`);
      desc.forEach((d) => console.log(`  - ${d.foto}: ${d.motivo}`));
    }
    if (result.pack) {
      const kit = path.join(outDir, "kit-ganchos.md");
      await fs.writeFile(kit, kitMarkdown(result.pack, storyboards[0].imovel.titulo));
      await fs.writeFile(path.join(outDir, "kit-ganchos.json"), JSON.stringify(result.pack, null, 2));
      console.log(`\nKit de divulgação (ganchos, roteiros, títulos, legenda): ${kit}`);
    }
    console.log(`Roteiros salvos em ${outDir} (edite e rode com --roteiro para ajustar).`);
    if (values["so-roteiro"]) return;
  }

  const outputs: string[] = [];
  for (const sb of storyboards) {
    console.log(`\nRenderizando ${sb.modo}...`);
    let last = -1;
    outputs.push(
      ...(await renderStoryboard({
        storyboard: sb,
        assetsDir: fotosDir,
        outDir,
        formatos,
        nome: sb.modo,
        trilha: values.trilha,
        onProgress: (f, p) => {
          const pct = Math.floor(p * 4) * 25;
          if (pct !== last) console.log(`  ${f}: ${(last = pct)}%`);
        },
      })),
    );
  }
  console.log("\nPronto:");
  outputs.forEach((o) => console.log(`  ${o}`));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
