/**
 * DEV (Windows): lokal Postgres'da ikkita baza va `.env` fayl.
 *
 *   DEV_PG_URL="postgresql://USER:PAROL@localhost:5433/postgres" npm run dev:setup
 *
 *   payments               — o'z bazamiz (foydalanuvchilar, audit)
 *   payments_project_stub  — `project` bazasining SOXTA nusxasi (`npm run dev:stub`)
 *
 * ⚠️ Hech qanday sir ekranga chiqarilmaydi. `.env` allaqachon bo'lsa — TEGILMAYDI.
 * ⚠️ Faqat dev uchun — Docker image'ga kirmaydi (.dockerignore → scripts/dev).
 */
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const DBS = ["payments", "payments_project_stub"] as const;

function withDb(base: string, db: string): string {
  const u = new URL(base);
  u.pathname = `/${db}`;
  u.search = ""; // obyektlar URL'idagi `?schema=` kabi parametrlar kerak emas
  return u.toString();
}

async function main() {
  const admin = process.env.DEV_PG_URL;
  if (!admin) throw new Error("DEV_PG_URL berilmagan (lokal Postgres'ga administrator ulanishi)");

  const p = new PrismaClient({ datasourceUrl: admin });
  try {
    for (const db of DBS) {
      const rows = await p.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_database WHERE datname = ${db}`;
      if (Number(rows[0]?.n ?? 0) > 0) {
        console.log(`baza bor: ${db}`);
      } else {
        // Nom ro'yxatdan (yuqorida) — foydalanuvchi kiritmaydi.
        await p.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
        console.log(`baza yaratildi: ${db}`);
      }
    }
  } finally {
    await p.$disconnect();
  }

  if (existsSync(".env")) {
    console.log(".env bor — o'zgartirilmadi");
    return;
  }
  const lines = [
    "# npm run dev:setup yaratgan (dev). Git'ga tushmaydi.",
    `DATABASE_URL="${withDb(admin, "payments")}"`,
    `NEXTAUTH_SECRET="${randomBytes(32).toString("base64")}"`,
    `NEXTAUTH_URL="http://localhost:3001"`,
    `PROJECT_DATABASE_URL="${withDb(admin, "payments_project_stub")}"`,
    `SEED_ADMIN_USERNAME="admin"`,
    `SEED_ADMIN_PASSWORD="${randomBytes(12).toString("base64url")}"`,
    "",
  ];
  writeFileSync(".env", lines.join("\n"), { encoding: "utf8", mode: 0o600 });
  console.log(".env yaratildi (admin paroli — .env dagi SEED_ADMIN_PASSWORD)");
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exitCode = 1;
});
