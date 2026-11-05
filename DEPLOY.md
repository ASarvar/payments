# Serverga o'rnatish (Linux, Docker)

Ilova `davijara.uz/payments` ostida, obyektlar monitoringi bilan bitta serverda ishlaydi.
Baza konteyneri yo'q — ikkala baza ham host'dagi Postgres'da.

## 1. Kod

```bash
cd /mnt/hdd1
git clone <REPO_URL> payments
cd payments
```

## 2. Postgres (host) — bir marta

`sudo -u postgres psql` ichida. Parollarni `\password` bilan kiriting (shell tarixiga tushmaydi).

**O'z bazamiz** (foydalanuvchilar, audit):

```sql
CREATE ROLE payments LOGIN;
\password payments
CREATE DATABASE payments OWNER payments;
```

**`project` ga faqat o'qish uchun alohida rol** (tavsiya etiladi — ilova har so'rovni READ ONLY
tranzaksiyada bajaradi, lekin rolning o'zi ham yoza olmasa, bu ikkinchi himoya qatlami):

```sql
CREATE ROLE payments_ro LOGIN;
\password payments_ro
\c project
GRANT CONNECT ON DATABASE project TO payments_ro;
GRANT USAGE ON SCHEMA public TO payments_ro;
GRANT SELECT ON public.payment_items, public.lists, public.vw_all_contracts, public.paydocs, public.uzasbo_send,
                public.payments, public.munis_receive_payment, public.vw_contracts, public.billing TO payments_ro;
ALTER ROLE payments_ro SET default_transaction_read_only = on;
```

⚠️ `vw_all_contracts` — ko'rinish. Oddiy ko'rinishda uning ORTIDAGI jadvallarga huquq kerak
emas (egasining huquqi bilan ishlaydi). Agar u `security_invoker` bilan yaratilgan bo'lsa,
ortidagi jadvallarga ham `SELECT` berish kerak — tekshirish:
`SELECT reloptions FROM pg_class WHERE relname = 'vw_all_contracts';`

**Docker tarmog'idan ulanishga ruxsat** — `pg_hba.conf` ga (docker-compose.yml dagi qat'iy
diapazon):

```
host  payments  payments     172.30.77.0/24  scram-sha-256
host  project   payments_ro  172.30.77.0/24  scram-sha-256
```

```bash
sudo systemctl reload postgresql
```

`listen_addresses` obyektlar ilovasi uchun allaqachon sozlangan (docker ko'prigidan ulanish).

## 3. Sozlamalar

```bash
cp .env.production.example .env.production
nano .env.production
```

`NEXTAUTH_SECRET` uchun: `openssl rand -base64 32`. `DATABASE_URL` va `PROJECT_DATABASE_URL`
da xost — `host.docker.internal`, port — host Postgres'ining porti.

## 4. Ishga tushirish

```bash
docker compose up -d --build
docker compose --profile setup run --rm seed
docker compose logs -f web
```

Seed `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` dan birinchi super adminni yaratadi.
Qayta ishga tushirish xavfsiz (mavjud parolni o'zgartirmaydi). Parolni tiklash:
`docker compose --profile setup run --rm seed npx tsx prisma/seed.ts --reset-password`.

## 5. nginx

`deploy/nginx.example.conf` dagi `location ^~ /payments` blokini davijara.uz server
blokiga qo'shing:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Davriy ishlar (cron)

Ikkalasi ham ixtiyoriy, lekin tavsiya qilinadi. `crontab -e` (root):

```cron
# Nazorat paneli keshini fonda isitish — kesh 30 daqiqa, shuning uchun 25 daqiqada bir marta.
# Tokenni .env.production dagi WARM_TOKEN dan oling (buyruqda qo'lda yozmang — fayldan o'qiladi).
*/25 * * * * cd /mnt/hdd1/payments && curl -fsS -m 300 -H "X-Warm-Token: $(. ./.env.production; echo "$WARM_TOKEN")" http://127.0.0.1:3001/payments/api/warm > /dev/null

# Audit yozuvlarini tozalash (AUDIT_KEEP_DAYS, standart 365 kun) — oyning 1-kuni, 03:10 da.
10 3 1 * * cd /mnt/hdd1/payments && docker compose --profile maintenance run --rm prune >> /var/log/payments-prune.log 2>&1
```

⚠️ `WARM_TOKEN` `.env.production` da bo'lmasa, `/api/warm` umuman ishlamaydi (404) — isitish
shunchaki bajarilmaydi, ilova esa avvalgidek ishlayveradi. Tokenni yaratish: `openssl rand -base64 36`.
⚠️ Isitish og'ir hisoblarni oldindan bajaradi; birinchi foydalanuvchi kutmaydi. Qo'lda sinash:

```bash
curl -s -H "X-Warm-Token: <token>" http://127.0.0.1:3001/payments/api/warm
```

⚠️ Xavfsizlik sarlavhalari (CSP, X-Frame-Options va h.k.) ilovaning o'zidan keladi; HSTS esa
nginx'da (`Strict-Transport-Security`) — TLS o'sha yerda tugaydi.

## 7. "Pul biriktirish" — yozuv roli (ixtiyoriy)

Ilovaning yozuv amallari (faqat `payment_items`): biriktirishni bekor qilish (`state = 0`) va
ochiq kanallarni ajratish (topshiriqnomaga kiritilmagan `*_sum = 0`, `*_accept = false`, `asum` shu summaga kamayadi,
`state = 1` qoladi). Ikkalasida ham shu tranzaksiyada `payments.parsing_sum` va qism turiga mos ustun
(`pay_type` 1..10 → `rent_sum` … `other_sum`) o'sha summaga kamayadi. Boshqa hamma narsa avvalgidek faqat o'qiydi. Rol berilmasa — sahifa ishlaydi, lekin tugma o'chiq turadi.

⚠️ Alohida rol: huquq FAQAT bitta jadval va FAQAT ikki ustunga beriladi — kodda xato bo'lsa ham
boshqa narsani o'zgartirib bo'lmaydi.

```sql
\c project
CREATE ROLE payments_rw LOGIN;
\password payments_rw
GRANT CONNECT ON DATABASE project TO payments_rw;
GRANT USAGE ON SCHEMA public TO payments_rw;
GRANT SELECT ON public.payment_items TO payments_rw;
GRANT UPDATE (state, updated_at) ON public.payment_items TO payments_rw;
GRANT UPDATE (asum, vat_sum, mahalliy_sum, owner_sum, center_sum, madaniy_sum, sport_sum, defense_sum,
              eco_sum, medicine_sum, penya_sum, jarima_sum, mail_sum,
              vat_accept, mahalliy_accept, owner_accept, center_accept, madaniy_accept, sport_accept,
              defence_accept, eco_accept, medicine_accept, penya_accept, jarima_accept, mail_accept)
      ON public.payment_items TO payments_rw;
GRANT UPDATE (parsing_sum, no_parsing_sum) ON public.payment_items TO payments_rw;
GRANT SELECT ON public.payments TO payments_rw;
GRANT UPDATE (parsing_sum, rent_sum, penya_sum, tax_sum, mail_sum, fine_sum, advance_sum, unknown_sum,
              returned_sum, returned_sum2, other_sum, updated_at) ON public.payments TO payments_rw;
GRANT INSERT ON public.audit_log TO payments_rw;
GRANT USAGE ON SEQUENCE public.audit_log_id_seq TO payments_rw;
ALTER ROLE payments_rw SET statement_timeout = '60s';
```

⚠️ `audit_log` ga INSERT SHART: `payment_items` dagi `trg_audit` triggeri (SECURITY DEFINER EMAS)
har o'zgarishni `audit_log` ga yozadi va bu CHAQIRUVCHI rol nomidan bajariladi. Huquq bo'lmasa
yangilash butunlay rad etiladi ("permission denied for table audit_log"). Faqat INSERT beriladi —
rol auditni o'qiy ham, o'zgartira ham olmaydi; `changed_by` da `payments_rw` ko'rinadi.
⚠️ Ikkinchi trigger (`trg_check_payment_items_limit`) `payments` jadvalini faqat `NEW.state = 1`
yoki `doc_id` o'zgarganda o'qiydi. Bekor qilish (`state = 0`) uchun kerak emas, lekin ochiq kanallarni
ajratishda qism `state = 1` qoladi — trigger `payments` ni o'qiydi, shuning uchun `SELECT` SHART.
Trigger cheklovi ajratishni rad etsa, xato foydalanuvchiga ko'rsatiladi.

`pg_hba.conf` ga (§2 dagi qator yonida):

```
host  project   payments_rw  172.30.77.0/24  scram-sha-256
```

```bash
sudo systemctl reload postgresql
```

So'ng `.env.production` ga ulanishni qo'shing va konteynerni qayta ishga tushiring:

```
PROJECT_WRITE_DATABASE_URL="postgresql://payments_rw:PAROL@host.docker.internal:5432/project"
```

⚠️ Parolda `@` yoki `/` bo'lsa URL'da kodlangan bo'lishi shart.
⚠️ `payment_items` da `trg_audit` triggeri bor — o'zgarish o'sha tizimning auditiga ham tushadi;
bizning auditimizda esa kim va qaysi qismni bekor qilgani saqlanadi.
⚠️ Tekshirish: huquq FAQAT shu jadvalda ekanini ko'rish uchun
`psql "postgresql://payments_rw:...@127.0.0.1:5432/project" -c "UPDATE paydocs SET state = state;"`
RUXSAT YO'Q xatosini berishi kerak. Huquqlar to'liqligini bir so'rovda ko'rish:

```sql
SELECT has_column_privilege('payments_rw','public.payment_items','state','UPDATE') AS pi_state,
       has_table_privilege('payments_rw','public.audit_log','INSERT')              AS audit_insert,
       has_sequence_privilege('payments_rw','public.audit_log_id_seq','USAGE')     AS audit_seq,
       has_column_privilege('payments_rw','public.payment_items','asum','UPDATE')  AS pi_asum,
       has_table_privilege('payments_rw','public.payments','SELECT')               AS payments_sel,
       has_column_privilege('payments_rw','public.payments','parsing_sum','UPDATE') AS payments_upd;
```

Hammasi `t` bo'lishi kerak.

## Yangilash

```bash
git pull && docker compose up -d --build
```

Mavjud o'rnatishda "Taqsimot" va "Shartnomalar" bo'limlari uchun `payments_ro` ga olti manba kerak
(bir marta, qayta bajarish zararsiz):

```bash
sudo -u postgres psql -d project -c "GRANT SELECT ON public.paydocs, public.uzasbo_send, public.payments, public.munis_receive_payment, public.vw_contracts, public.billing TO payments_ro;"
```

⚠️ `vw_contracts` — ko'rinish. `SELECT reloptions FROM pg_class WHERE relname = 'vw_contracts';` bo'sh
bo'lsa, ortidagi jadvallarga huquq kerak emas (`security_invoker` bo'lsa — ularga ham `SELECT`).

Migratsiya avtomatik (`migrate` servisi). ⚠️ `docker compose down -v` ishlatmang —
volume yo'q, lekin odat bo'lib qolmasin (obyektlar ilovasida u butun bazani o'chiradi).

## Tekshirish

- `https://davijara.uz/payments` → login sahifasi.
- Kirgandan keyin "Umumiy ko'rinish" 12 kanal matritsasini ko'rsatadi. "To'lovlar bazasiga
  ulanib bo'lmadi" chiqsa — `pg_hba.conf` va `PROJECT_DATABASE_URL` ni tekshiring:
  `docker compose logs web | tail`.
