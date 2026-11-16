#!/usr/bin/env bash
# Publica o site e o processador de vídeos no Google Cloud (Cloud Run + Firestore + Cloud Storage).
#
# Rode no Cloud Shell (console.cloud.google.com, ícone ">_"), dentro da pasta imovel-video:
#   ./deploy.sh
#
# Pode rodar de novo a qualquer momento para atualizar: o que já existe é mantido.
# Variáveis opcionais: PROJETO, REGIAO (padrão us-central1), SITE_URL (seu domínio, se já tiver).
set -euo pipefail

PROJETO="${PROJETO:-$(gcloud config get-value project 2>/dev/null)}"
REGIAO="${REGIAO:-us-central1}"   # us-central1 tem a maior cota gratuita
BUCKET="${BUCKET:-${PROJETO}-videos}"
REPO="app"
SA_NOME="app-videos"
SA="${SA_NOME}@${PROJETO}.iam.gserviceaccount.com"
IMG="${REGIAO}-docker.pkg.dev/${PROJETO}/${REPO}"

if [[ -z "$PROJETO" ]]; then
  echo "Defina o projeto: gcloud config set project <ID-DO-PROJETO>" >&2
  exit 1
fi
cd "$(dirname "$0")"
passo() { echo -e "\n==> $*"; }

passo "Projeto: $PROJETO | Região: $REGIAO"
gcloud config set project "$PROJETO" >/dev/null

passo "Ativando os serviços do Google (pode levar 1-2 minutos na primeira vez)"
gcloud services enable run.googleapis.com firestore.googleapis.com storage.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com

passo "Banco de dados (Firestore)"
if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  gcloud firestore databases create --location="$REGIAO" --type=firestore-native
fi
for idx in "usuario_id,ascending criado_em,descending" "status,ascending criado_em,ascending"; do
  set -- $idx
  gcloud firestore indexes composite create --collection-group=videos \
    --field-config="field-path=${1%,*},order=${1#*,}" --field-config="field-path=${2%,*},order=${2#*,}" \
    --quiet --async >/dev/null 2>&1 || true   # já existe = ok
done

passo "Armazenamento dos vídeos (Cloud Storage): gs://$BUCKET"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGIAO" --uniform-bucket-level-access
fi
# Vídeos são apagados 90 dias após a criação (o cliente é avisado no painel para baixar).
cat > /tmp/ciclo.json <<'JSON'
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 90, "matchesPrefix": ["videos/"]}}]}
JSON
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=/tmp/ciclo.json >/dev/null

passo "Repositório das imagens (Artifact Registry)"
if ! gcloud artifacts repositories describe "$REPO" --location="$REGIAO" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGIAO"
fi

passo "Conta de serviço e permissões"
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NOME" --display-name="App Videos Imob"
  sleep 10
fi
for papel in roles/datastore.user roles/run.invoker roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJETO" --member="serviceAccount:$SA" --role="$papel" --condition=None >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
# O Cloud Build usa a conta padrão do Compute: precisa poder montar e publicar as imagens.
NUM=$(gcloud projects describe "$PROJETO" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJETO" --member="serviceAccount:${NUM}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudbuild.builds.builder --condition=None >/dev/null

passo "Chaves secretas (ficam no Secret Manager; não aparecem no código nem nos logs)"
segredo() { # nome, descrição, obrigatório(1/0)
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    echo "  $1: já cadastrado (para trocar: gcloud secrets versions add $1 --data-file=-)"
    return 0
  fi
  read -r -s -p "  $2: " valor; echo
  if [[ -z "$valor" ]]; then
    [[ "$3" == "1" ]] && { echo "  Obrigatório." >&2; exit 1; }
    return 1
  fi
  printf "%s" "$valor" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic >/dev/null
}
segredo anthropic-api-key "Chave da API da Anthropic (console.anthropic.com > API Keys)" 1
MP_OK=1
segredo mp-access-token "Access Token de PRODUÇÃO do Mercado Pago (Enter para pular)" 0 || MP_OK=0
segredo mp-webhook-secret "Assinatura secreta do webhook do Mercado Pago (Enter para pular)" 0 || true

passo "Montando as imagens no Cloud Build (10-20 minutos na primeira vez)"
gcloud builds submit --config=cloudbuild.yaml --substitutions="_IMG=$IMG" .

passo "Processador de vídeos (Cloud Run Job: 4 vCPU, 8 GB, liga só quando há pedido)"
gcloud run jobs deploy processador --image="$IMG/processador:latest" --region="$REGIAO" \
  --service-account="$SA" --cpu=4 --memory=8Gi --task-timeout=3600 --max-retries=0 \
  --set-env-vars="BANCO=firestore,ARMAZENAMENTO=gcs,BUCKET=$BUCKET" \
  --set-secrets="ANTHROPIC_API_KEY=anthropic-api-key:latest" --quiet

SEGREDOS_SITE=""
ENV_SITE="BANCO=firestore,ARMAZENAMENTO=gcs,BUCKET=$BUCKET,JOB_PROCESSADOR=processador,REGIAO=$REGIAO,PROJETO_GCP=$PROJETO"
if [[ "$MP_OK" == "1" ]] || gcloud secrets describe mp-access-token >/dev/null 2>&1; then
  SEGREDOS_SITE="MP_ACCESS_TOKEN=mp-access-token:latest"
  gcloud secrets describe mp-webhook-secret >/dev/null 2>&1 && SEGREDOS_SITE="$SEGREDOS_SITE,MP_WEBHOOK_SECRET=mp-webhook-secret:latest"
elif [[ "${MODO_TESTE:-0}" == "1" ]]; then
  echo "  ATENÇÃO: sem Mercado Pago e com MODO_TESTE=1, qualquer pessoa ganha créditos simulados."
  echo "  Use só para testar e desligue depois (rode o deploy.sh de novo com o token do Mercado Pago)."
  ENV_SITE="$ENV_SITE,PAGAMENTO_TESTE=1"
else
  echo "  Sem o token do Mercado Pago o site sobe, mas a compra de créditos fica indisponível."
fi

passo "Site (Cloud Run, escala a zero quando ninguém está usando)"
ARGS=(--image="$IMG/site:latest" --region="$REGIAO" --service-account="$SA" --allow-unauthenticated
  --cpu=1 --memory=512Mi --min-instances=0 --max-instances=3 --set-env-vars="$ENV_SITE" --quiet)
[[ -n "$SEGREDOS_SITE" ]] && ARGS+=(--set-secrets="$SEGREDOS_SITE")
gcloud run deploy site "${ARGS[@]}"

URL=$(gcloud run services describe site --region="$REGIAO" --format='value(status.url)')
gcloud run services update site --region="$REGIAO" --update-env-vars="SITE_URL=${SITE_URL:-$URL}" --quiet >/dev/null

passo "Pronto!"
echo "  Site:     ${SITE_URL:-$URL}"
echo "  Webhook do Mercado Pago (cadastre no painel do MP, evento Pagamentos):"
echo "            ${SITE_URL:-$URL}/api/webhooks/mercadopago"
echo "  Logs:     https://console.cloud.google.com/run?project=$PROJETO"
