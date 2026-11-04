# Kod bo'yicha eslatmalar

Kodda izoh yozilmaydi (foydalanuvchi talabi, 2026-11-05). Shuning uchun nomidan ko'rinmaydigan,
lekin bilmasang xato qilinadigan narsalar shu yerda — fayl bo'yicha. Umumiy ma'lumot va
qarorlar `CLAUDE.md` da, server ishlari `DEPLOY.md` da.

## Kirish va sessiya

**`src/auth.config.ts`** — edge-safe (Prisma/bcrypt yo'q), middleware shuni yuklaydi; Credentials
provider `auth.ts` da qo'shiladi.
- Faolsizlik muddati (1 soat, sirpanuvchi) ENV orqali berilmaydi: edge middleware env'ni BUILD
  vaqtida inline qiladi, server env'i unga yetib bormaydi.
- Cookie nomlari qo'lda (`payments.*`), `__Secure-` prefiksisiz: edge bundle `NEXTAUTH_URL` ni
  build'da ko'rmaydi; `Secure`/`HttpOnly` baribir runtime'da qo'yiladi.
- `authorized` callback YO'Q — himoya va basePath'li login redirect `middleware.ts` da.
- JWT callback'da `as` kasti SHART: `next build` tipni tekshirganda token maydonlari `unknown`
  bo'lib qoladi (obyektlar ilovasining 1.14.0 Docker build'i aynan shunda yiqilgan).

**`src/auth.ts`** — login urinishlari hisobi XOTIRADA (bitta `web` jarayoni; qayta ishga tushsa
nolga qaytadi). Faqat XATO urinishlar sanaladi, muvaffaqiyatli kirish hisobni tozalaydi.

**`src/app/session-expired/route.ts`** — alohida route, chunki cookie'ni faqat route handler yoki
server action o'chira oladi (middleware bazaga kira olmaydi). ⚠️ Avval sessiya YAROQLILIGI
tekshiriladi: aks holda begona sahifa `<img src=".../session-expired">` bilan istalgan
foydalanuvchini tizimdan chiqarib yuborardi.

**`src/lib/authz.ts`**
- `requireUserOrRedirect()` — sahifalar uchun (redirect), `requireUser()` — server action'lar uchun
  (XATO tashlaydi: ular try/catch ichida chaqiradi, redirect u yerda yutilib ketardi).
- `requireSuperAdminPage()` — `notFound()`, `throw` emas: production'da xato matni o'chiriladi va
  foydalanuvchi tushunarsiz xato sahifasini ko'rardi.
- Rol va hudud JWT'dan emas, har so'rovda bazadan (`cache()` — bir so'rovda bitta o'qish).

**`src/app/dashboard/users/actions.ts`** — moderator hududida FK yo'q (hududlar `project` bazasida),
shuning uchun faqat YANGI id haqiqiy ro'yxat bo'yicha tekshiriladi; o'zgarmagan hudud
tekshirilmaydi, aks holda `project` ishlamay qolganda moderatorni bloklash ham mumkin bo'lmasdi.
Parol tiklanganda `sessionVersion` oshadi — o'sha odamning barcha sessiyalari bekor.

## UI va formalar

**`src/components/FilterBar.tsx`** — `action` ATAYLAB berilmagan: GET forma joriy URL'ga yuboradi va
production'dagi `/payments` sub-path'i saqlanadi. Bo'sh `dan=` ham yuboriladi — "sanani ataylab
tozaladim" degani (`lib/filters.ts` dagi uch holat).

**`src/app/dashboard/users/UsersClient.tsx`** — rol va hudud maydonlari NAZORATSIZ
(`defaultValue`): forma amalidan keyin React ularni boshlang'ich qiymatga qaytaradi, shunda
saqlanmagan rol ekranda qolib ketmaydi. Hudud tanlovi JS holatisiz, CSS `:has()` bilan ochiladi
(`globals.css` → `.role-fields`).

**`src/components/ClickableRow.tsx`** — `tr` fokus olmaydi, shuning uchun qatorda klaviatura uchun
alohida havola bo'lishi SHART (masalan ▸ belgisi).

**`src/components/KpiCard.tsx`** — `accent` 6 xonali hex bo'lishi shart (hover foni alfa qo'shib
quriladi). Kartadagi `href` filtri kartadagi son bilan aynan bir mezonda bo'lsin.

**`src/components/DayChart.tsx`**, **`src/lib/format.ts`** — faqat SERVER komponentda:
`toLocaleString("uz-UZ")` Node'da `1 167`, brauzerda `1,167` beradi va gidratsiya buziladi.
Client komponentga tayyor SATR uzatiladi.

**`src/app/dashboard/taqsimot/page.tsx`** — qism ID si kiritilganda `redirect()` try'dan TASHQARIDA
chaqiriladi: u xato tashlab ishlaydi, catch uni yutib yuborardi.

## basePath

**`src/lib/basePath.ts`** va **`next.config.mjs`** — ifoda ikkalasida AYNAN bir xil, birini
o'zgartirsang ikkinchisini ham. `next/link`, `redirect()`, server action `<form action={fn}>` —
Next o'zi prefikslaydi, tegilmaydi. Qo'lda `withBase()` kerak bo'ladigan joylar: plain `<a href>`
(Excel), plain `<img src>` (logotiplar), `signIn()/signOut()` ning `redirectTo`, `middleware.ts`
dagi login redirect.

## Baza va SQL

**`src/lib/env.ts`** — `project` ulanishi alohida kalitlar bilan ham berilishi mumkin
(`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`), shunda serverdagi mavjud blokni
o'zgartirmasdan nusxalash mumkin; `PROJECT_DATABASE_URL` berilgan bo'lsa — o'sha ustun. Login va
parol `encodeURIComponent` bilan qochiriladi (parolda `@` yoki `/` bo'lsa jimgina boshqa xostga
ulanardi).

**`src/lib/projectDb.ts`** — `query` log YO'Q: parametrlarda hisob raqami yoki STIR bo'lishi mumkin.
`SET TRANSACTION READ ONLY` tranzaksiyadagi BIRINCHI buyruq bo'lishi shart.

**`src/lib/channels.ts`** — `rt` qiymatlari jonli bazada oluvchi nomlari va summalar tengligi bilan
aniqlangan (2026-09-15). ⚠️ `rt 11` (Ekologiya) — TAXMIN: bazada bu turdagi topshiriqnoma hali yo'q.

**`src/lib/uzasbo.ts`** — to'langan = `SENT` + `uzasbo_status = 4` (javob "000-"). Boshqa kodlar
(1, 3, 5, 12 "BAD FILE", 42, 43 "K00-…") — jarayonda yoki xato; rasmiy ma'nosi tasdiqlanmagan,
shuning uchun UI'da kodning o'zi ko'rsatiladi.

**`src/lib/regions.ts`** — id'lar SOATO tartibida, rasmiy hisobot tartibi boshqacha; ro'yxatda yo'q
yangi id paydo bo'lsa oxiriga qo'shiladi (yo'qolmaydi). `0` — "Respublika", oxirida.

**`src/server/services/sqlUtil.ts`** — `timestamp WITHOUT time zone` ni Prisma UTC deb o'qiydi,
shuning uchun ISO satrning o'zi aynan bazadagi devor soati; qayta formatlash +5 soat qo'shardi.

**`src/server/services/payments.ts`** — `getContractIssues` eng og'ir so'rov (`vw_all_contracts` ga
murojaat): sahifa uni ALOHIDA kutadi, sekin yoki xato bo'lsa ham qolgan jadvallar ko'rinadi.
`metricSelect` ishlatilgan so'rovga `WITH ${paidCte(…)}` va `PAID_JOIN` SHART.

**`src/server/services/nazorat.ts`** — tushum va biriktirilgan faqat `lists` hududlari bo'yicha
(`obl_id > 0`, "Biriktirish borishi" kabi); to'langan esa hudud tanlanmasa BARCHA topshiriqnomalar
(respublika darajasidagilari ham).

**`src/server/services/taqsimot/hujjat.ts`** — topshiriqnomaning hujjatdagi o'rni: `asosiy` (kamida
bitta ulushni shu to'lagan yoki hozirgi jarayondagisi), `tarix` (rad etilgan / qayta yaratilgan),
`takror` (to'plangan ro'yxatda qismni qayta sanagan, summaga kirmaydi).

**`src/app/api/export/route.ts`** — Excel OQIM bilan yoziladi (300 000 qator xotiraga yig'ilmaydi);
tartib `pi.id` bo'yicha (SQL'dagi "biriktirish sanasi" bilan amalda bir xil, kalit bo'yicha o'qish
tez va barqaror); birinchi qator — JAMI.

## Dev va testlar

**`scripts/dev/stub-project.ts`** — faqat nomida "stub" bo'lgan bazaga yozadi (jadvallarni o'chirib
qayta yaratadi — adashib jonli `project` ga ulansa, boshqa tizimning to'lovlarini yo'q qilardi).
Ataylab qo'yilgan holatlar, UI ularni ko'rsatishi kerak:
- tasdiqlanmasdan o'tkazilgan ulushlar (anomaliya, ~1%);
- faol shartnomasi yo'q to'lovlar (`contract_id` 8001–8400);
- hisob raqami yoki MFO'si yo'q shartnomalar (~5%);
- `vw_all_contracts` da DUBLIKAT id'lar (summalar ko'paymasligini tekshirish uchun);
- `state = 0` yozuvlar (~10%), `sent_*` da `false` ham, `NULL` ham;
- taqsimot: qismsiz / qisman / ortiqcha taqsimlangan hujjatlar, rad etilgan va qayta yaratilgan,
  ikki marta to'langan topshiriqnomalar, belgisi bor-u topshiriqnomasiz ulushlar (~2%).

**`prisma/seed.ts`** — mavjud foydalanuvchining parolini O'ZGARTIRMAYDI (qayta ishga tushirish
xavfsiz); tiklash kerak bo'lsa `--reset-password` (barcha sessiyalari bekor bo'ladi).

**`scripts/test/_lib.mjs`** — kutilgan qiymat `project` (soxta baza) dan READ ONLY tranzaksiyada
qayta hisoblanadi; `norm()` HTML'ni solishtirishga tayyorlaydi (React izohlari va barcha
bo'shliqlar olib tashlanadi), `rowCells()` — sarlavhasi berilgan BIRINCHI jadval qatori kataklari
(katak [0] — qator nomi).
