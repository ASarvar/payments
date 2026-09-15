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
                public.payments, public.munis_receive_payment TO payments_ro;
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

## Yangilash

```bash
git pull && docker compose up -d --build
```

Mavjud o'rnatishda "Taqsimot" bo'limi uchun `payments_ro` ga to'rt jadval kerak (bir marta,
qayta bajarish zararsiz):

```bash
sudo -u postgres psql -d project -c "GRANT SELECT ON public.paydocs, public.uzasbo_send, public.payments, public.munis_receive_payment TO payments_ro;"
```

Migratsiya avtomatik (`migrate` servisi). ⚠️ `docker compose down -v` ishlatmang —
volume yo'q, lekin odat bo'lib qolmasin (obyektlar ilovasida u butun bazani o'chiradi).

## Tekshirish

- `https://davijara.uz/payments` → login sahifasi.
- Kirgandan keyin "Umumiy ko'rinish" 12 kanal matritsasini ko'rsatadi. "To'lovlar bazasiga
  ulanib bo'lmadi" chiqsa — `pg_hba.conf` va `PROJECT_DATABASE_URL` ni tekshiring:
  `docker compose logs web | tail`.
