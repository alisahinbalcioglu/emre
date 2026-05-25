# MetaPrice DWG Engine — Google Cloud Run Deploy Script (PowerShell)
#
# Kullanim:
#   1. Once `gcloud auth login` yap
#   2. `gcloud config set project metaprice-dwg-prod` (kendi project-id'in)
#   3. .\deploy-to-cloudrun.ps1
#
# Env variable INTERNAL_API_TOKEN ile auth gonderilir.

# Config — kendi project'ine gore degistir
$PROJECT_ID = "metaprice-dwg-prod"        # GCP project ID
$REGION     = "europe-west3"               # Frankfurt (Render'a yakın)
$SERVICE    = "metaprice-dwg-engine"       # Cloud Run service adi

# Engine internal token — generate edebilirsin:
#   $TOKEN = [System.Web.Security.Membership]::GeneratePassword(48, 0)
# VEYA mevcut Render INTERNAL_API_TOKEN'i kullan (backend NestJS DWG_ENGINE_TOKEN ile esles)
$INTERNAL_TOKEN = $env:INTERNAL_API_TOKEN
if (-not $INTERNAL_TOKEN) {
    Write-Host "HATA: INTERNAL_API_TOKEN env variable set degil" -ForegroundColor Red
    Write-Host "Set et: `$env:INTERNAL_API_TOKEN = 'token_buraya'" -ForegroundColor Yellow
    Write-Host "VEYA Render dashboard -> metaprice-dwg-engine -> Environment -> INTERNAL_API_TOKEN" -ForegroundColor Yellow
    exit 1
}

Write-Host "=== MetaPrice DWG Engine — Cloud Run Deploy ===" -ForegroundColor Cyan
Write-Host "Project:  $PROJECT_ID"
Write-Host "Region:   $REGION"
Write-Host "Service:  $SERVICE"
Write-Host ""

# Active gcloud account dogrula
$account = gcloud config get-value account 2>$null
if (-not $account) {
    Write-Host "HATA: gcloud login degilsin" -ForegroundColor Red
    Write-Host "Once: gcloud auth login" -ForegroundColor Yellow
    exit 1
}
Write-Host "Active account: $account" -ForegroundColor Green

# Project set et
gcloud config set project $PROJECT_ID 2>$null

# Cloud Run deploy — source-based (Dockerfile auto-detect)
Write-Host ""
Write-Host "Deploy basliyor... (build 8-12 dk, LibreDWG source compile dahil)" -ForegroundColor Cyan
Write-Host ""

gcloud run deploy $SERVICE `
    --source=. `
    --region=$REGION `
    --platform=managed `
    --allow-unauthenticated `
    --memory=2Gi `
    --cpu=1 `
    --timeout=600 `
    --concurrency=1 `
    --max-instances=3 `
    --min-instances=0 `
    --port=8080 `
    --set-env-vars="INTERNAL_API_TOKEN=$INTERNAL_TOKEN,WORKERS=1,PYTHONUNBUFFERED=1"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "DEPLOY FAIL — yukaridaki gcloud hatasina bak" -ForegroundColor Red
    exit 1
}

# Service URL al
$url = gcloud run services describe $SERVICE --region=$REGION --format="value(status.url)"
Write-Host ""
Write-Host "=== DEPLOY BASARILI ===" -ForegroundColor Green
Write-Host "Service URL: $url" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test:"
Write-Host "  curl $url/health"
Write-Host ""
Write-Host "Backend NestJS env update et:"
Write-Host "  Render dashboard -> metaprice-api -> Environment ->"
Write-Host "  DWG_ENGINE_URL = $url"
