# imovel-video

Gera vídeos de divulgação de imóveis a partir das **fotos** e do **texto do anúncio**:
escolhe as melhores fotos, monta um roteiro de visita e aplica as informações do anúncio
com um visual elegante, em **9:16** (Reels/TikTok/Shorts) e **16:9** (portais/YouTube).

Duas versões por imóvel:
- **Padrão** — tour elegante pelos ambientes, com as informações do anúncio.
- **Ganchos** — feito para Reels/TikTok: gancho nos 3 primeiros segundos, apresentação em cortes rápidos
  com características transformadas em benefícios, fase de desejo e chamada para ação
  (0–3 s gancho · 3–15 s apresentação · 15–25 s desejo · 25–30 s CTA). Junto vem o **kit de divulgação**
  (`kit-ganchos.md`): 5 ganchos, 3 roteiros de até 30 s, 3 títulos para Reels, legenda com WhatsApp e
  qual característica mostrar primeiro.

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
# ...edite out/<pasta>/roteiro-ganchos.json e renderize:
npm run gerar -- --fotos <pasta> --roteiro out/<pasta>/roteiro-ganchos.json
```

Saída em `out/<nome-da-pasta>/`: `video-{padrao,ganchos}-{vertical,horizontal}.mp4`, `roteiro-{padrao,ganchos}.json`,
`kit-ganchos.md`/`.json` e `ranking.json`. Use `--modos padrao` ou `--modos ganchos` para gerar só um.

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
| `src/hooks/` | Método de ganchos, geração com IA, modelos sem IA e kit em Markdown |
| `remotion/HookScene.tsx` | Tela do gancho (palavra a palavra, destaque) e barra de progresso |
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
