#!/usr/bin/env bash
# MetaPrice DWG Engine — Google Cloud Run Deploy Script (Bash)
#
# Kullanim:
#   1. gcloud auth login
#   2. gcloud config set project metaprice-dwg-prod
#   3. export INTERNAL_API_TOKEN="..."
#   4. ./deploy-to-cloudrun.sh

set -e

# Config — kendi project'ine gore degistir
PROJECT_ID="metaprice-dwg-prod"
REGION="europe-west3"             # Frankfurt
SERVICE="metaprice-dwg-engine"

# Engine internal token
if [ -z "$INTERNAL_API_TOKEN" ]; then
    echo "HATA: INTERNAL_API_TOKEN env variable set degil"
    echo "Set et: export INTERNAL_API_TOKEN='token_buraya'"
    exit 1
fi

echo "=== MetaPrice DWG Engine — Cloud Run Deploy ==="
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE"
echo ""

# Active gcloud account dogrula
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
if [ -z "$ACCOUNT" ]; then
    echo "HATA: gcloud login degilsin"
    echo "Once: gcloud auth login"
    exit 1
fi
echo "Active account: $ACCOUNT"

gcloud config set project "$PROJECT_ID" 2>/dev/null

echo ""
echo "Deploy basliyor... (build 8-12 dk, LibreDWG source compile dahil)"
echo ""

gcloud run deploy "$SERVICE" \
    --source=. \
    --region="$REGION" \
    --platform=managed \
    --allow-unauthenticated \
    --memory=2Gi \
    --cpu=1 \
    --timeout=600 \
    --concurrency=1 \
    --max-instances=3 \
    --min-instances=0 \
    --port=8080 \
    --set-env-vars="INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN,WORKERS=1,PYTHONUNBUFFERED=1"

URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format="value(status.url)")

echo ""
echo "=== DEPLOY BASARILI ==="
echo "Service URL: $URL"
echo ""
echo "Test:"
echo "  curl $URL/health"
echo ""
echo "Backend NestJS env update et:"
echo "  Render dashboard -> metaprice-api -> Environment ->"
echo "  DWG_ENGINE_URL = $URL"
