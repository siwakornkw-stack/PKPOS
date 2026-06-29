# GO-LIVE checklist (พร้อมวางขายจริง)

สถานะโค้ด: feature-complete, typecheck/lint/test/build/smoke เขียวทั้งหมด. รายการด้านล่างคือสิ่งที่ต้องทำ
ตอน deploy จริง (ส่วนใหญ่เป็น config/account ไม่ใช่โค้ด). เรียงตามลำดับความสำคัญ.

## 1. ต้องทำก่อนรับลูกค้ารายแรก (blocker)

- [ ] **Production host + Postgres** — deploy ตาม [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md) (Vercel + Marketplace Postgres เช่น Neon). ตั้ง `DATABASE_URL` ใน platform env.
- [ ] **`JWT_SECRET`** — ตั้งค่าใหม่ (>= 24 ตัว). สร้าง: `openssl rand -base64 32`. env.ts จะ throw ตอน production ถ้าไม่ตั้ง/สั้นไป/ยังเป็น dev default.
- [ ] **`CRON_SECRET`** — ตั้งใน platform env (Vercel ส่งให้ cron เป็น `Authorization: Bearer`). สร้าง: `openssl rand -hex 32`.
- [ ] **เก็บค่า subscription จริง (Omise)** — สมัคร Omise, ใส่ `PLATFORM_OMISE_SECRET_KEY` + `PLATFORM_OMISE_PUBLIC_KEY`. ถ้าไม่ใส่ ระบบรัน MOCK mode (อนุมัติเองโดยไม่เก็บเงินจริง) = ขายไม่ได้.
- [ ] **`prisma migrate deploy`** ตอน build (มีใน [vercel.json](../vercel.json) buildCommand แล้ว) — apply migrations ลง prod DB.
- [ ] **Seed master data เท่านั้น** (ไม่เอา demo) — `tsx prisma/seed.ts --fresh` หรือ `SEED_DEMO=false`. สร้าง super-admin ด้วย PIN แข็งแรง (`SUPERADMIN_PIN` หรือ random ที่ระบบ print). อย่าปล่อย demo users (PIN 1234) ขึ้น prod.
- [ ] **`TZ=Asia/Bangkok`** — ตั้งใน platform env (doc-number period + report day/hour bucket ใช้ local time).

## 2. การชำระเงินที่ใช้ได้

- เงินสด + **PromptPay QR** ใช้ได้ทันที (QR จริง สร้างเองไม่ต้องสมัคร) — ตั้ง PromptPay ID ต่อสาขาใน Settings.
- **บัตรเครดิต** (ทั้ง subscription ฝั่ง platform และร้านเก็บลูกค้า) ต้อง Omise account จริง:
  - subscription: `PLATFORM_OMISE_*` (ข้อ 1)
  - ร้านเก็บจากลูกค้า: ตั้ง `Branch.paymentProvider=OMISE` + key ต่อสาขาใน Settings (env `OMISE_SECRET_KEY` เป็น fallback)

## 3. Operational (ควรทำก่อนรับโหลดจริง)

- [ ] **Backup อัตโนมัติ** — `npm run backup` ([scripts/backup.mjs](../scripts/backup.mjs)) ตั้ง schedule รายวัน (Vercel Cron / pg provider snapshot / external cron). ทดสอบ `npm run restore`.
- [ ] **Rate limiting แบบ multi-instance** — `src/lib/ratelimit.ts` เป็น in-memory (per-instance). บน serverless/หลาย instance การจำกัดต่อ IP จะอ่อนลง.
      **หมายเหตุความปลอดภัย:** การล็อกบัญชีจากการเดารหัส (`User.failedLogins`/`lockedUntil`) เป็น **DB-backed** ([src/lib/auth.ts](../src/lib/auth.ts)) จึงกัน brute-force ต่อบัญชีได้ข้าม instance อยู่แล้ว. IP rate limit เป็น defense รอง. ถ้าต้องการให้แข็งขึ้น: เปลี่ยน `rateLimit()` ไปใช้ Upstash Redis (REST, serverless-safe) แล้วทำ callers เป็น async.
- [ ] **Error tracking + log** — ต่อ Sentry/log drain (ใส่ DSN). ตอนนี้มี `/api/health` (DB check) สำหรับ uptime monitor.
- [ ] **Monitoring** — ตั้ง uptime ping ที่ `/api/health` + alert.

## 4. กฎหมาย/ธุรกิจ (ไม่ใช่โค้ด)

- [ ] จดทะเบียนบริษัท + บัญชีรับเงิน
- [ ] Terms of Service + Privacy Policy (PDPA) — โค้ดมี export/erase ข้อมูลส่วนตัวลูกค้าแล้ว ([customers page](../src/app/(app)/customers/page.tsx))
- [ ] ออกใบกำกับภาษีค่า subscription ให้ร้าน (platform-side billing)

## 5. Integration เสริม (adapter พร้อม รอ account จริง)

โค้ด adapter ทำงาน mock/no-op จนกว่าจะใส่ key — ดู [src/lib/integrations](../src/lib/integrations). go-live ต้อง:

- **Delivery import** (Grab/LINE MAN/Shopee/Robinhood) — merchant credentials + map field จาก webhook จริงของแต่ละเจ้า (parser ปัจจุบันเป็น shape กลาง/mock) + ตั้ง `DELIVERY_WEBHOOK_SECRET` + ลงทะเบียน webhook URL `/api/webhooks/delivery/[provider]` กับเจ้านั้น.
- **LINE OA e-receipt** — สร้าง LINE Official Account, ใส่ channel token ที่ `Branch.lineChannelToken`.
- **e-Tax invoice** — ผู้ให้บริการที่ได้รับรองจาก ETDA + รูปแบบ XML ที่เซ็น, เปิด `Branch.etaxEnabled` + `ETAX_API_KEY`/`ETAX_API_URL`.

## 6. ตรวจก่อนปล่อย (verify บน staging)

```bash
npm run typecheck && npm run lint && npm test && npm run build
# แล้วบน staging (npm start, prod mode):
node scripts/smoke.mjs        # POS loop + RBAC + race + shift/promo/refund/PO/booking/multi-branch
node scripts/smoke-saas.mjs   # signup/isolation/plan-limit/suspend/billing (ต้อง CRON_SECRET)
node scripts/verify-ocha.mjs  # barcode/BXGY/member-only/reward/attendance/delivery/e-Tax/e-receipt
```

ดู [RUNBOOK.md](RUNBOOK.md) สำหรับ incident/ops ประจำวัน.
