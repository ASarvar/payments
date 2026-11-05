import { CHANNELS, cookieFor, db, get, isRedirTo, norm, proj, ro, sum, unesc } from "./_lib.mjs";

export const NAME = "Pul biriktirish (bekor qilish)";

const PATH = "/dashboard/pul-biriktirish";
const BLOCKED = CHANNELS.map(([, S, , T]) => `(${S} > 0 AND ${T} IS TRUE)`).join(" OR ");
const OPEN = CHANNELS.map(([, S, , T]) => `(${S} > 0 AND ${T} IS NOT TRUE)`).join(" OR ");
const SUMS = CHANNELS.map(([, S, A]) => `${S}::text AS ${S}, ${A} AS ${A}`).join(", ");
const ACC = Object.fromEntries(CHANNELS.map(([, S, A]) => [S, A]));

const write = (sql) => proj.$executeRawUnsafe(sql);
const TYPE_COLS = ["rent_sum", "penya_sum", "tax_sum", "mail_sum", "fine_sum", "advance_sum", "unknown_sum", "returned_sum", "returned_sum2", "other_sum"];
const paySnap = async (itemId) => {
  const [it] = await ro(`SELECT pay_id::text AS pay_id, pay_type::int AS pay_type FROM payment_items WHERE id = ${itemId}`);
  const col = TYPE_COLS[it.pay_type - 1] ?? null;
  const rows = await ro(`SELECT id::text AS id, parsing_sum::text AS ps${col ? `, ${col}::text AS ts` : ""} FROM payments WHERE pay_id = ${it.pay_id} AND state = 1`);
  return { col, row: rows[0] ?? null };
};
const minus = async (a, b) => (await ro(`SELECT (${a}::numeric - ${b}::numeric)::text AS v`))[0].v;

export default async function run(t) {
  const A = await cookieFor("test-pb-admin", "ADMIN");
  const M = await cookieFor("test-pb-mod", "MODERATOR", 26);

  const [free] = await ro(`SELECT id::text AS id, asum::float8 AS asum FROM payment_items
    WHERE state = 1 AND NOT (${BLOCKED}) ORDER BY id DESC LIMIT 1`);
  const [blocked] = await ro(`SELECT id::text AS id FROM payment_items
    WHERE state = 1 AND (${BLOCKED}) ORDER BY id DESC LIMIT 1`);
  t.check("stub'da ikkala holat ham bor", Boolean(free && blocked), `${free?.id} / ${blocked?.id}`);
  if (!free || !blocked) return;

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

  const actionIdOf = (html, text = "Birikishni bekor qilish") => {
    const form = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(text));
    return form?.match(/name="\$ACTION_ID_([^"]+)"/)?.[1] ?? null;
  };
  const adminHtml = await (await get(`${PATH}?id=${free.id}`, A)).text();
  const actionId = actionIdOf(adminHtml);
  t.check("bekor qilish formasi topildi", Boolean(actionId));
  if (!actionId) return;

  const post = async (id, cookie, aid = actionId) => {
    const fd = new FormData();
    fd.set(`$ACTION_ID_${aid}`, "");
    fd.set("id", id);
    const r = await fetch(`http://localhost:3001${PATH}?id=${id}`, { method: "POST", headers: { cookie }, body: fd, redirect: "manual" });
    return r.status;
  };

  const before = await ro(`SELECT state FROM payment_items WHERE id = ${free.id}`);
  t.check("bekor qilishdan oldin state = 1", Number(before[0].state) === 1);

  const p0 = await paySnap(free.id);
  const st1 = await post(free.id, A);
  const [after] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  t.check("bekor qilindi: state = 0", after.state === 0, `state = ${after.state} (HTTP ${st1})`);

  const auditOk = await db.auditLog.findFirst({ where: { action: "CANCEL_ATTACHMENT" }, orderBy: { createdAt: "desc" } });
  t.check("audit: bekor qilish yozildi", auditOk?.details?.qism === free.id, String(auditOk?.details?.qism ?? "—"));

  if (p0.row) {
    const p1 = await paySnap(free.id);
    t.check("bekor qilish: payments.parsing_sum kamaydi", (await minus(p0.row.ps, free.asum)) === (await minus(p1.row.ps, 0)), `${p0.row.ps} → ${p1.row.ps}`);
    if (p0.col) t.check(`bekor qilish: payments.${p0.col} kamaydi`, (await minus(p0.row.ts, free.asum)) === (await minus(p1.row.ts, 0)));
    await write(`UPDATE payments SET parsing_sum = ${p0.row.ps}${p0.col ? `, ${p0.col} = ${p0.row.ts}` : ""} WHERE id = ${p0.row.id}`);
  }
  await write(`UPDATE payment_items SET state = 1 WHERE id = ${free.id}`);
  const [restored] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  t.check("stub tiklandi: state = 1", restored.state === 1);

  const st2 = await post(blocked.id, A);
  const [b2] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${blocked.id}`);
  t.check("to'siqli qism o'zgarmadi", b2.state === 1, `state = ${b2.state} (HTTP ${st2})`);
  const auditFail = await db.auditLog.findFirst({ where: { action: "CANCEL_ATTACHMENT_FAILED" }, orderBy: { createdAt: "desc" } });
  t.check("audit: rad etilgan urinish yozildi", auditFail?.details?.qism === blocked.id, String(auditFail?.details?.qism ?? "—"));

  t.check("M sahifa → ro'yxatga", isRedirTo(await get(PATH, M), "/dashboard/royxat"));
  const [m0] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  const stM = await post(free.id, M);
  const [m1] = await ro(`SELECT state::int AS state FROM payment_items WHERE id = ${free.id}`);
  t.check("M bekor qila olmadi", m0.state === m1.state && m1.state === 1, `HTTP ${stM}, state = ${m1.state}`);

  const [mixed] = await ro(`SELECT id::text AS id, asum::text AS asum, ${SUMS} FROM payment_items
    WHERE state = 1 AND (${BLOCKED}) AND (${OPEN}) ORDER BY id DESC LIMIT 1`);
  t.check("stub'da to'siqli + ochiq kanalli qism bor", Boolean(mixed), mixed?.id ?? "—");
  if (!mixed) return;
  const openCols = (await ro(`SELECT ${CHANNELS.map(([, S, , T]) => `(${S} > 0 AND ${T} IS NOT TRUE) AS ${S}`).join(", ")}
    FROM payment_items WHERE id = ${mixed.id}`)).flatMap((r) => CHANNELS.map(([, S]) => S).filter((S) => r[S] === true));

  const mixedHtml = await (await get(`${PATH}?id=${mixed.id}`, A)).text();
  t.check("aralash qism: ajratish kartasi", unesc(norm(mixedHtml)).includes("Ochiqkanallarniajratish"));
  t.check("ochiq qism: ajratish kartasi yo'q", !unesc(norm(adminHtml)).includes("Ochiqkanallarniajratish"));
  const detachId = actionIdOf(mixedHtml, "Ochiq kanallarni ajratish");
  t.check("ajratish formasi topildi", Boolean(detachId));
  if (!detachId) return;

  const stM2 = await post(mixed.id, M, detachId);
  const [mm] = await ro(`SELECT asum::text AS asum FROM payment_items WHERE id = ${mixed.id}`);
  t.check("M ajrata olmadi", mm.asum === mixed.asum, `HTTP ${stM2}`);

  const q0 = await paySnap(mixed.id);
  const stD = await post(mixed.id, A, detachId);
  const [d] = await ro(`SELECT state::int AS state, asum::text AS asum, ${SUMS},
      (asum = ${mixed.asum}::numeric - (${openCols.map((S) => `${mixed[S]}::numeric`).join(" + ")})) AS asum_ok
    FROM payment_items WHERE id = ${mixed.id}`);
  t.check("ajratildi: state = 1 qoldi", d.state === 1, `HTTP ${stD}`);
  t.check("ajratildi: ochiq kanallar 0", openCols.every((S) => Number(d[S]) === 0), openCols.join(", "));
  t.check("ajratildi: ochiq kanallar accept = false", openCols.every((S) => d[ACC[S]] === false));
  t.check("ajratildi: to'siqli kanallar o'zgarmadi", CHANNELS.map(([, S]) => S).filter((S) => !openCols.includes(S)).every((S) => d[S] === mixed[S]));
  t.check("ajratildi: asum kamaydi", d.asum_ok === true, `${mixed.asum} → ${d.asum}`);
  const auditD = await db.auditLog.findFirst({ where: { action: "DETACH_CHANNELS" }, orderBy: { createdAt: "desc" } });
  t.check("audit: ajratish yozildi", auditD?.details?.qism === mixed.id, String(auditD?.details?.kanallar ?? "—"));

  if (q0.row) {
    const q1 = await paySnap(mixed.id);
    const delta = await minus(mixed.asum, d.asum);
    t.check("ajratish: payments.parsing_sum kamaydi", (await minus(q0.row.ps, delta)) === (await minus(q1.row.ps, 0)), `${q0.row.ps} → ${q1.row.ps}`);
    await write(`UPDATE payments SET parsing_sum = ${q0.row.ps}${q0.col ? `, ${q0.col} = ${q0.row.ts}` : ""} WHERE id = ${q0.row.id}`);
  }
  await write(`UPDATE payment_items SET asum = ${mixed.asum}, ${openCols.map((S) => `${S} = ${mixed[S]}, ${ACC[S]} = ${mixed[ACC[S]] === null ? "NULL" : mixed[ACC[S]]}`).join(", ")} WHERE id = ${mixed.id}`);
  const [r2] = await ro(`SELECT asum::text AS asum FROM payment_items WHERE id = ${mixed.id}`);
  t.check("stub tiklandi: asum", r2.asum === mixed.asum);

  const [full] = await ro(`SELECT id::text AS id FROM payment_items WHERE state = 1 AND (${BLOCKED}) AND NOT (${OPEN}) ORDER BY id DESC LIMIT 1`);
  if (full) {
    const stD2 = await post(full.id, A, detachId);
    const auditDF = await db.auditLog.findFirst({ where: { action: { in: ["DETACH_CHANNELS", "DETACH_CHANNELS_FAILED"] } }, orderBy: { createdAt: "desc" } });
    t.check("faqat to'siqli qism: ajratish rad etildi", auditDF?.action === "DETACH_CHANNELS_FAILED" && auditDF?.details?.qism === full.id, `HTTP ${stD2}`);
  }
}
