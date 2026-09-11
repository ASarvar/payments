# To'lovlar monitoringi

Ijara to'lovlarining 12 ta oluvchi kanal bo'yicha taqsimoti va o'tkazilishi monitoringi
(`project.payment_items`, faqat o'qish). Faqat administratorlar uchun.

- Ishlab chiqish: `CLAUDE.md` (buyruqlar, arxitektura, ma'lumot tuzoqlari)
- Serverga o'rnatish: `DEPLOY.md`

```bash
npm install
DEV_PG_URL="postgresql://USER:PAROL@localhost:5433/postgres" npm run dev:setup
npx prisma migrate deploy && npm run db:seed && npm run dev:stub
npm run dev   # http://localhost:3001
```
