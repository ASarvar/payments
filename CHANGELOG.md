# Changelog

Faqat kod ichida — ilova UI'sida ko'rsatilmaydi. `package.json`dagi `version` git'ga
push qilinganda oshiriladi. Shu paytgacha to'plangan o'zgarishlar "Chiqarilmagan"da.

## 0.1.1 — 2026-09-11

- **Deploy tuzatildi.** `package-lock.json` Linux'da qayta yaratildi — Windows'dagi lock
  bilan Docker'da `npm ci` yiqilardi (`picomatch` 2/4 joylashuvi). Paket versiyalari
  o'zgarmagan.

## 0.1.0 — 2026-09-11

- **Birinchi versiya.** 12 kanal bo'yicha to'lov taqsimoti: umumiy matritsa, kanal
  sahifasi (hududlar/tumanlar kesimi, o'tkazilmagan summaning yoshi, anomaliyalar),
  to'lovlar ro'yxati va Excel eksport (foydalanuvchi SQL'i shaklida, JAMI qatori
  birinchi). `project` bazasi faqat o'qiladi. Foydalanuvchilar, audit, 1 soatlik sessiya.
