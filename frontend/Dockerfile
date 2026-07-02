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
COPY package*.json ./
RUN npm install

# Kaynak
COPY . .

# API URL'i build'e goml — compose args ile gelir (ornek: https://metapricex.com/api)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# 0.0.0.0'a bagla ki Caddy container'i erisebilsin
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
