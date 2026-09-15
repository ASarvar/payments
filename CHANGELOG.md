# Changelog

Faqat kod ichida — ilova UI'sida ko'rsatilmaydi. `package.json`dagi `version` git'ga
push qilinganda oshiriladi. Shu paytgacha to'plangan o'zgarishlar "Chiqarilmagan"da.

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
