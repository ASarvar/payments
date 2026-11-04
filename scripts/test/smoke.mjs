import { cookieFor, get, isRedirTo, norm, ro, unesc } from "./_lib.mjs";

export const NAME = "Sahifalar va ruxsatlar";

export default async function run(t) {
  const SA = await cookieFor("test-smoke-super", "SUPER_ADMIN");
  const A = await cookieFor("test-smoke-admin", "ADMIN");
  const M = await cookieFor("test-smoke-mod", "MODERATOR", 26);
  const RM = await cookieFor("test-smoke-resp", "REPUBLIC_MODERATOR");

  const [doc] = await ro(`SELECT p.id::text AS id FROM paydocs p JOIN payment_items pi ON pi.pay_id = p.id
    WHERE p.state = 1 AND pi.state = 1 ORDER BY p.id LIMIT 1`);

  const adminPages = [
    "/dashboard",
    "/dashboard/kanal/vat",
    "/dashboard/royxat",
    "/dashboard/yonalishlar",
    `/dashboard/taqsimot?id=${doc.id}`,
    "/dashboard/taqsimot/muammoli",
    "/dashboard/taqsimot/takroriy",
    "/dashboard/taqsimot/biriktirish",
    "/dashboard/taqsimot/biriktirish/hudud?hudud=26",
    "/dashboard/taqsimot/biriktirish/hujjatlar?hudud=26",
    "/dashboard/shartnomalar",
  ];
  for (const p of adminPages) {
    const r = await get(p, A);
    const body = r.status === 200 ? unesc(await r.text()) : "";
    t.check(`A ${p}`, r.status === 200 && !body.includes("ma'lumot olishda xato"), String(r.status));
  }

  const apis = [
    "/api/export?kanal=vat&holat=otkazilmagan&hudud=26",
    `/api/taqsimot?id=${doc.id}`,
    "/api/taqsimot/biriktirish",
    "/api/taqsimot/biriktirish/hujjatlar?hudud=26",
    "/api/shartnomalar",
    "/api/yonalishlar",
  ];
  for (const p of apis) t.check(`A ${p}`, (await get(p, A)).status === 200);

  for (const p of ["/dashboard/users", "/dashboard/audit"]) {
    t.check(`SA ${p}`, (await get(p, SA)).status === 200);
    t.check(`A ${p} → topilmadi`, (await get(p, A)).status === 404);
  }

  for (const [who, C] of [["M", M], ["RM", RM]]) {
    for (const p of adminPages.filter((x) => !x.startsWith("/dashboard/royxat"))) {
      t.check(`${who} ${p} → ro'yxatga`, isRedirTo(await get(p, C), "/dashboard/royxat"));
    }
    t.check(`${who} /dashboard/royxat`, (await get("/dashboard/royxat", C)).status === 200);
    t.check(`${who} /api/export`, (await get("/api/export?kanal=vat&holat=otkazilmagan", C)).status === 200);
    for (const p of apis.filter((x) => !x.startsWith("/api/export"))) {
      t.check(`${who} ${p} → 403`, (await get(p, C)).status === 403);
    }
  }

  const mHtml = norm(unesc(await (await get("/dashboard/royxat?hudud=3", M)).text()));
  t.check("M boshqa hudud so'ralsa — o'z hududi", mHtml.includes("Toshkentsh."), "hudud=3 berilgan");

  const warm = process.env.WARM_TOKEN;
  if (warm) {
    const noToken = await get("/api/warm", "");
    t.check("warm: tokensiz → 403 (login'ga EMAS)", noToken.status === 403, String(noToken.status));
    t.check("warm: noto'g'ri token → 403", (await get("/api/warm?key=xxxxxxxxxxxxxxxxxxxxxxxxxxxx", "")).status === 403);
    const ok = await get(`/api/warm?key=${encodeURIComponent(warm)}`, "");
    const body = ok.status === 200 ? await ok.json() : null;
    t.check("warm: to'g'ri token → 200", ok.status === 200, String(ok.status));
    t.check("warm: barcha hisoblar isitildi", Boolean(body?.ok) && Object.keys(body.natija).length >= 5, body ? Object.keys(body.natija).join(",") : "");
  } else {
    t.check("warm: WARM_TOKEN sozlanmagan — o'tkazib yuborildi", true);
  }

  for (const p of ["/dashboard", "/dashboard/royxat"]) {
    t.check(`anonim ${p} → login`, isRedirTo(await get(p, ""), "/login"));
  }
  const anon = await get("/api/export?kanal=vat", "");
  t.check("anonim /api/export → rad", anon.status === 401 || isRedirTo(anon, "/login"), String(anon.status));
}
