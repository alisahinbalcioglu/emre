# ─────────────────────────────────────────────────────────────────
#  MetaPrice Next.js Frontend — Docker image
# ─────────────────────────────────────────────────────────────────
#  KRITIK: NEXT_PUBLIC_API_URL Next.js'te BUILD ANINDA koda gomulur.
#  Bu yuzden build ARG olarak alinir (docker-compose'dan gelir).
#  Yanlis/eksik olursa login localhost'a gider ve patlar.
# ─────────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Bagimliliklar (build icin devDeps de lazim — NODE_ENV'i build'den sonra set ediyoruz)
# --legacy-peer-deps: @cloudflare/next-on-pages + wrangler peer-dep catismasini bypass et
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Kaynak
COPY . .

# API URL'i build'e goml — compose args ile gelir (ornek: https://metapricex.com/api)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# PK11: FE surum damgasi. `prebuild` (scripts/surum-yaz.js) bu degeri arar;
# `.git` imaja girmedigi icin `git rev-parse` konteynerde CALISMAZ ve deger
# BURADAN gelmezse "local" kalir.
#
# ⚠ 01.08 ilk gercek deploy'da tam bu oldu: backend'e ARG gecirilmisti,
# frontend'e UNUTULMUSTU. Canli /surum.json "local" dondu, yani FE kendi
# surumunu SOYLEYEMEDI ve kanit bundle parmak iziyle dolayli kuruldu.
# Kapi (PK11a) canli ortamda FE icin kor kalirdi.
ARG BUILD_SHA=local
ENV BUILD_SHA=${BUILD_SHA}
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# 0.0.0.0'a bagla ki Caddy container'i erisebilsin
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
