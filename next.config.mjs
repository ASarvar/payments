// ⚠️ src/lib/basePath.ts dagi BASE_PATH bilan AYNAN bir xil ifoda — birini
//    o'zgartirsangiz ikkinchisini ham. `next build` NODE_ENV=production qiladi,
//    shuning uchun prod image avtomatik `/payments` ostida quriladi; `next dev` — ildizda.
const basePath = process.env.NODE_ENV === "production" ? "/payments" : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // davijara.uz/payments sub-path. Bo'sh bo'lsa (dev) — umuman qo'llanmaydi.
  basePath: basePath || undefined,
  // Docker uchun: build natijasi .next/standalone ichiga minimal server sifatida yig'iladi.
  output: "standalone",
};

export default nextConfig;
