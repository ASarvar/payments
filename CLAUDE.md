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
| **`project`** | to'lovlar (`payment_items`, `lists`, `vw_all_contracts`) — BOSHQA tizimniki | `PROJECT_DATABASE_URL`, `lib/projectDb.ts` | **HECH QACHON** |

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
- ⚠️ QQS standart boshlanishi `2025-05-14` — foydalanuvchi SQL'idagi `doc_date > '2025-05-13'`
  bilan aynan bir xil. Standart FILTR, qoida emas. `dan` uch holatli (`lib/filters.ts`):
  yo'q → standart, bo'sh → filtr yo'q, sana → o'sha. Standart boshqa kanalga olib o'tilmaydi.
- ⚠️ `created_at`/`updated_at` — `timestamp WITHOUT time zone` (mahalliy vaqt). Prisma ularni UTC
  deb o'qiydi — xizmat ISO satr qiladi, UI `dmy()` bilan faqat tartibni almashtiradi.
  `timeZone: "Asia/Tashkent"` bilan formatlash +5 soat qo'shib yuborardi.

## Arxitektura

```
lib/projectDb.ts            readOnly() — project'ga YAGONA kirish
lib/channels.ts             12 kanal (ustun nomlari — whitelist) + holatlar
lib/filters.ts              URL ↔ filtr (dan/gacha/hudud/tuman), href()
server/services/payments.ts BARCHA SQL: matritsa, hudud/tuman kesimi, qarz yoshi,
                            shartnoma muammolari, ro'yxat, eksport bo'laklari
app/dashboard/              umumiy · kanal/[key] · royxat · users · audit
app/api/export/route.ts     Excel (oqim), ro'yxat bilan bir xil Selection
```

- ⚠️ Ustun nomlari SQL'ga faqat `CHANNELS` dan (`Prisma.raw`); qiymatlar doim parametr.
- ⚠️ Jadvaldagi son = ro'yxatdagi son: havolalar `filterParams()` dan (dan HAR DOIM beriladi).
- Kesh: `unstable_cache`, tag `payments`, `CACHE_SECONDS` (5 daq). "Yangilash" tugmasi tag'ni tashlaydi.
- Eksport: `EXPORT_MAX_ROWS` (300 000), kalit bo'yicha (`pi.id >`) bo'laklar, har eksport auditda.
- ⚠️ Matn SERVERDA formatlanadi (`lib/format.ts`) — client'da `toLocaleString` gidratsiyani buzadi.

## Kirish

Login + parol (email yo'q), ochiq ro'yxat yo'q. Rollar: `SUPER_ADMIN` (foydalanuvchilar,
audit), `ADMIN`, `MODERATOR` — hudud moderatori (foydalanuvchi qarori, 2026-09-14): FAQAT
"To'lovlar ro'yxati" va FAQAT o'z hududi (`User.regionId`, bitta), Excel ham shu hudud bilan.
⚠️ Himoya `lib/authz.ts` da: sahifalarda `requireAdminPage()`, ro'yxat VA eksportda
`scopeFilters()`. Yangi sahifa/route qo'shsangiz — moderatorni o'ylang (menyuda yashirish
himoya emas). Rol va hudud har so'rovda bazadan o'qiladi. Sessiya JWT, **1 soat faolsizlik** (sirpanuvchi). Parol tiklansa
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
