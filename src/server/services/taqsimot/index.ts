/**
 * TAQSIMOT — `paydocs` → qismlar → `uzasbo_send`. Bo'limning BARCHA SQL'i shu papkada:
 *   hujjat.ts       bitta hujjat pulining yo'li (qismlar, 12 kanal, topshiriqnomalar)
 *   muammoli.ts     taqsimlanmagan / qisman / ortiqcha taqsimlangan hujjatlar
 *   takroriy.ts     ikki marta to'langan ulushlar (faqat balansda saqlovchi)
 *   biriktirish.ts  "biriktirish borishi" zinasi va hudud hujjatlari
 *   shared.ts       umumiy yordamchilar va ogohlantirishlar
 * Sahifalar shu yerdan import qiladi (`@/server/services/taqsimot`).
 */
export * from "./hujjat";
export * from "./muammoli";
export * from "./takroriy";
export * from "./biriktirish";
