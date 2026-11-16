# Site — Imóvel em Vídeo

O cliente cria a conta, compra créditos (Pix ou cartão, via Mercado Pago), cola o link do anúncio e recebe
o kit completo: 4 vídeos (Padrão e Ganchos, vertical e horizontal), 5 ganchos, 3 roteiros, 3 títulos e legenda.

## Preços (`lib/planos.ts`)

| Pacote | Preço | Por vídeo |
|---|---|---|
| 1 vídeo | ~~R$ 27~~ R$ 17,00 | R$ 17,00 |
| 10 vídeos (−20%) | R$ 136,00 | R$ 13,60 |
| 25 vídeos (−25%) | R$ 318,75 | R$ 12,75 |
| 50 vídeos (−30%) | R$ 595,00 | R$ 11,90 |

1 crédito = 1 imóvel. Se o link não puder ser lido ou a geração falhar, o crédito volta automaticamente.

## Como funciona

- **Site (Next.js)**: contas, créditos, compra, envio de links e entrega dos vídeos.
- **Processador** (`../src/worker.ts`): pega os pedidos da fila, lê o link, escolhe as fotos, cria os ganchos e
  renderiza os vídeos. No Google Cloud é um Cloud Run Job disparado a cada pedido; localmente, um processo em loop.
- **Dados**: Firestore + Cloud Storage no Google Cloud; SQLite + disco local para desenvolvimento (`lib/repo/`).
- **Créditos**: cada movimento fica registrado (`movimentos`) e é idempotente — um webhook repetido nunca credita duas vezes.

## Publicar no Google Cloud (recomendado)

Arquitetura: **site** no Cloud Run (escala a zero), **processador** como Cloud Run Job (4 vCPU / 8 GB, liga só
quando há pedido), **Firestore** (banco), **Cloud Storage** (vídeos, apagados após 90 dias) e chaves no
**Secret Manager**. Em teste local, cada imóvel levou ~4 min para os 4 vídeos.

1. No console do Google Cloud, selecione o projeto e abra o **Cloud Shell** (ícone `>_`).
2. Baixe o código e rode o script:
   ```bash
   git clone -b claude/real-estate-video-generation-f1z36l https://github.com/diegoreis84/mundocoala-seo.git
   cd mundocoala-seo/imovel-video
   ./deploy.sh
   ```
3. O script pede a chave da API da Anthropic (obrigatória) e as do Mercado Pago (pode pular e rodar de novo
   depois). As chaves vão direto para o Secret Manager.
4. No fim ele mostra a URL do site e a URL do webhook para cadastrar no Mercado Pago.

Para atualizar o site depois de mudanças no código: `git pull && ./deploy.sh`.
Domínio próprio: aponte o domínio para o Cloud Run (Cloud Run > Gerenciar domínios personalizados, ou
Cloudflare na frente) e rode `SITE_URL=https://seudominio.com.br ./deploy.sh`.

## Rodar localmente

```bash
# na pasta imovel-video/
npm install
# na pasta imovel-video/web/
npm install
npm run build
PAGAMENTO_TESTE=1 npm start   # site em http://localhost:3000 (pagamento simulado)
npm run worker                # em outro terminal: processador de vídeos
```

Testes da camada de dados (SQLite e Firestore):
```bash
npx tsx web/scripts/testar-repo.ts                                    # SQLite
gcloud emulators firestore start --host-port=127.0.0.1:8085 &          # Firestore (emulador)
BANCO=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GOOGLE_CLOUD_PROJECT=teste npx tsx web/scripts/testar-repo.ts
```

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | **Obrigatória em produção.** Curadoria das fotos, leitura do anúncio e ganchos. |
| `MP_ACCESS_TOKEN` | Access token do Mercado Pago (Suas integrações > Credenciais de produção). |
| `MP_WEBHOOK_SECRET` | Assinatura secreta do webhook (Suas integrações > Webhooks). Obrigatória em produção. |
| `SITE_URL` | URL pública (usada no retorno do checkout e no webhook). |
| `BANCO` | `firestore` no Google Cloud; padrão SQLite local (`DATA_DIR`). |
| `ARMAZENAMENTO`, `BUCKET` | `gcs` + nome do bucket no Google Cloud; padrão disco local (`DATA_DIR`). |
| `JOB_PROCESSADOR`, `REGIAO`, `PROJETO_GCP` | Para o site disparar o processador no Google Cloud. |
| `PAGAMENTO_TESTE=1` | Só para testes: simula pagamentos. **Nunca no site público.** |

## Créditos de cortesia (testes e brindes)

No Cloud Shell, na pasta `imovel-video/web`:
```bash
npm ci --omit=dev
BANCO=firestore GOOGLE_CLOUD_PROJECT=projeto-app-videos-imob npx -y tsx scripts/creditos.ts email@do-cliente.com 3
```
Número negativo retira créditos. Cada lançamento fica registrado em `movimentos` (motivo "cortesia").

## Mercado Pago — passo a passo

1. Crie a conta (CPF ou CNPJ) e uma aplicação em https://www.mercadopago.com.br/developers/panel/app
   (produto: *Checkout Pro*).
2. Copie o **Access Token de produção** para `MP_ACCESS_TOKEN`.
3. Em **Webhooks**, cadastre `<SITE_URL>/api/webhooks/mercadopago`, evento **Pagamentos**, e copie a
   **assinatura secreta** para `MP_WEBHOOK_SECRET`.
4. Para testar antes de cobrar de verdade, use o Access Token de **teste** e os cartões de teste do Mercado Pago.
5. Pix aparece no checkout quando a conta tem uma chave Pix cadastrada.

## Servidor próprio (alternativa ao Google Cloud)

Também roda numa VPS (ex.: 4 vCPU / 8 GB, Node 22+) com SQLite e disco local: `npm start` + `npm run worker`.
O Remotion exige licença paga para empresas com mais de 3 pessoas.

## Limitações conhecidas

- Portais como ZAP, VivaReal e OLX bloqueiam leitura automática (Cloudflare). O site avisa e devolve o crédito.
- Login por e-mail e senha, sem recuperação de senha ainda.
