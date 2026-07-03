# ─────────────────────────────────────────────────────────────────
#  MetaPrice NestJS API — Docker image (VPS / docker-compose icin)
# ─────────────────────────────────────────────────────────────────
#  Render'daki proven config'i birebir tasir:
#    build:  npm install --include=dev && prisma generate && nest build
#    start:  prisma migrate deploy && node dist/main
#  Ek olarak puppeteer (teklif PDF export) icin sistem Chromium'u kurar.
# ─────────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# NODE_ENV=production olsa bile --include=dev ile devDeps kurulur (nest build icin).
# Puppeteer kendi Chromium'unu INDIRMESIN — sistem chromium'u kullanacagiz
# (apt paketi tum runtime kutuphanelerini otomatik cozer, lib avina gerek yok).
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# openssl+ca-certificates: Prisma icin | chromium+fonts: puppeteer PDF icin
RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl ca-certificates \
        chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Layer cache: once bagimliliklar
COPY package*.json ./
RUN npm install --include=dev --legacy-peer-deps

# Sonra kaynak — prisma generate + nest build
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3001

# Her acilista once migration uygular (DB semasini gunceller), sonra API'yi baslatir.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
