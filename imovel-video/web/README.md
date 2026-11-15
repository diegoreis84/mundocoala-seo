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
  renderiza os vídeos. Roda na mesma máquina (compartilha o banco SQLite em `web/data/`).
- **Créditos**: cada movimento fica registrado (`movimentos`) e é idempotente — um webhook repetido nunca credita duas vezes.

## Rodar

```bash
# na pasta imovel-video/
npm install
# na pasta imovel-video/web/
npm install
npm run build
npm start            # site em http://localhost:3000
npm run worker       # em outro terminal: processador de vídeos
```

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | **Obrigatória em produção.** Curadoria das fotos, leitura do anúncio e ganchos. Sem ela o resultado é bem pior. |
| `MP_ACCESS_TOKEN` | Access token do Mercado Pago (Suas integrações > Credenciais de produção). |
| `MP_WEBHOOK_SECRET` | Assinatura secreta do webhook (Suas integrações > Webhooks). Obrigatória em produção. |
| `SITE_URL` | URL pública, ex.: `https://videos.seudominio.com.br` (usada no retorno do checkout e no webhook). |
| `DATA_DIR` | Opcional. Onde ficam banco, fotos e vídeos (padrão `web/data`). |
| `PAGAMENTO_TESTE=1` | Só para testes locais: simula pagamentos. **Nunca no site público.** |

## Mercado Pago — passo a passo

1. Crie a conta (CPF ou CNPJ) e uma aplicação em https://www.mercadopago.com.br/developers/panel/app
   (produto: *Checkout Pro*).
2. Copie o **Access Token de produção** para `MP_ACCESS_TOKEN`.
3. Em **Webhooks**, cadastre `<SITE_URL>/api/webhooks/mercadopago`, evento **Pagamentos**, e copie a
   **assinatura secreta** para `MP_WEBHOOK_SECRET`.
4. Para testar antes de cobrar de verdade, use o Access Token de **teste** e os cartões de teste do Mercado Pago.
5. Pix aparece no checkout quando a conta tem uma chave Pix cadastrada.

## Servidor

O render usa Chrome e bastante CPU: use uma VPS (ex.: 4 vCPU / 8 GB) com Node 22+, não hospedagem "serverless".
Cada imóvel leva alguns minutos (4 vídeos). Para mais volume: mais processadores e Postgres, ou render no Remotion Lambda.
O Remotion exige licença paga para empresas com mais de 3 pessoas.

## Limitações conhecidas

- Portais como ZAP, VivaReal e OLX bloqueiam leitura automática (Cloudflare). O site avisa e devolve o crédito.
- Login por e-mail e senha, sem recuperação de senha ainda.
