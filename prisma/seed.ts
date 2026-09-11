/**
 * Birinchi super adminni yaratadi.
 *
 *   npm run db:seed                                   (dev)
 *   docker compose --profile setup run --rm seed      (server)
 *
 * ⚠️ Mavjud foydalanuvchining parolini O'ZGARTIRMAYDI — qayta ishga tushirish
 * xavfsiz. Parolni tiklash kerak bo'lsa: `--reset-password` bayrog'i (barcha
 * sessiyalari ham bekor bo'ladi).
 * ⚠️ Parol faqat env'dan olinadi va hech qayerga chiqarilmaydi.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const reset = process.argv.includes("--reset-password");

  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD berilmagan yoki 10 belgidan qisqa");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && !reset) {
    console.log(`"${username}" allaqachon bor — o'zgartirilmadi (parolni tiklash: --reset-password)`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    await prisma.user.update({
      where: { username },
      data: { passwordHash, role: "SUPER_ADMIN", isActive: true, sessionVersion: { increment: 1 } },
    });
    console.log(`"${username}" paroli tiklandi (eski sessiyalar bekor)`);
  } else {
    await prisma.user.create({
      data: { username, fullName: "Bosh administrator", passwordHash, role: "SUPER_ADMIN" },
    });
    console.log(`"${username}" super admin yaratildi`);
  }
}

main()
  .catch((e) => {
    console.error("XATO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
