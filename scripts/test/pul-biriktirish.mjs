// "Pul biriktirish": shartlarni tekshirish va birikishni bekor qilish (YAGONA yozuv amali).
// ⚠️ Bu to'plam SOXTA bazaga YOZADI (`state = 0`), keyin qiymatni qaytaradi. Faqat dev stub!
import { CHANNELS, cookieFor, db, get, isRedirTo, norm, proj, ro, sum, unesc } from "./_lib.mjs";

export const NAME = "Pul biriktirish (bekor qilish)";

const PATH = "/dashboard/pul-biriktirish";
/** sum > 0 AND sent IS TRUE — bekor qilishga to'siq. */
const BLOCKED = CHANNELS.map(([, S, , T]) => `(${S} > 0 AND ${T} IS TRUE)`).join(" OR ");

/** Soxta bazaga yozish — faqat test tozalashi uchun (ilova buni `writeTx` orqali qiladi). */
const write = (sql) => proj.$executeRawUnsafe(sql);

export default async function run(t) {
  const A = await cookieFor("test-pb-admin", "ADMIN");
  const M = await cookieFor("test-pb-mod", "MODERATOR", 26);

  // Shartga MOS qism (hech bir ulush topshiriqnomada emas) va MOS EMAS qism.
  const [free] = await ro(`SELECT id::text AS id, asum::float8 AS asum FROM payment_items
    WHERE state = 1 AND NOT (${BLOCKED}) ORDER BY id DESC LIMIT 1`);
  const [blocked] = await ro(`SELECT id::text AS id FROM payment_items
    WHERE state = 1 AND (${BLOCKED}) ORDER BY id DESC LIMIT 1`);
  t.check("stub'da ikkala holat ham bor", Boolean(free && blocked), `${free?.id} / ${blocked?.id}`);
  if (!free || !blocked) return;

  // ── Sahifa: tekshiruv natijasi ──
  let page = unesc(norm(await (await get(`${PATH}?id=${free.id}`, A)).text()));
  t.check("mos qism: 'Bekor qilish mumkin'", page.includes("Bekorqilishmumkin") && page.includes(">Ha<"), free.id);
  t.check("mos qism: summa ko'rsatilgan", page.includes(sum(free.asum).slice(0, 3)));
  t.check("mos qism: tugma ochiq", !page.includes("cursor-not-allowed"));

  page = unesc(norm(await (await get(`${PATH}?id=${blocked.id}`, A)).text()));
  t.check("to'siqli qism: 'Bekor qilib bo'lmaydi'", page.includes("Bekorqilibbo'lmaydi"), blocked.id);
  t.check("to'siqli qism: tugma o'chiq", page.includes("cursor-not-allowed"));
  t.check("to'siqli qism: to'siq belgisi", page.includes("to'siq</span>"));

  t.check("noto'g'ri ID", unesc(norm(await (await get(`${PATH}?id=abc`, A)).text())).includes("faqatraqamlardan"));
  t.check("topilmagan ID", unesc(norm(await (await get(`${PATH}?id=999999999999`, A)).text())).includes("topilmadi"));

  // ── Bekor qilish (server action) ──
  // Next server action JS'siz forma sifatida ishlaydi: multipart POST, yashirin `$ACTION_ID_...`
  // maydoni bilan, o'sha sahifa manziliga (`action=""`).
  const actionIdOf = (html) => {
    const form = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes("Birikishni bekor qilish"));
    return form?.match(/name="\$ACTION_ID_([^"]+)"/)?.[1] ?? null;
  };
  const adminHtml = await (await get(`${PATH}?id=${free.id}`, A)).text();
  const actionId = actionIdOf(adminHtml);
  t.check("bekor qilish formasi topildi", Boolean(actionId));
  if (!actionId) return;

  const post = async (id, cookie) => {
    const fd = new FormData();
    fd.set(`$ACTION_ID_${actionId}`, "");
    fd.set("id", id);
    const r = await fetch(`http://localhost:3001${PATH}?id=${id}`, { method: "POST", headers: { cookie }, body: fd, redirect: "manual" });
    return r.status;
  };

  const before = await ro(`SELECT state FROM payment_items WHERE id = ${free.id}`);
  t.check("bekor qilishdan oldin state = 1", Number(before[0].state) === 1);

  const st1 = await post(free.id, A);
  const [after] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  t.check("bekor qilindi: state = 0", after.state === 0, `state = ${after.state} (HTTP ${st1})`);

  const auditOk = await db.auditLog.findFirst({ where: { action: "CANCEL_ATTACHMENT" }, orderBy: { createdAt: "desc" } });
  t.check("audit: bekor qilish yozildi", auditOk?.details?.qism === free.id, String(auditOk?.details?.qism ?? "—"));

  // Qaytarib qo'yamiz (test ma'lumotni o'zgartirib ketmasin)
  await write(`UPDATE payment_items SET state = 1 WHERE id = ${free.id}`);
  const [restored] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  t.check("stub tiklandi: state = 1", restored.state === 1);

  // To'siqli qismni bekor qilib bo'lmaydi
  const st2 = await post(blocked.id, A);
  const [b2] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${blocked.id}`);
  t.check("to'siqli qism o'zgarmadi", b2.state === 1, `state = ${b2.state} (HTTP ${st2})`);
  const auditFail = await db.auditLog.findFirst({ where: { action: "CANCEL_ATTACHMENT_FAILED" }, orderBy: { createdAt: "desc" } });
  t.check("audit: rad etilgan urinish yozildi", auditFail?.details?.qism === blocked.id, String(auditFail?.details?.qism ?? "—"));

  // ── Moderator: sahifa ham, amal ham yopiq ──
  t.check("M sahifa → ro'yxatga", isRedirTo(await get(PATH, M), "/dashboard/royxat"));
  const [m0] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  const stM = await post(free.id, M);
  const [m1] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  t.check("M bekor qila olmadi", m0.state === m1.state && m1.state === 1, `HTTP ${stM}, state = ${m1.state}`);
}
