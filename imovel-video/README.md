# imovel-video

Gera vídeos de divulgação de imóveis a partir das **fotos** e do **texto do anúncio**:
escolhe as melhores fotos, monta um roteiro de visita e aplica as informações do anúncio
com um visual elegante, em **9:16** (Reels/TikTok/Shorts) e **16:9** (portais/YouTube).

MVP do produto. Por enquanto roda pela linha de comando; a API/SaaS vem depois (ver "Próximos passos").

## Como funciona

```
fotos + anúncio
   │
   ├─ 1. Métricas locais (sharp): nitidez, exposição, resolução, dHash + cor média (duplicadas)
   ├─ 2. IA (Claude): lê o anúncio → dados estruturados; avalia cada foto → ambiente, nota estética, problemas
   ├─ 3. Roteiro: descarta duplicadas/ruins, escolhe a melhor por ambiente na ordem de visita
   │      (fachada/vista → sala → varanda → cozinha → suíte → quarto → banheiro → lazer)
   │      e liga cada informação à foto certa (suíte → "2 suítes")
   ├─ 4. roteiro.json  ← revisão humana (trocar foto, editar texto)
   └─ 5. Render (Remotion): câmera suave, legendas, chips de destaque, encerramento com preço e contato
```

Os textos **nunca** são gerados dentro do vídeo pela IA: entram por cima, no Remotion, para
não haver preço ou número errado.

## Uso

```bash
npm install

# Fotos de teste (sintéticas) — opcional
npm run exemplo:fotos

# Gera roteiro + vídeos
export ANTHROPIC_API_KEY=...          # sem chave, roda em modo demo (heurísticas, bem inferior)
npm run gerar -- --fotos exemplo/fotos --anuncio exemplo/anuncio.txt --marca exemplo/marca.json

# Só o roteiro, para revisar antes de renderizar
npm run gerar -- --fotos <pasta> --anuncio <arquivo.txt> --so-roteiro
# ...edite out/<pasta>/roteiro.json e renderize:
npm run gerar -- --fotos <pasta> --roteiro out/<pasta>/roteiro.json
```

Saída em `out/<nome-da-pasta>/`: `video-vertical.mp4`, `video-horizontal.mp4`, `roteiro.json`, `ranking.json`.

Opções: `--formatos vertical,horizontal`, `--max-cenas 8`, `--trilha musica.mp3` (dentro da pasta de fotos),
`--sem-ia`. Modelo: `IMOVEL_MODEL` (padrão `claude-opus-5-5`).
Navegador: o Remotion baixa o próprio Chrome; para usar outro, `REMOTION_BROWSER=/caminho/do/chrome`.

### Marca da imobiliária (`--marca`)

```json
{ "nome": "Casa Nobre Imóveis", "creci": "12345-J", "contato": "(11) 99999-0000", "cor": "#C8A46A", "logo": "logo.png" }
```
O `logo` é um arquivo dentro da pasta de fotos.

## Estrutura

| Caminho | O quê |
|---|---|
| `src/curation/metrics.ts` | Nitidez, exposição, dHash, cor média |
| `src/ai/extractListing.ts` | Anúncio → dados estruturados (structured outputs) |
| `src/ai/analyzePhotos.ts` | Fotos → ambiente, nota estética, problemas (em lotes de 12, 1024px) |
| `src/curation/fallback.ts` | Heurísticas sem IA (modo demo) |
| `src/storyboard.ts` | Nota final, duplicadas, roteiro de visita, legendas |
| `src/video/provider.ts` | Interface para animação por IA (Veo, Kling, Runway...) + prompt seguro |
| `src/render.ts` | Render com Remotion |
| `remotion/` | Modelo visual (composições `Vertical` e `Horizontal`) |
| `remotion/fonts/` | Playfair Display e Inter (licença OFL), embutidas para render offline |

## Próximos passos

1. **Animação por IA** nas 2–3 cenas principais: implementar um `VideoProvider` (Veo via Gemini API/Vertex
   ou outro) usando `cameraPrompt()`; o clipe vai em `Scene.video` e substitui o zoom.
2. **API + fila**: endpoint que recebe link/fotos, fila (BullMQ/Inngest), storage (S3/GCS), Remotion Lambda.
3. **Tela de revisão** web no lugar de editar o `roteiro.json`.
4. Leitura direta de links de portais, múltiplos modelos visuais por imobiliária, narração, publicação nas redes.
