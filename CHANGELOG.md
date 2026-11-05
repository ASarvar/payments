# Changelog

Faqat kod ichida — ilova UI'sida ko'rsatilmaydi. `package.json`dagi `version` git'ga
push qilinganda oshiriladi. Shu paytgacha to'plangan o'zgarishlar "Chiqarilmagan"da.

## 0.4.2 — 2026-11-05

- **UI matnlari qisqartirildi** (foydalanuvchi talabi): "Qanday ishlaydi" kartasi (pul biriktirish) va
  taqsimotdagi kirish matni olib tashlandi; "nomini bosing — …", "qatorni bosing — …" ko'rsatmalari,
  kesh izohlari va sarlavha osti tushuntirishlari o'chirildi; xato va ogohlantirish matnlari qisqardi;
  sarlavhalardagi "—" o'rnida ":" yoki vergul, sana oralig'ida "–". Excel hisobot sarlavhalari o'zgarmadi.
  HTTP testlaridagi 3 ta matn tekshiruvi yangilandi.

## 0.4.1 — 2026-11-05

- **Sahifalardagi tushuntirish matnlari olib tashlandi** (foydalanuvchi talabi): jadval ostidagi
  kulrang izoh paragraflari — nazorat paneli (pul yo'li ostida va dinamika), shartnomalar,
  yo'nalishlar, biriktirish borishi (respublika, hudud, hujjatlar), hujjat taqsimoti, takroriy
  ro'yxat; foydalanuvchilar va audit sarlavhasi ostidagi matn. Ogohlantirishlar, ID kiritish
  yo'riqnomasi va svetofor legendasi qoldi.

## 0.4.0 — 2026-11-05

- **Kod izohlardan tozalandi** (foydalanuvchi talabi): 80 ta kod faylidan 448 izoh va
  `globals.css` dan 2 izoh olib tashlandi. Faqat ishlashga ta'sir qiladiganlari qoldi
  (`eslint-disable`, `next-env.d.ts` direktivalari). Kod o'zgarmagan: har fayl TypeScript
  parseri bilan tozalanib, keyin token-token solishtirildi.
- **`KOD-ESLATMALARI.md`** — izohlardagi, boshqa hujjatlarda yo'q bo'lgan nozik joylar fayl
  bo'yicha saqlab qolindi (edge middleware va env, `session-expired` himoyasi, `FilterBar` da
  `action` yo'qligi, `rt 11` taxmini, dev stub'dagi ataylab qo'yilgan holatlar va boshqalar).
- Bundan keyin kodga izoh yozilmaydi — qoida `CLAUDE.md` da.

## 0.3.9 — 2026-11-05

- **"Pul biriktirish" serverda ishlamayotgani tuzatildi.** Bekor qilishda baza "ruxsat yo'q" deb
  rad etardi: `payment_items` dagi `trg_audit` triggeri o'zgarishni `audit_log` ga YOZUV ROLI
  nomidan yozadi, rolda esa unga huquq yo'q edi. DEPLOY.md §7 ga ikki GRANT qo'shildi
  (`audit_log` ga INSERT, `audit_log_id_seq` ga USAGE) va huquqlarni bir so'rovda tekshirish.
- Bekor qilish xatosida endi bazaning haqiqiy xabari ko'rsatiladi (avval umumiy matn edi, shu
  sababli sabab ko'rinmasdi).
- Kodda izoh yozilmaydi (foydalanuvchi talabi) — qoida `CLAUDE.md` ga kiritildi.

## 0.3.8 — 2026-11-04

- **Pul biriktirish** (yangi menyu, faqat adminlar). Biriktirish (to'lov qismi) ID si kiritiladi;
  ilova summasi noldan katta kanallarni va ularning topshiriqnomaga kiritilgan-kiritilmaganini
  ko'rsatadi. Hech biri kiritilmagan bo'lsa — **birikishni bekor qilish** tugmasi ochiladi va qism
  faol bo'lmay qoladi (`state = 0`), ya'ni hisobotlardan chiqadi. Aks holda tugma yopiq.
  ⚠️ Bu ilovaning birinchi va yagona yozuv amali: alohida ulanish va serverda faqat shu jadvalga
  huquqi bor rol kerak (DEPLOY.md §7); rol berilmasa sahifa faqat tekshiradi.
  Har urinish — muvaffaqiyatli ham, rad etilgani ham — auditda.

## 0.3.7 — 2026-11-04

- **"To'langan" va "Topshiriqnomada" ro'yxatlari tezlashdi.** Avval har so'rovda kanalning barcha
  to'langan qism raqamlari bazaga yuborilardi (QQS'da ~180 000 ta, ~2 MB). Endi teskarisi —
  kiritilgan, lekin to'lanmagan qismlar ro'yxati saqlanadi (QQS'da ~700 ta), natija o'zgarmaydi.
  Excel eksporti ham endi barcha qatorlarni xotiraga yig'masdan, bo'lak-bo'lak o'qiydi.
- **Avtomatik tekshiruvlar repo'ga qo'shildi** (`npm run test:http`, 6 to'plam ~110 tekshiruv):
  sahifalar va ruxsatlar matritsasi, to'langan/topshiriqnomada holatlari, nazorat paneli,
  yo'nalishlar svodi, taqsimot (hujjat, muammoli, takroriy, biriktirish zinasi) va shartnomalar.
  Har bir son bazadan mustaqil hisoblangani bilan solishtiriladi.
- **CI** (`.github/workflows/ci.yml`): har push'da `typecheck` va `next build`.
- **Kesh isitish** (`/api/warm`, `WARM_TOKEN` bilan): serverdagi cron og'ir hisoblarni oldindan
  bajaradi — nazorat panelini birinchi ochgan odam kutmaydi (DEPLOY.md §6).
- **Audit tozalash**: `docker compose --profile maintenance run --rm prune` eski yozuvlarni o'chiradi
  (`AUDIT_KEEP_DAYS`, standart 365 kun).
- **Xavfsizlik sarlavhalari** (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) va
  konteyner xotira chegarasi (1 GB) qo'shildi.
- Ichki tartib: `taqsimot.ts` to'rt bo'limga ajratildi (`taqsimot/` papkasi), `.claude/` git'dan
  chiqarildi. Ilova ishlashiga ta'siri yo'q.

## 0.3.6 — 2026-09-17

- **Yo'nalishlar bo'yicha svod** (yangi menyu, faqat adminlar). Pul qaysi oluvchiga ketishi kerakligi
  bo'yicha umumiy jadval: har yo'nalish uchun hisoblangan, to'langan va **chiqishi kerak** bo'lgan summa
  (tasdiqlanmagan + tasdiqlangan-kiritilmagan + topshiriqnomada alohida ustunlarda). Tagida yo'nalish ×
  hudud jadvali — qaysi hududda qaysi yo'nalish bo'yicha qancha pul chiqishi kerakligi. Excel — ikki
  varaq (auditda). Bazaga qo'shimcha yuk yo'q: hisob nazorat paneliniki bilan umumiy.

## 0.3.5 — 2026-09-16

- **Og'ir hisoblar 30 daqiqada bir marta** (Nazorat paneli, kanal sahifalari, to'langan qismlar): serverda
  bitta hisob ~16 soniya — boshqa tizim bazasiga yuk kamayadi. Eskirgan natija darhol ko'rsatiladi, yangisi
  fonda hisoblanadi; sahifada "hisoblangan" vaqti yoziladi; "Yangilash" tugmasi — darhol.
- **Biriktirish — hujjatlar ro'yxati:** qator bosilsa, ostida shu hujjatning kanallar bo'yicha taqsimoti
  ochiladi (ulush, tasdiqlangan, topshiriqnomaga kiritilgan, g'aznachilikda to'langan, to'lanmagan, oxirgi
  to'lov). Qayta bosilsa yopiladi; ID — to'liq taqsimot sahifasi.

## 0.3.4 — 2026-09-15

- **Nazorat paneli** — bosh sahifa ("Umumiy ko'rinish" o'rniga). Bir sahifada:
  - **pul yo'li** — 6 bosqich: tushum → biriktirildi → 12 kanalga taqsimlandi → tasdiqlandi →
    topshiriqnomaga kiritildi → g'aznachilik to'ladi. Har bosqichda summa, foiz va qancha turib
    qolgani; bosilsa o'sha ro'yxat ochiladi;
  - **diqqat kartalari** — tasdiqlanmasdan o'tkazilgan ulushlar, muammoli hujjatlar, ikki marta
    to'langanlar;
  - **hududlar svetofori** — biriktirilgan va to'langan ulushi, 30 kundan ortiq to'lanmagani; rangli,
    eng orqada qolgan hudud tepada;
  - **kunlik dinamika** — oxirgi 30 kun: tushum, biriktirilgan va g'aznachilik to'lagan summa;
    grafik va jadval;
  - **kanallar matritsasi**.
- **"O'tkazilgan" ikkiga bo'lindi**: **To'langan** (g'aznachilik ijro etgan) va **Topshiriqnomada**
  (kiritilgan, hali to'lanmagan). O'zgarish panel, kanal sahifalari, ro'yxatdagi holat filtri va
  Excel'dagi holat ustuniga taalluqli. "O'tkazilmagan" va "tasdiqlanmagan" ta'rifi o'zgarmadi.
- Serverda yangi huquq yoki migratsiya kerak emas.

## 0.3.3 — 2026-09-15

- **Shartnomalar bo'yicha** (yangi menyu, hozircha faqat adminlar). Mavjud tizimdagi "yilda
  hisoblangan ijara to'lovlari va penyalar" hisoboti: hududlar bo'yicha shartnomalar soni va
  summasi, hisoblangan (ijara, penya), to'langan (bir kunda va yil davomida), debitor va kreditor
  qarzdorlik. Hisob o'sha tizimniki bilan bir xil; yil tanlanadi. Excel shu shaklda (auditda).
- **Biriktirish — hujjatlar ro'yxatiga Excel** (filtrlar bilan, auditda).
- Serverda `payments_ro` ga yana ikki manbaga o'qish huquqi kerak (`vw_contracts`, `billing`).

## 0.3.2 — 2026-09-15

- **Biriktirish borishi — zina bo'yicha ochiladi** (eski tizimdagidek): respublika jadvalida hudud
  nomi → hudud sahifasi (hisobot davri, joriy oy, kecha, bugun); qator yoki raqam → shu oraliqdagi
  hujjatlar ro'yxati (sana, ID, to'lovchi, maqsadi, tushum, biriktirilmagan, biriktirilgan, turlar;
  "biriktirilishi" va "turi" filtrlari); hujjat ID si → hujjat taqsimoti.

## 0.3.1 — 2026-09-15

- **Biriktirish borishi** (Taqsimot ichida yangi yorliq). Mavjud tizimdagi "ijara to'lovlaridan
  tushgan mablag'lar biriktirilishining borishi" hisoboti: hududlar bo'yicha tushum, biriktirilgan,
  biriktirilmagan, "bir kunda" va 10 tur bo'yicha "shundan" (+ MUNIS orqali alohida ustun). Hisob
  o'sha tizimniki bilan bir xil (serverda solishtirildi); "bir kunda" tanlangan oxirgi sana
  bo'yicha. Excel shu shaklda (auditda). Serverda `payments_ro` ga yana ikki jadvalga o'qish
  huquqi kerak (DEPLOY.md).

## 0.3.0 — 2026-09-15

- **Taqsimot** (yangi bo'lim, hozircha faqat adminlar). To'lov hujjati (`paydocs`) ID si bo'yicha
  pulining yo'li: qaysi shartnomalarga biriktirilgani, 12 kanalga bo'linishi va har bir ulush
  g'aznachilikka topshiriqnoma bilan yuborilib, **haqiqatan to'langan**-to'lanmagani (rad etish
  sababi, g'aznachilik sanasi bilan). Hujjat summasi va qismlar yig'indisi solishtiriladi.
  Qo'shimcha: **muammoli hujjatlar** (taqsimlanmagan, qisman, ortiqcha taqsimlangan) va **ikki marta
  to'langan** balansda saqlovchi ulushlari ro'yxati; hujjat taqsimoti Excel'ga (auditda). "To'lovlar ro'yxati"dagi
  to'lov raqami endi Taqsimot sahifasini ochadi. Serverda `payments_ro` ga ikki jadvalga o'qish
  huquqi kerak (DEPLOY.md).

## 0.2.2 — 2026-09-15

- **Respublika moderatori.** Yangi rol: hudud moderatori singari faqat "To'lovlar ro'yxati" va
  Excel'ni ko'radi, lekin barcha hududlar bo'yicha (hudud tanlay oladi). Bazada migratsiya bor
  (`Role` ga `REPUBLIC_MODERATOR`).

- **Kod tekshiruvi tuzatishlari.** Moderator endi STANDART bo'yicha faqat ro'yxatga kiradi —
  yangi sahifa o'z-o'zidan unga yopiq; "Yangilash" tugmasini sahifa emas, foydalanuvchi roli
  hal qiladi. Foydalanuvchilar: `project` bazasi ishlamasa ham moderatorni bloklash/saqlash
  mumkin (hudud o'zgarmagan bo'lsa); saqlanmagan rol xatodan keyin qatorda qolib ketmaydi;
  yangi foydalanuvchi qo'shishda xato bo'lsa kiritilgan maydonlar (paroldan tashqari) saqlanadi.
  Rol nomlari bitta joyda (`lib/roles.ts`).

## 0.2.1 — 2026-09-14

- **Standart sana — 13.05.2025.** Sana berilmaganda barcha kanal va sahifalarda (umumiy
  ko'rinish, kanallar, ro'yxat, Excel) 13.05.2025 dan — shu kunning o'zi bilan — boshlanadi.
  Avval faqat QQS uchun 14.05.2025 edi. Sanani o'zgartirish yoki tozalash mumkin.

## 0.2.0 — 2026-09-14

- **Hudud moderatorlari.** Yangi rol: super admin foydalanuvchini bitta hududga biriktiradi;
  moderator faqat "To'lovlar ro'yxati"ni va faqat o'z hududini ko'radi (Excel ham shu hudud
  bilan, har yuklash auditda). Boshqa bo'limlar unga yopiq. Bazada migratsiya bor
  (`Role` ga `MODERATOR`, `User.regionId`).
- **Tuzatildi:** filtrdagi "Tozalash" production'da `/payments` siz manzilga o'tib 404 berardi.

## 0.1.1 — 2026-09-11

- **Deploy tuzatildi.** `package-lock.json` Linux'da qayta yaratildi — Windows'dagi lock
  bilan Docker'da `npm ci` yiqilardi (`picomatch` 2/4 joylashuvi). Paket versiyalari
  o'zgarmagan.

## 0.1.0 — 2026-09-11

- **Birinchi versiya.** 12 kanal bo'yicha to'lov taqsimoti: umumiy matritsa, kanal
  sahifasi (hududlar/tumanlar kesimi, o'tkazilmagan summaning yoshi, anomaliyalar),
  to'lovlar ro'yxati va Excel eksport (foydalanuvchi SQL'i shaklida, JAMI qatori
  birinchi). `project` bazasi faqat o'qiladi. Foydalanuvchilar, audit, 1 soatlik sessiya.
