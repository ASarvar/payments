import { PrismaClient } from "@prisma/client";

const KEEP_DAYS = Number(process.env.AUDIT_KEEP_DAYS ?? 365);

async function main() {
  if (!Number.isInteger(KEEP_DAYS) || KEEP_DAYS < 30) {
    throw new Error(`AUDIT_KEEP_DAYS noto'g'ri (${process.env.AUDIT_KEEP_DAYS}) — eng kami 30 kun`);
  }
  const prisma = new PrismaClient();
  try {
    const chegara = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    const [jami, eski] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { lt: chegara } } }),
    ]);
    if (eski === 0) {
      console.log(`audit: ${jami} yozuv, ${KEEP_DAYS} kundan eskisi yo'q — tozalash kerak emas`);
      return;
    }
    const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: chegara } } });
    console.log(`audit: ${count} ta yozuv o'chirildi (${chegara.toISOString().slice(0, 10)} dan eski), ${jami - count} ta qoldi`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("audit tozalash xatosi:", e instanceof Error ? e.message : e);
  process.exit(1);
});
