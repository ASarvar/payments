// Barcha HTTP tekshiruvlarini ketma-ket bajaradi. Bitta xato bo'lsa ham chiqish kodi 1.
//
//   npm run dev        (3001-port, boshqa oynada)
//   npm run test:http
import { BASE, cleanup, disconnect, get, suite } from "./_lib.mjs";

const SUITES = ["./smoke.mjs", "./paid-holat.mjs", "./nazorat.mjs", "./yonalishlar.mjs", "./taqsimot.mjs", "./shartnomalar.mjs", "./pul-biriktirish.mjs"];

const t0 = Date.now();
try {
  await get("/login");
} catch {
  console.error(`Dev server javob bermadi (${BASE}). Avval \`npm run dev\` ni ishga tushiring.`);
  process.exit(2);
}

let failed = 0;
for (const path of SUITES) {
  const mod = await import(path);
  const t = suite(mod.NAME ?? path);
  const started = Date.now();
  try {
    await mod.default(t);
  } catch (e) {
    t.error(e);
  }
  failed += t.failed;
  console.log(`\n── ${t.name} (${Date.now() - started} ms) ──`);
  console.log(t.lines.join("\n"));
}

await cleanup("test-");
await disconnect();
const total = SUITES.length;
console.log(`\n${failed === 0 ? "HAMMASI O'TDI" : `${failed} TA XATO`} · ${total} to'plam · ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(failed === 0 ? 0 : 1);
