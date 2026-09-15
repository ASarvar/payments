# To'lovlar monitoringi (`payments`)

Ijara to'lovlarining **taqsimoti va o'tkazilishi** monitoringi. Ichki ilova, faqat
administratorlar va hudud moderatorlari uchun. Interfeys **o'zbek tilida**. Obyektlar monitoringidan
(`davlat-mulki-dashboard`) ALOHIDA loyiha (foydalanuvchi qarori, 2026-09-11) — lekin
stack, uslub va deploy tartibi o'sha loyihadan olingan.

## Stack

Next.js 15 (App Router) · TypeScript strict · Prisma · Auth.js v5 (JWT) · Tailwind 3 · exceljs.
Navbat/worker YO'Q — hamma narsa so'rov paytida, keshlangan.

**Ikki baza — aralashtirmang:**

| | Nima | Ulanish | Yozish |
|---|---|---|---|
| **o'zimizniki** | foydalanuvchilar, audit (`prisma/schema.prisma`) | `DATABASE_URL`, `prisma` | ha (Prisma modellari) |
| **`project`** | to'lovlar (`payment_items`, `lists`, `vw_all_contracts`, `paydocs`, `uzasbo_send`) — BOSHQA tizimniki | `PROJECT_DATABASE_URL`, `lib/projectDb.ts` | **HECH QACHON** |

⚠️ `project` ga har so'rov `readOnly()` orqali: `SET TRANSACTION READ ONLY` +
`statement_timeout`. Jadvalda audit triggeri bor va `project` roli yoza oladi — kafolat
kod intizomida emas, Postgres'da. Yangi so'rov yozsangiz — faqat `readOnly()` ichida.
⚠️ `project` jadvallarini `schema.prisma` ga QO'SHMANG — migratsiyasini biz boshqarmaymiz.

## Buyruqlar

```bash
npm run dev          # 3001-port (3000 — obyektlar monitoringi)
npm run typecheck
npm run build        # push'dan oldin SHART (tsc yetarli emas — obyektlar 1.14.0 saboq)
npm run db:seed      # birinchi super admin (SEED_ADMIN_*)
npm run dev:setup    # dev: lokal bazalar + .env (DEV_PG_URL bilan)
npm run dev:stub     # dev: `project` ning soxta nusxasi (faqat "*stub*" nomli bazaga)
```

Dev'da haqiqiy `project` ga ulanib bo'lmaydi (server ichki tarmoqda) — `dev:stub`
serverdagi AYNAN ustun nomlari va tiplari bilan soxta ma'lumot yaratadi. Sxema o'zgarsa,
avval serverda `\d payment_items` bilan tekshiring, keyin stub'ni yangilang.

⚠️ `package-lock.json` LINUX'da yaratilishi shart (Windows lock Docker'da `npm ci` da yiqiladi):
`docker run --rm -v "$PWD":/w -w /w node:22-bookworm-slim npm install --package-lock-only`

## To'lov ma'lumoti — `project.payment_items` (jonli sxema, 2026-09-11)

689 456 yozuv (2023-08 dan). Har yozuv — to'lovning shartnomaga biriktirilgan qismi (`asum`),
u **12 ta oluvchiga** taqsimlanadi. Kanallar — `lib/channels.ts` (yagona joy):
`vat` (QQS), `mahalliy`, `owner` (balansda saqlovchi), `center`, `madaniy`, `sport`,
`defence`, `eco`, `medicine`, `penya`, `jarima`, `mail`. Har birida `*_sum`, `*_accept`,
`sent_*`.

- ⚠️ Mudofaa: summa `defense_sum`, belgilar `defence_accept`/`sent_defence` — sxemaning o'zida.
- ⚠️ `vat_accept` da DEFAULT yo'q (NULL ko'p — 164 062 faol yozuv), qolgan `*_accept` — DEFAULT false.
- ⚠️ Faqat `state = 1` (foydalanuvchi qarori). `state = 0` — 176 996 ta, ~487 mlrd.
- Hudud: `lists.type_id = 1` (`26` = Toshkent sh., `0` = Respublika), tuman: `type_id = 2`.
  Rasmiy tartib — `lib/regions.ts`.

### Holatlar (bitta kanal ichida KESISHMAYDI)

```
jami           = S > 0
o'tkazilgan    = S > 0 AND sent IS TRUE
o'tkazilmagan  = S > 0 AND accept IS TRUE AND sent IS NOT TRUE     ← asosiy savol
tasdiqlanmagan = S > 0 AND accept IS NOT TRUE AND sent IS NOT TRUE
anomaliya      = S > 0 AND sent IS TRUE AND accept IS NOT TRUE     (o'tkazilgan ichida)
```

jami = o'tkazilgan + o'tkazilmagan + tasdiqlanmagan. ⚠️ `sent = false` va `NULL` orasida
farq YO'Q (foydalanuvchi qarori) — `IS NOT TRUE`, `= false` emas.

### Shartnoma — `EXISTS`, JOIN EMAS

Faol shartnoma: `c.id = pi.contract_id AND c.state = 1 AND c.doc_status = 3` (foydalanuvchi
SQL'idagi shart). ⚠️ `vw_all_contracts` — ko'rinish; bitta id bir necha marta bo'lsa JOIN
qatorlarni ko'paytirib SUMMANI oshirardi. Filtrlar `EXISTS`/`NOT EXISTS`, ko'rsatish uchun
`LEFT JOIN LATERAL … LIMIT 1` (faqat sahifadagi qatorlar uchun). Dev stub'da dublikatlar
ataylab bor.

### Sana va vaqt

- Filtr — `doc_date` (to'lov sanasi), ikkala chegara QO'SHIB.
- ⚠️ Standart boshlanish `2025-05-13` (QO'SHIB) — BARCHA kanal va sahifalarda (foydalanuvchi
  qarori, 2026-09-14). Foydalanuvchi QQS SQL'idagi `doc_date > '2025-05-13'` dan 13-may kuni
  bilan farq qiladi — ataylab. Standart FILTR, qoida emas. `dan` uch holatli (`lib/filters.ts`):
  yo'q → standart, bo'sh → filtr yo'q, sana → o'sha.
- ⚠️ `created_at`/`updated_at` — `timestamp WITHOUT time zone` (mahalliy vaqt). Prisma ularni UTC
  deb o'qiydi — xizmat ISO satr qiladi, UI `dmy()` bilan faqat tartibni almashtiradi.
  `timeZone: "Asia/Tashkent"` bilan formatlash +5 soat qo'shib yuborardi.

## Taqsimot — `paydocs` → qismlar → `uzasbo_send` (jonli sxema, 2026-09-15)

Bitta to'lov hujjati pulining yo'li. Hozircha FAQAT adminlar (foydalanuvchi qarori, 2026-09-15).

- `paydocs` — bankdan kelgan to'lov hujjati (827 262). Faol kirim `state = 1` (426 013, `Поступление`),
  `state = 0` — chiqim/qaytarish. `payment_items.pay_id = paydocs.id` — ⚠️ FK YO'Q, `pay_id` da indeks YO'Q
  (qismlar seq scan — natija keshlanadi; muammoli ro'yxat — bitta hash-agregat, hujjat boshiga LATERAL EMAS).
- `uzasbo_send` — g'aznachilikka topshiriqnoma (309 640): bitta oluvchi (`receiver_type` → `Channel.rt`),
  bir davr, KO'P qism — `payment_items_id` vergulli MATN. ⚠️ Qidiruv faqat GIN indeks ifodasi bilan
  (`ITEMS_ARR`, `String.raw` bilan — `\s` yo'qolmasin). ⚠️ `status` — ENUM: xom so'rovda `::text` SHART.
- ⚠️ TO'LANGAN = `status = 'SENT' AND uzasbo_status = 4` (`lib/uzasbo.ts`). `sent_*` — topshiriqnomaga
  KIRITILGAN belgisi (CREATED'da ham true), to'langan emas. Ilovadagi "O'tkazilgan" hozircha `sent_*` ga
  tayanadi — ikkiga bo'lish taklif qilingan, qaror yo'q.
- ⚠️ `payment_items_id` HAR DOIM "to'langan qismlar" EMAS: birlashtirilgan turlarda ro'yxat ko'pincha DAVR
  BOSHIDAN TO'PLANADI (`date_from` qotib, `date_to` o'sadi; summa — faqat yangi qismlar). Bitta QQS qismi 531
  ta to'langan topshiriqnomada uchraydi. Shuning uchun (qism, kanal) ning ASOSIY topshiriqnomasi — birinchi
  to'langani, qolganlari "takroriy ro'yxat" (summaga kirmaydi). Faqat balansda saqlovchi (rt 4) — bitta
  topshiriqnoma = bitta qism, summa 100% mos.
- Muammoli hujjatlar: taqsimlanmagan (faol qismi yo'q) / qisman / ortiqcha — hujjat `asum` va faol
  qismlar `asum` yig'indisi. Ikki marta to'langan — FAQAT rt 4 (serverda 58 ta), kesh 1 soat.
- `recreated` — yangi topshiriqnomada, RAD ETILGAN eskisining id si. G'aznachilik sanasi rad
  etilganlarda ham bor — "oxirgi to'lov" faqat to'langanlardan. 12 kanal yig'indisi = `asum` (~98%).
- `payment_items.doc_id` — `pay_id` EMAS (birortasi ham mos emas).
- **Biriktirish borishi** (hududlar kesimi) — mavjud tizim hisobotining AYNAN o'sha ta'rifi (foydalanuvchi
  SQL'i): tushum = `paydocs`, biriktirilgan = `payments.parsing_sum` + `munis_receive_payment.real_sum`
  (status > NEW, `created_at` bo'yicha), "shundan" = `payments.*_sum` (MUNIS qismi alohida ustun).
  Ataylab farqi: "bir kunda" = `gacha` kuni (aslida MUNIS `current_date`) va tushum = biriktirilgan +
  biriktirilmagan. `payments` da tuman YO'Q. `pay_type` 1..10 (`payment_items`, `munis`) — xuddi shu
  10 tur tartibida. `munis_receive_payment.status` — ENUM (NEW < UPDATED < DISTRIBUTED).
  Zina (eski tizimdagidek): respublika → hudud (hisobot davri / joriy oy / kecha / bugun — `gacha` ga
  nisbatan, qatorlar kesishadi, JAMI yo'q; `getBiriktirish(…, obl)`) → hujjatlar (`paydocs` + `payments`
  va MUNIS `pay_id` orqali — hudud jadvali bilan faqat bog'lanish to'liq bo'lsa teng) → hujjat taqsimoti.
- `payments_ro` ga `paydocs`, `uzasbo_send`, `payments`, `munis_receive_payment` uchun ham `GRANT SELECT`
  kerak (DEPLOY.md).

## Shartnomalar bo'yicha (2026-09-15)

Mavjud tizimdagi "yilda hisoblangan ijara to'lovlari va penyalar" — AYNAN o'sha ta'rif (foydalanuvchi
SQL'i, `server/services/shartnomalar.ts`). Hozircha faqat adminlar.
- shartnomalar va qarzdorlik — `vw_contracts` (⚠️ `vw_all_contracts` EMAS): state = 1, doc_status = 3,
  doc_year = yil, type IN (1, 2); debitor = |saldo| (saldo < 0; ijara/penya — |rent|, |penya|), kreditor = saldo > 0.
- hisoblandi — `billing` (state = 1, ayear = yil): ijara = `credit_sum`, penya = `penya`.
- to'landi — `payment_items` (ayear = yil, pay_type 1 = ijara, 2 = penya); "bir kunda" — BUGUN (asl kabi).
- ⚠️ `vw_contracts.doc_year` va `billing.ayear` tipi tasdiqlanmagan — `::text` bilan solishtiriladi.
- `payments_ro` ga `vw_contracts` va `billing` uchun `GRANT SELECT` kerak (DEPLOY.md).

## Arxitektura

```
lib/projectDb.ts            readOnly() — project'ga YAGONA kirish
lib/channels.ts             12 kanal (ustun nomlari — whitelist, `rt` — topshiriqnoma turi) + holatlar
lib/uzasbo.ts               g'aznachilik holatlari (to'langan = SENT + 4), holat ranglari
lib/filters.ts              URL ↔ filtr (dan/gacha/hudud/tuman), href()
server/services/payments.ts BARCHA SQL (to'lovlar): matritsa, hudud/tuman kesimi, qarz yoshi,
                            shartnoma muammolari, ro'yxat, eksport bo'laklari
server/services/taqsimot.ts BARCHA SQL (taqsimot): hujjat, biriktirish borishi, muammoli hujjatlar,
                            ikki marta to'langan
app/dashboard/              umumiy · kanal/[key] · royxat · taqsimot (hujjat/biriktirish/muammoli/takroriy)
                            · users · audit
server/services/shartnomalar.ts  BARCHA SQL (shartnomalar bo'yicha): hisoblangan/to'langan/qarzdorlik
app/api/export/route.ts     Excel (oqim), ro'yxat bilan bir xil Selection
app/api/taqsimot/…          Excel: bitta hujjat taqsimoti (4 varaq) · biriktirish borishi · hujjatlar
app/api/shartnomalar        Excel: shartnomalar bo'yicha
```

- ⚠️ Ustun nomlari SQL'ga faqat `CHANNELS` dan (`Prisma.raw`); qiymatlar doim parametr.
- ⚠️ Jadvaldagi son = ro'yxatdagi son: havolalar `filterParams()` dan (dan HAR DOIM beriladi).
- Kesh: `unstable_cache`, tag `payments`, `CACHE_SECONDS` (5 daq). "Yangilash" tugmasi tag'ni tashlaydi.
- Eksport: `EXPORT_MAX_ROWS` (300 000), kalit bo'yicha (`pi.id >`) bo'laklar, har eksport auditda.
- ⚠️ Matn SERVERDA formatlanadi (`lib/format.ts`) — client'da `toLocaleString` gidratsiyani buzadi.

## Kirish

Login + parol (email yo'q), ochiq ro'yxat yo'q. Rollar: `SUPER_ADMIN` (foydalanuvchilar,
audit), `ADMIN`, `MODERATOR` — hudud moderatori (foydalanuvchi qarori, 2026-09-14): FAQAT
"To'lovlar ro'yxati" va FAQAT o'z hududi (`User.regionId`, bitta), Excel ham shu hudud bilan;
`REPUBLIC_MODERATOR` — respublika moderatori (2026-09-15): xuddi shunday faqat ro'yxat va Excel,
lekin BARCHA hududlar (hudud biriktirilmaydi). `isModerator()` — ikkala tur (sahifa, menyu,
"Yangilash"), `isRegionModerator()` — faqat hudud cheklovi (`scopeFilters`, qat'iy hudud maydoni).
⚠️ Himoya `lib/authz.ts` da: `requireUserOrRedirect()` moderatorni STANDART bo'yicha ro'yxatga
yuboradi (ochiq joylar `{ moderator: true }` bilan: dashboard layout va ro'yxat — layout'da SHART,
aks holda cheksiz redirect), ro'yxat VA eksportda `scopeFilters()`. Yangi API route qo'shsangiz —
moderatorni o'ylang: `getCurrentUser()` uni o'tkazadi (menyuda yashirish himoya emas). Rol va hudud har so'rovda bazadan o'qiladi. Sessiya JWT, **1 soat faolsizlik** (sirpanuvchi). Parol tiklansa
`sessionVersion` +1 → barcha sessiyalar bekor. Login'ga 15 daqiqada 10 ta xato urinish.
⚠️ Cookie nomlari HAR DOIM `payments.*` — dev'da ham: localhost'da obyektlar ilovasi bor,
cookie portga bog'lanmaydi.

Sub-path: production'da `basePath = "/payments"` (`next.config.mjs` + `lib/basePath.ts` —
ikkalasi birga). Qo'lda `withBase()`: plain `<a href>`, `<img src>`, `signIn/signOut`
`redirectTo`. Auth.js basePath (`/api/auth`) — TEGILMAYDI.

## Ishlash tartibi

- Commit/push faqat foydalanuvchi aytganda. Versiya (`package.json`) va `CHANGELOG.md` — push paytida.
- `next build` ni `next dev` ishlab turganda shu papkada ishlatmang (`.next` buziladi).
- Izohlar va UI — o'zbek tilida.
