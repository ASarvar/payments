// ⚠️ src/lib/basePath.ts dagi BASE_PATH bilan AYNAN bir xil ifoda — birini
//    o'zgartirsangiz ikkinchisini ham. `next build` NODE_ENV=production qiladi,
//    shuning uchun prod image avtomatik `/payments` ostida quriladi; `next dev` — ildizda.
const basePath = process.env.NODE_ENV === "production" ? "/payments" : "";

/**
 * Xavfsizlik sarlavhalari. Ichki ilova, lekin himoya qatlami arzon.
 * ⚠️ `unsafe-inline` SHART: Next.js sahifa holatini inline <script> bilan uzatadi va Tailwind
 *    o'zgaruvchilari inline <style> da; nonce uchun middleware'da har so'rovga qayta yozish kerak
 *    bo'lardi. `unsafe-eval` — faqat dev (Next HMR).
 * ⚠️ HSTS bu yerda YO'Q — TLS nginx'da tugaydi, sarlavha ham o'sha yerda (DEPLOY.md §5).
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  reactStrictMode: true,
  // davijara.uz/payments sub-path. Bo'sh bo'lsa (dev) — umuman qo'llanmaydi.
  basePath: basePath || undefined,
  // Docker uchun: build natijasi .next/standalone ichiga minimal server sifatida yig'iladi.
  output: "standalone",
};

export default nextConfig;
