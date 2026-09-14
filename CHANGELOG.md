# Changelog

Faqat kod ichida — ilova UI'sida ko'rsatilmaydi. `package.json`dagi `version` git'ga
push qilinganda oshiriladi. Shu paytgacha to'plangan o'zgarishlar "Chiqarilmagan"da.

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
