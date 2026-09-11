// Ilova production'da reverse-proxy ortida `davijara.uz/payments` sub-path ostida ishlaydi.
// Dev'da (`npm run dev`) — ildizda (bo'sh satr).
//
// `next/link`, `redirect()`, Server Action `<form action={fn}>` larni Next.js O'ZI
// basePath bilan prefikslaydi — ularga TEGMANG. Bu yordamchi FAQAT qo'lda
// yoziladigan mutlaq yo'llar uchun:
//   - plain `<a href="/...">` (Excel yuklab olish havolasi)
//   - plain `<img src="/...">` (public/ dagi logotiplar)
//   - `signIn()/signOut()` ning `redirectTo` qiymati
//   - `middleware.ts` dagi login redirect va cookie nomlari (`auth.config.ts`)
//
// ⚠️ `next.config.mjs` dagi `basePath` AYNAN shu ifodaga tayanadi — birini
//    o'zgartirsangiz ikkinchisini ham.
export const BASE_PATH = process.env.NODE_ENV === "production" ? "/payments" : "";

/** Mutlaq ichki yo'lga (`/...`) basePath prefiksini qo'shadi. Tashqi URL'lar o'zgarmaydi. */
export function withBase(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}
