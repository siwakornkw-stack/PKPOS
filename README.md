# Resto POS - ระบบขายหน้าร้านสำหรับร้านอาหาร

Production-ready Restaurant POS รองรับ Dine-in / Takeaway / Delivery
สร้างตามชุดออกแบบ 10 หน้า (ปรับเป็นร้านอาหารทั่วไป ไม่ผูกกับเมนูเฉพาะร้าน)

## Stack

- **Next.js 15** (App Router) - frontend + API route handlers (แทน backend แยก)
- **Prisma + PostgreSQL** - ฐานข้อมูล (migrations ใน `prisma/migrations/`)
- **Tailwind CSS** + **Recharts** + **lucide-react** - UI / charts
- **JWT (jose)** + **bcryptjs** - auth + RBAC

## เริ่มใช้งาน

ต้องมี PostgreSQL. สร้าง DB + role แล้วตั้ง `DATABASE_URL` ใน `.env` (ดู `.env.example`):

```sql
CREATE ROLE pos LOGIN PASSWORD 'pos';
CREATE DATABASE resto_pos OWNER pos;
```

```bash
npm install            # ติดตั้ง + prisma generate (postinstall)
npm run db:deploy      # apply migrations ลง Postgres
npm run db:seed        # ใส่ข้อมูลตัวอย่าง (เมนู โต๊ะ ผู้ใช้ + demo sales)
npm run dev            # เปิด http://localhost:3000
```

dev เปลี่ยน schema: `npm run db:migrate` (สร้าง migration ใหม่). reset: `npm run db:reset`.

build + run โหมด production:

```bash
npm run build
npm start
```

## บัญชีทดสอบ (PIN: `1234`)

| username | บทบาท | สิทธิ์ |
|----------|-------|--------|
| owner | เจ้าของร้าน | ทั้งหมด + สลับสาขา |
| manager | ผู้จัดการ | เกือบทั้งหมด |
| cashier | แคชเชียร์ | ขาย, ชำระเงิน, void/refund, ปิดกะ |
| waiter | พนักงานเสิร์ฟ | ขาย, ผังโต๊ะ, ครัว |
| kitchen | ครัว | KDS อย่างเดียว |
| stock | สต็อก/แอดมิน | เมนู, คลัง, จัดซื้อ |
| auditor | ผู้ตรวจสอบ | ดู dashboard, audit log, รายงาน |
| manager2 / cashier2 | สาขาทองหล่อ | staff ของสาขา 2 |

## โมดูล (ตาม UI Page List ในออกแบบ)

| หน้า | path | ฟังก์ชัน |
|------|------|----------|
| เข้าสู่ระบบ | `/login` | login + quick PIN ตามบทบาท + account lockout (ผิด 5 ครั้งล็อก 15 นาที) |
| แดชบอร์ด | `/dashboard` | KPI, ยอดขาย 7 วัน, เมนูขายดี, payment mix, low stock |
| ขายหน้าร้าน | `/pos` | menu grid + cart, ส่งครัว, ชำระเงิน (เงินสด/QR/บัตร), เงินทอน, สมาชิก, โปรโมชัน, แยก/รวมบิล |
| ผังโต๊ะ | `/tables` | table map ตามโซน, สถานะสี, ยอดบิลต่อโต๊ะ |
| ครัว (KDS) | `/kitchen` | คิวออเดอร์, bump PENDING -> COOKING -> DONE -> SERVED |
| จองโต๊ะ | `/bookings` | จอง/มาแล้ว/ยกเลิก/ไม่มา, มัดจำ, ผูกโต๊ะ |
| กะการขาย | `/shift` | เปิด/ปิดกะ, นับเงินสด, expected vs variance |
| ลงเวลางาน | `/attendance` | พนักงานลงเวลาเข้า-ออกงาน (time clock), สรุปชั่วโมงทำงาน |
| เมนู & ราคา | `/menu` | CRUD เมนู, ปรับราคา, toggle หมด (86) |
| สูตรอาหาร/BOM | `/recipes` | แก้สูตรวัตถุดิบต่อเมนู (ใช้ตัดสต็อก) |
| โปรโมชัน | `/promotions` | CRUD โปร (percent/amount, ขั้นต่ำ), เปิด/ปิด |
| คลังสินค้า | `/inventory` | สต็อกวัตถุดิบ, รับเข้า/เบิก/ปรับ/นับ, ความเคลื่อนไหว |
| จัดซื้อ (PO) | `/purchasing` | สร้างใบสั่งซื้อ, รับของ -> เพิ่มสต็อก + อัปเดตต้นทุน |
| ลูกค้า/สมาชิก | `/customers` | สมาชิก, แต้มสะสม, ยอดสะสม |
| รายงาน | `/reports` | สรุปยอดตามช่วงเวลา, เมนูขายดี, export CSV, ลิงก์ใบเสร็จ |
| ใบเสร็จ | `/receipt/[id]` | ใบเสร็จพิมพ์ได้ + reprint + ปุ่มคืนเงิน (refund) |
| ตั้งค่า/ผู้ใช้ | `/settings` | CRUD ผู้ใช้ + reset PIN, ตารางสิทธิ์ (RBAC matrix), audit log |

รองรับ **หลายสาขา** (seed 2 สาขา) - owner สลับสาขาได้จาก dropdown บน topbar.
เป็น **PWA** (ติดตั้งได้ + service worker cache static + online/offline indicator จริง).
**Responsive** - มือถือ/tablet มี hamburger + drawer nav.

เพิ่มเติม:
- **ตั้งค่าธุรกิจ** (settings > ตั้งค่าธุรกิจ): VAT/service charge/หัว-ท้ายใบเสร็จ/PromptPay ID แก้ได้ (totals คิดตาม rate ของสาขา)
- **PromptPay QR** จริง (EMVCo payload + CRC16) - เลือกชำระแบบ QR ในจอขายแล้วได้ QR สแกนจ่าย (ตั้ง PromptPay ID ก่อน)
- **นับสต็อก** (/stock-count): นับจริงทั้งรอบ แสดง variance โพสต์ปรับยอด
- Login throttle (IP rate limit) + account lockout
- seed มี **demo sales 7 วัน** ให้ dashboard/report มีข้อมูลทันที

Integration layer (ทำงาน mock/no-op เมื่อไม่ตั้ง env, เสียบของจริงแล้วใช้ได้):
- **Card payment gateway** — adapter pattern, dev = MockGateway, production = ตั้ง `OMISE_SECRET_KEY` (มี Omise stub + TODO จุดต่อ)
- **ESC/POS printer** — สร้าง buffer จริง (ใบเสร็จ/ตั๋วครัว), ส่งผ่าน raw TCP ถ้าตั้ง `PRINTER_HOST` ไม่งั้นคืน base64 ให้ bridge รีเลย์
- **Full tax invoice** (/receipt/[id]/tax) — ใบกำกับภาษีเต็มรูป
- **Notification center** — bell + low-stock alert อัตโนมัติ (channel LINE/SMS/email = interface พร้อมเสียบ key)
- **Offline order queue** — ออฟไลน์สร้างออเดอร์ได้ (IndexedDB) + sync เมื่อกลับออนไลน์ (idempotencyKey กันซ้ำฝั่ง server)
- **i18n** TH/EN toggle (shell/nav; ขยาย dict ใน [i18n.tsx](src/lib/i18n.tsx) สำหรับ string หน้าอื่น)
- **Playwright E2E** (`npm run e2e` - ต้อง `npx playwright install chromium` + server รัน)

OchaPOS-parity (ขายหน้าร้านระดับใช้งานจริง):
- **เมนูตัวเลือก/ท็อปปิ้ง (modifiers)** — option groups (single/multi, บังคับเลือก) + ราคาเพิ่ม, แสดงในตั๋วครัว/ใบเสร็จ
- **ราคาตามช่องทาง** (dine-in/takeaway/delivery คนละราคา ผ่าน MenuPrice)
- **แยกจ่ายหลายวิธี** (split payment) เงินสด+QR ในบิลเดียว
- **ย้าย/โอนโต๊ะ**, **พักบิล** (park/hold + รายการบิลที่พักบนผังโต๊ะ)
- **เปิดลิ้นชัก** (ESC/POS drawer kick, auto เมื่อรับเงินสด)
- **ครัวแยกจุด** (kitchen station routing - หมวด -> จุด, KDS กรองตามจุด)
- **ปิดยอดรายวัน Z report** (/zreport) แยกตามวิธีชำระ/หมวด/ชั่วโมง/พนักงาน + กำไร
- **QR self-order** — ลูกค้าสแกน QR ที่โต๊ะ (`/order/[token]`) ดูเมนูสั่งเอง เข้าครัวอัตโนมัติ (public, rate-limited). ผังโต๊ะมีปุ่ม "QR สั่งอาหาร" สร้าง QR ต่อโต๊ะ
- **เมนูชุด/combo** (set menu) — รวมหลายเมนูเป็นชุด, ตั๋วครัวแสดง component, ตัดสต็อกตาม component
- **บัตรกำนัล/voucher** — โค้ดใช้ครั้งเดียว (amount/percent) ใช้ที่ POS (/vouchers จัดการ)
- **จอลูกค้า** (/display) — second screen แสดงออเดอร์ + ยอดให้ลูกค้าดู
- **เงินเข้า/ออกลิ้นชัก** (petty cash) — บันทึกเงินเข้า/ออกที่ไม่ใช่การขาย (`/api/shift/cash`) คิดรวมใน expected cash ตอนปิดกะ
- **ราคาเปิด** (open price) — เมนู `isOpenPrice` ให้แคชเชียร์กรอกราคาตอนขาย (server เชื่อราคาเฉพาะ item ที่ตั้ง open price เท่านั้น)
- **เช็คบิล** (pre-bill) — พิมพ์ใบแจ้งยอดก่อนชำระ (`/api/print` target `prebill`, ปุ่มในจอขาย)
- **เลขคิว** (queue number) — takeaway/delivery ได้เลขคิวรันรายวันต่อสาขา แสดงบน KDS + ตั๋วครัว + ใบเสร็จ
- **ยกเว้น service charge ต่อบิล** — checkbox ในจอขาย (ต้องมีสิทธิ์ DISCOUNT_OVERRIDE), คิด VAT ใหม่ตามยอดหลังยกเว้น
- **ใบกำกับภาษีเต็มรูป + ข้อมูลผู้ซื้อ** — กรอกชื่อ/เลขผู้เสียภาษี/ที่อยู่ผู้ซื้อในหน้า `/receipt/[id]/tax` (`/api/orders/[id]/buyer`)

OchaPOS-parity (รอบ 2 - เพิ่มเติม):
- **ราคาตามเวลา/happy hour** — `MenuTimePrice` ต่อเมนู (ช่วงนาที + วันในสัปดาห์ + ช่องทาง), ชนะราคาตามช่องทางเมื่ออยู่ในช่วง (จัดการในหน้า `/menu` > แก้ไขเมนู). pure logic ใน [pricing.ts](src/lib/pricing.ts)/[timewin.ts](src/lib/timewin.ts)
- **Promo engine เชิงลึก** — scope `ORDER`/`ITEM`/`CATEGORY`/`BXGY` (ซื้อ X แถม Y), เฉพาะสมาชิก (memberOnly), ช่วงเวลาต่อวัน, จำกัดจำนวนครั้ง (usageLimit นับตอนจ่าย). logic ใน [promo.ts](src/lib/promo.ts)
- **ระดับสมาชิก + ของรางวัลแลกแต้ม** — `MemberTier` (ตัวคูณแต้มตามยอดสะสม, เลื่อนชั้นอัตโนมัติตอนจ่าย) + `Reward` catalog (ส่วนลดบาท/ฟรีเมนู) แลกที่ POS. จัดการในหน้า `/customers` > โปรแกรมสมาชิก
- **บาร์โค้ด** — `MenuItem.barcode` (unique ต่อสาขา), ช่องสแกนในจอขายเพิ่มสินค้าเข้าตะกร้า (`/api/menu/barcode`)
- **ลงเวลางาน** — staff time clock เข้า-ออก + สรุปชั่วโมง (`/attendance`, `/api/attendance`)

Integration adapters (mock/no-op เมื่อไม่ตั้ง key/ID, เสียบของจริงแล้วใช้ได้ - ดู [src/lib/integrations](src/lib/integrations)):
- **Delivery aggregator import** — webhook `/api/webhooks/delivery/[provider]` (GRAB/LINEMAN/SHOPEE/ROBINHOOD) แปลง payload เป็นออเดอร์ DELIVERY เข้าครัวอัตโนมัติ (idempotent ตาม external id, shared secret `DELIVERY_WEBHOOK_SECRET`)
- **LINE OA e-receipt** — push ใบเสร็จเข้า LINE ลูกค้า (`/api/orders/[id]/ereceipt`, ใช้ `Branch.lineChannelToken`)
- **e-Tax invoice submit** — ส่งใบกำกับภาษีอิเล็กทรอนิกส์ (`/api/orders/[id]/etax`, เปิดด้วย `Branch.etaxEnabled` + `ETAX_API_KEY`)

ต้อง account ภายนอกจริงตอน go-live: Grab/LINE MAN/Shopee merchant, LINE OA channel token, ผู้ให้บริการ e-Tax (ETDA)

## Flow ตาม design (Workflow slide)

```
เปิดกะ -> รับออเดอร์ -> ส่งครัว -> ปรุง/เสิร์ฟ -> ชำระเงิน -> พิมพ์ใบเสร็จ -> ปิดออเดอร์ -> ตัดสต็อก
```

ตอนชำระเงิน ระบบจะตัดสต็อกวัตถุดิบอัตโนมัติตามสูตร (recipe/BOM) และบันทึก stock movement

## Document Numbering

`PREFIX-BRANCH-YYYYMM-NNNNNN` เช่น `SO-BR01-202606-000001`
(SO=ขาย, RC=ใบเสร็จ, PO=ใบสั่งซื้อ, STK=สต็อก, BK=จอง)

## ตั้งค่า production (PostgreSQL)

1. แก้ `prisma/schema.prisma`: `datasource db { provider = "postgresql" }`
2. แก้ `.env`: `DATABASE_URL="postgresql://..."` และตั้ง `JWT_SECRET` ใหม่
3. เปลี่ยน field เงินจาก `Float` เป็น `Decimal @db.Decimal(14,2)`
4. `npx prisma migrate deploy`

## ทดสอบ

```bash
npm test                  # unit tests (vitest) - totals, promo, rounding
npm start                 # ต้อง build ก่อน
node scripts/smoke.mjs    # E2E: order -> kitchen -> pay -> double-pay race -> shift -> promo -> refund -> PO -> booking -> multi-branch -> RBAC
node scripts/smoke-saas.mjs # SaaS: signup -> tenant isolation -> plan limit -> super-admin suspend -> billing (ต้อง CRON_SECRET ใน .env)
node scripts/verify-ocha.mjs # OchaPOS-parity: barcode -> BXGY -> member-only -> reward redeem -> attendance -> delivery import -> e-Tax -> e-receipt
```

## SaaS (ขายระบบให้หลายร้าน - multi-tenant)

ระบบเป็น multi-tenant: 1 platform ขาย subscription ให้หลายร้าน (tenant) แต่ละร้านมีสาขา/ผู้ใช้/ข้อมูลแยกกัน

| ส่วน | path | ฟังก์ชัน |
|------|------|----------|
| สมัครใช้งาน | `/signup` | ร้านสมัครเอง -> สร้าง tenant + สาขาแรก + เจ้าของ + ข้อมูลเริ่มต้น, ทดลองฟรี 14 วัน, auto-login |
| ชำระค่าบริการ | `/billing` | เจ้าของร้านเลือกแผน (BASIC/PRO) -> จ่าย -> tenant ACTIVE + ต่ออายุ 30 วัน + ใบแจ้งหนี้ |
| Platform admin | `/admin` | super-admin ดูร้านทั้งหมด + MRR/metrics, เปิด/ระงับ/ต่ออายุ/เปลี่ยนแผน |

แผน (`src/lib/plans.ts`): TRIAL (ฟรี 14 วัน, 1 สาขา/5 ผู้ใช้), BASIC (590฿/ด, 1 สาขา/10 ผู้ใช้), PRO (1990฿/ด, 5 สาขา/50 ผู้ใช้)

การกั้นสิทธิ์:
- ข้อมูลทุกอย่าง scope ด้วย `tenantId` (สาขา/ผู้ใช้กรองตาม tenant, สลับสาขาเช็ค ownership)
- tenant ที่ SUSPENDED/หมดอายุ: layout redirect ไป `/billing`, branch API คืน 402 (`requireBranch`)
- จำนวนผู้ใช้บังคับตาม `plan.maxUsers` ตอนสร้าง user
- super-admin (`isSuperAdmin`, ไม่มี tenant) เข้า `/admin` เท่านั้น (`requireSuperAdmin`)

บัญชี super-admin (seed): `superadmin` / PIN `1234`.

**เก็บเงิน subscription จริง (Omise):** platform เก็บค่าบริการจากร้านผ่าน Omise account ของ platform เอง (คนละตัวกับ per-branch ที่ร้านเก็บจากลูกค้า)
- เสียบ `PLATFORM_OMISE_SECRET_KEY` + `PLATFORM_OMISE_PUBLIC_KEY` -> บัตรถูก tokenize ฝั่ง browser (Omise.js, PAN ไม่ผ่าน server), charge จริง, เซฟบัตรเป็น Omise customer
- **Auto-renew**: cron `/api/cron/renew` (Vercel Cron รายวัน, auth ผ่าน `CRON_SECRET` bearer) ตัดบัตรที่เซฟไว้ทุกรอบ; จ่ายไม่ผ่าน -> dunning 3 วันแล้ว suspend
- webhook `/api/webhooks/omise` verify ด้วยการ re-fetch charge (events ไม่ sign)
- ไม่เสียบ key -> mock mode (อนุมัติอัตโนมัติ, dev/demo/smoke ใช้ได้)
- deploy production (Vercel + domain + Omise go-live): ดู [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)
