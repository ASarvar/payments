# syntax=docker/dockerfile:1
#
# To'lovlar monitoringi — production image.
#
# Ikkita runtime bosqichi bitta build'dan chiqadi:
#   web    — Next.js standalone serveri (kichik, faqat `node server.js`)
#   tools  — migratsiya va seed (to'liq node_modules: prisma CLI, tsx)

ARG NODE_IMAGE=node:22-bookworm-slim

# ───────────────────────────── deps ─────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# openssl — Prisma query engine uchun shart (slim image'da yo'q).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# ⚠️ package-lock.json LINUX'da yaratilgan bo'lishi shart (CLAUDE.md).
COPY package.json package-lock.json ./
RUN npm ci

# ──────────────────────────── builder ────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` sahifa modullarini import qiladi, ular esa src/lib/env.ts ni ishga tushiradi
# (zod) — build uchun SOXTA qiymat. ⚠️ ENV emas, faqat shu RUN uchun: `tools` image'iga
# meros bo'lib o'tmasin (.env.production'da unutilsa xato o'rniga soxta bazaga ulanardi).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_SECRET="build-time-only-not-a-real-secret" \
    npm run build

# ────────────────────────────── web ──────────────────────────────
FROM ${NODE_IMAGE} AS web
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Standalone tracing Prisma engine'ini har doim ham ilib ketmaydi — aniq nusxalaymiz.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ───────────────────────────── tools ─────────────────────────────
FROM builder AS tools
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
USER node
CMD ["npx", "prisma", "migrate", "deploy"]
