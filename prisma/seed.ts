import { PrismaClient } from "@prisma/client";
import { randomUUID, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { ROLE_DEFS } from "../src/lib/permissions";
import { computeTotals } from "../src/lib/totals";
import { round2 } from "../src/lib/format";

const prisma = new PrismaClient();

async function clean() {
  await prisma.auditLog.deleteMany();
  await prisma.salesOrderItemOption.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.menuItemOptionGroup.deleteMany();
  await prisma.menuPrice.deleteMany();
  await prisma.comboComponent.deleteMany();
  await prisma.option.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.voucher.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.attendance.deleteMany(); // FK -> user/branch (RESTRICT): clear before them
  await prisma.member.deleteMany();
  await prisma.user.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.role.deleteMany();
  await prisma.reward.deleteMany(); // FK -> tenant (RESTRICT): clear before tenant
  await prisma.memberTier.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscriptionPayment.deleteMany(); // FK -> tenant (RESTRICT): clear before tenant
  await prisma.tenant.deleteMany();
}

const tableDefs = [
  { code: "A1", zone: "โซน A", seats: 2, x: 1, y: 1 },
  { code: "A2", zone: "โซน A", seats: 2, x: 2, y: 1 },
  { code: "A3", zone: "โซน A", seats: 4, x: 3, y: 1 },
  { code: "A4", zone: "โซน A", seats: 4, x: 4, y: 1 },
  { code: "B1", zone: "โซน B", seats: 4, x: 1, y: 2 },
  { code: "B2", zone: "โซน B", seats: 4, x: 2, y: 2 },
  { code: "B3", zone: "โซน B", seats: 6, x: 3, y: 2 },
  { code: "B4", zone: "โซน B", seats: 6, x: 4, y: 2 },
  { code: "C1", zone: "ระเบียง", seats: 2, x: 1, y: 3 },
  { code: "C2", zone: "ระเบียง", seats: 2, x: 2, y: 3 },
  { code: "C3", zone: "ระเบียง", seats: 8, x: 3, y: 3 },
  { code: "VIP", zone: "ห้องส่วนตัว", seats: 10, x: 4, y: 3 },
];

const ingDefs = [
  { code: "ING001", name: "ข้าวสาร", unit: "กก.", stock: 50, reorder: 10, cost: 35 },
  { code: "ING002", name: "เนื้อหมู", unit: "กก.", stock: 20, reorder: 5, cost: 140 },
  { code: "ING003", name: "เนื้อไก่", unit: "กก.", stock: 18, reorder: 5, cost: 80 },
  { code: "ING004", name: "กุ้ง", unit: "กก.", stock: 8, reorder: 3, cost: 280 },
  { code: "ING005", name: "ไข่ไก่", unit: "ฟอง", stock: 200, reorder: 60, cost: 4 },
  { code: "ING006", name: "ผักรวม", unit: "กก.", stock: 15, reorder: 5, cost: 40 },
  { code: "ING007", name: "เส้นก๋วยเตี๋ยว", unit: "กก.", stock: 12, reorder: 4, cost: 30 },
  { code: "ING008", name: "น้ำมันพืช", unit: "ลิตร", stock: 24, reorder: 6, cost: 55 },
  { code: "ING009", name: "กระเทียม", unit: "กก.", stock: 6, reorder: 2, cost: 90 },
  { code: "ING010", name: "พริก", unit: "กก.", stock: 4, reorder: 2, cost: 120 },
  { code: "ING011", name: "น้ำปลา", unit: "ลิตร", stock: 10, reorder: 3, cost: 45 },
  { code: "ING012", name: "น้ำตาล", unit: "กก.", stock: 15, reorder: 5, cost: 25 },
  { code: "ING013", name: "นมข้นหวาน", unit: "กระป๋อง", stock: 30, reorder: 10, cost: 22 },
  { code: "ING014", name: "กาแฟคั่ว", unit: "กก.", stock: 5, reorder: 2, cost: 320 },
  { code: "ING015", name: "น้ำแข็ง", unit: "ถุง", stock: 40, reorder: 15, cost: 15 },
];

const catDefs: { name: string; icon: string; items: { code: string; name: string; price: number; cost: number; recipe?: [string, number][] }[] }[] = [
  { name: "แนะนำ", icon: "star", items: [
    { code: "M001", name: "ข้าวผัดกุ้ง", price: 90, cost: 38, recipe: [["ING001", 0.2], ["ING004", 0.08], ["ING005", 1], ["ING008", 0.03]] },
    { code: "M002", name: "ผัดไทยกุ้งสด", price: 85, cost: 35, recipe: [["ING007", 0.15], ["ING004", 0.06], ["ING005", 1]] },
    { code: "M003", name: "ต้มยำกุ้งน้ำข้น", price: 120, cost: 55, recipe: [["ING004", 0.1], ["ING010", 0.02], ["ING011", 0.02]] },
  ]},
  { name: "ข้าว / จานเดียว", icon: "utensils", items: [
    { code: "M010", name: "ข้าวกะเพราหมูสับ", price: 65, cost: 26, recipe: [["ING001", 0.2], ["ING002", 0.1], ["ING005", 1]] },
    { code: "M011", name: "ข้าวกะเพราไก่ไข่ดาว", price: 65, cost: 24, recipe: [["ING001", 0.2], ["ING003", 0.1], ["ING005", 1]] },
    { code: "M012", name: "ข้าวผัดหมู", price: 60, cost: 22, recipe: [["ING001", 0.2], ["ING002", 0.08], ["ING005", 1]] },
    { code: "M013", name: "ข้าวหมูกระเทียม", price: 65, cost: 25, recipe: [["ING001", 0.2], ["ING002", 0.1], ["ING009", 0.01]] },
    { code: "M014", name: "ข้าวไข่เจียว", price: 45, cost: 15, recipe: [["ING001", 0.2], ["ING005", 2]] },
  ]},
  { name: "เส้น / ก๋วยเตี๋ยว", icon: "soup", items: [
    { code: "M020", name: "ก๋วยเตี๋ยวหมูน้ำตก", price: 55, cost: 22, recipe: [["ING007", 0.15], ["ING002", 0.08]] },
    { code: "M021", name: "บะหมี่เกี๊ยวหมูแดง", price: 60, cost: 24, recipe: [["ING007", 0.15], ["ING002", 0.06]] },
    { code: "M022", name: "ราดหน้าหมู", price: 60, cost: 24, recipe: [["ING007", 0.15], ["ING002", 0.08], ["ING006", 0.05]] },
    { code: "M023", name: "ผัดซีอิ๊วไก่", price: 60, cost: 22, recipe: [["ING007", 0.15], ["ING003", 0.08], ["ING005", 1]] },
  ]},
  { name: "กับข้าว", icon: "chef-hat", items: [
    { code: "M030", name: "ผัดผักรวมมิตร", price: 70, cost: 28, recipe: [["ING006", 0.15], ["ING009", 0.01]] },
    { code: "M031", name: "ไก่ผัดเม็ดมะม่วง", price: 95, cost: 42, recipe: [["ING003", 0.12]] },
    { code: "M032", name: "หมูผัดพริกแกง", price: 85, cost: 36, recipe: [["ING002", 0.12], ["ING010", 0.02]] },
    { code: "M033", name: "กุ้งผัดผงกะหรี่", price: 130, cost: 62, recipe: [["ING004", 0.12], ["ING005", 1]] },
  ]},
  { name: "ทอด / ทานเล่น", icon: "drumstick", items: [
    { code: "M040", name: "ไก่ทอดน้ำปลา", price: 70, cost: 28, recipe: [["ING003", 0.15], ["ING008", 0.05]] },
    { code: "M041", name: "ปอเปี๊ยะทอด", price: 50, cost: 18, recipe: [["ING006", 0.05], ["ING008", 0.03]] },
    { code: "M042", name: "กุ้งชุบแป้งทอด", price: 110, cost: 52, recipe: [["ING004", 0.1], ["ING008", 0.05]] },
    { code: "M043", name: "เฟรนช์ฟรายส์", price: 55, cost: 20, recipe: [["ING008", 0.04]] },
  ]},
  { name: "ยำ / สลัด", icon: "salad", items: [
    { code: "M050", name: "ยำวุ้นเส้นรวมมิตร", price: 80, cost: 32, recipe: [["ING004", 0.05], ["ING002", 0.05]] },
    { code: "M051", name: "ลาบหมู", price: 70, cost: 28, recipe: [["ING002", 0.12]] },
    { code: "M052", name: "ยำไข่ดาว", price: 60, cost: 22, recipe: [["ING005", 2]] },
  ]},
  { name: "ของหวาน", icon: "ice-cream", items: [
    { code: "M060", name: "ข้าวเหนียวมะม่วง", price: 70, cost: 30 },
    { code: "M061", name: "บัวลอยไข่หวาน", price: 45, cost: 16 },
    { code: "M062", name: "ไอศกรีมกะทิ", price: 40, cost: 14 },
  ]},
  { name: "เครื่องดื่ม", icon: "cup-soda", items: [
    { code: "M070", name: "ชาเย็น", price: 30, cost: 10, recipe: [["ING013", 0.2], ["ING015", 0.3]] },
    { code: "M071", name: "กาแฟเย็น", price: 35, cost: 12, recipe: [["ING014", 0.02], ["ING013", 0.2], ["ING015", 0.3]] },
    { code: "M072", name: "น้ำเปล่า", price: 15, cost: 6 },
    { code: "M073", name: "โค้ก", price: 25, cost: 12 },
    { code: "M074", name: "น้ำส้มคั้น", price: 45, cost: 20 },
  ]},
];

async function createBranchData(branchId: number) {
  for (const t of tableDefs)
    await prisma.diningTable.create({ data: { branchId, code: t.code, zone: t.zone, seats: t.seats, posX: t.x, posY: t.y, qrToken: randomUUID() } });

  const ing: Record<string, number> = {};
  for (const i of ingDefs) {
    const c = await prisma.ingredient.create({
      data: { branchId, code: i.code, name: i.name, unit: i.unit, stockQty: i.stock, reorderLevel: i.reorder, costPerUnit: i.cost },
    });
    ing[i.code] = c.id;
  }

  let sort = 0;
  let firstCatId = 0;
  const itemByCode: Record<string, number> = {};
  for (const c of catDefs) {
    // route drinks to the bar station, everything else to the kitchen
    const station = c.name === "เครื่องดื่ม" ? "บาร์/เครื่องดื่ม" : "ครัว";
    const cat = await prisma.menuCategory.create({ data: { branchId, name: c.name, icon: c.icon, station, sortOrder: sort++ } });
    if (!firstCatId) firstCatId = cat.id;
    for (const it of c.items) {
      const item = await prisma.menuItem.create({ data: { branchId, categoryId: cat.id, code: it.code, name: it.name, price: it.price, cost: it.cost } });
      itemByCode[it.code] = item.id;
      if (it.recipe)
        for (const [ingCode, qty] of it.recipe)
          await prisma.recipeItem.create({ data: { menuItemId: item.id, ingredientId: ing[ingCode], qty } });
    }
  }

  // barcodes on a few packaged goods (scan-to-sell at POS); items with no modifiers
  const barcodes: Record<string, string> = { M072: "8850001000017", M001: "8850001000024", M020: "8850001000031" };
  for (const [code, bc] of Object.entries(barcodes))
    if (itemByCode[code]) await prisma.menuItem.update({ where: { id: itemByCode[code] }, data: { barcode: bc } });

  // modifier groups (ตัวเลือก/ท็อปปิ้ง)
  const sweet = await prisma.optionGroup.create({
    data: {
      branchId, name: "ระดับความหวาน", required: true, minSelect: 1, maxSelect: 1,
      options: { create: [
        { name: "หวานปกติ", priceDelta: 0, sortOrder: 0 },
        { name: "หวานน้อย", priceDelta: 0, sortOrder: 1 },
        { name: "หวานมาก", priceDelta: 0, sortOrder: 2 },
        { name: "ไม่หวาน", priceDelta: 0, sortOrder: 3 },
      ] },
    },
  });
  const extra = await prisma.optionGroup.create({
    data: {
      branchId, name: "เพิ่มพิเศษ", required: false, minSelect: 0, maxSelect: 3,
      options: { create: [
        { name: "เพิ่มไข่ดาว", priceDelta: 10, sortOrder: 0 },
        { name: "เพิ่มข้าว", priceDelta: 10, sortOrder: 1 },
        { name: "พิเศษ (เพิ่มเนื้อ)", priceDelta: 20, sortOrder: 2 },
      ] },
    },
  });
  // sweetness on iced drinks; extras on rice dishes
  for (const code of ["M070", "M071", "M074"])
    if (itemByCode[code]) await prisma.menuItemOptionGroup.create({ data: { menuItemId: itemByCode[code], groupId: sweet.id } });
  for (const code of ["M010", "M011", "M012", "M013"])
    if (itemByCode[code]) await prisma.menuItemOptionGroup.create({ data: { menuItemId: itemByCode[code], groupId: extra.id } });

  // per-channel pricing example: delivery +10 on a few items
  for (const code of ["M001", "M010", "M020"])
    if (itemByCode[code]) {
      const m = await prisma.menuItem.findUnique({ where: { id: itemByCode[code] } });
      if (m) await prisma.menuPrice.create({ data: { menuItemId: m.id, channel: "DELIVERY", price: m.price + 10 } });
    }

  // happy-hour time price: iced drinks 50% off 14:00-17:00 every day
  for (const code of ["M070", "M071", "M074"])
    if (itemByCode[code]) {
      const m = await prisma.menuItem.findUnique({ where: { id: itemByCode[code] } });
      if (m) await prisma.menuTimePrice.create({ data: { menuItemId: m.id, name: "Happy Hour", days: "0123456", startMin: 14 * 60, endMin: 17 * 60, price: Math.round(m.price * 50) / 100, priority: 1 } });
    }

  // combo / set menu: ข้าวกะเพรา + น้ำเปล่า
  if (itemByCode["M010"] && itemByCode["M072"]) {
    const combo = await prisma.menuItem.create({ data: { branchId, categoryId: firstCatId, code: "SET01", name: "ชุดข้าวกะเพรา + น้ำ", price: 75, cost: 30, isCombo: true } });
    await prisma.comboComponent.create({ data: { comboId: combo.id, menuItemId: itemByCode["M010"], qty: 1 } });
    await prisma.comboComponent.create({ data: { comboId: combo.id, menuItemId: itemByCode["M072"], qty: 1 } });
  }

  // single-use voucher codes
  await prisma.voucher.createMany({
    data: [
      { branchId, code: "GIFT100", type: "AMOUNT", value: 100, minSpend: 0 },
      { branchId, code: "WELCOME20", type: "PERCENT", value: 20, minSpend: 200 },
    ],
  });

  await prisma.supplier.createMany({
    data: [
      { branchId, code: "SUP01", name: "ตลาดสดเจริญ", phone: "02-111-1111" },
      { branchId, code: "SUP02", name: "แม็คโคร", phone: "02-222-2222" },
      { branchId, code: "SUP03", name: "ฟาร์มไก่สดทุกวัน", phone: "081-333-3333" },
    ],
  });
  await prisma.promotion.createMany({
    data: [
      { branchId, code: "LUNCH10", name: "ลด 10% มื้อกลางวัน", type: "PERCENT", value: 10, minSpend: 200, scope: "ORDER" },
      { branchId, code: "MEMBER50", name: "สมาชิกลด 50 บาท", type: "AMOUNT", value: 50, minSpend: 500, scope: "ORDER" },
    ],
  });
  // engine-depth demo promos: buy-1-get-1 drink + member-only happy-hour discount
  if (itemByCode["M070"])
    await prisma.promotion.create({ data: { branchId, code: "B1G1TEA", name: "ชาเย็น ซื้อ 1 แถม 1", type: "PERCENT", value: 100, scope: "BXGY", menuItemId: itemByCode["M070"], buyQty: 1, getQty: 1 } });
  await prisma.promotion.create({ data: { branchId, code: "VIP15", name: "สมาชิกลด 15% (17-20น.)", type: "PERCENT", value: 15, scope: "ORDER", memberOnly: true, startMin: 17 * 60, endMin: 20 * 60 } });
}

async function generateDemoSales(branchId: number) {
  const items = await prisma.menuItem.findMany({ where: { branchId } });
  const tables = await prisma.diningTable.findMany({ where: { branchId } });
  const owner = await prisma.user.findFirst({ where: { branchId } });
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!items.length || !owner || !branch) return;

  const rates = { taxRate: branch.taxRate, serviceRate: branch.serviceRate };
  const methods = ["CASH", "QR", "CARD"];
  const types = ["DINE_IN", "TAKEAWAY", "DELIVERY"];
  const now = new Date();
  const rnd = (n: number) => Math.floor(Math.random() * n);
  let seq = 0;

  for (let day = 6; day >= 0; day--) {
    const orderCount = 8 + rnd(10);
    for (let o = 0; o < orderCount; o++) {
      const orderType = types[rnd(3)];
      const lines = Array.from({ length: 1 + rnd(4) }, () => {
        const m = items[rnd(items.length)];
        return { menuItemId: m.id, name: m.name, qty: 1 + rnd(3), unitPrice: m.price };
      });
      const totals = computeTotals(lines, orderType, 0, rates);
      const at = new Date(now.getTime() - day * 86400000);
      at.setHours(10 + rnd(12), rnd(60), 0, 0);
      seq++;
      const tag = String(seq).padStart(6, "0");
      await prisma.salesOrder.create({
        data: {
          docNo: `SO-${branch.code}-DEMO-${tag}`,
          branchId, orderType,
          tableId: orderType === "DINE_IN" ? tables[rnd(tables.length)].id : null,
          userId: owner.id, status: "PAID", guestCount: 1 + rnd(4),
          ...totals, createdAt: at, paidAt: at, closedAt: at,
          items: {
            create: lines.map((l) => ({
              menuItemId: l.menuItemId, name: l.name, qty: l.qty, unitPrice: l.unitPrice,
              lineAmount: round2(l.qty * l.unitPrice), status: "SERVED",
            })),
          },
          payments: {
            create: {
              docNo: `RC-${branch.code}-DEMO-${tag}`, method: methods[rnd(3)],
              amount: totals.netAmount, received: totals.netAmount, change: 0,
              createdBy: owner.id, createdAt: at,
            },
          },
        },
      });
    }
  }
  console.log(`  demo sales: ${seq} paid orders over 7 days (branch ${branch.code})`);
}

async function seedRoles() {
  const roles: Record<string, number> = {};
  for (const [code, def] of Object.entries(ROLE_DEFS)) {
    const r = await prisma.role.upsert({
      where: { code },
      update: { name: def.name, permissions: JSON.stringify(def.permissions) },
      create: { code, name: def.name, permissions: JSON.stringify(def.permissions) },
    });
    roles[code] = r.id;
  }
  return roles;
}

// Production master-data seed: roles + a platform super-admin only. No demo tenant/branches/
// menu/staff, no destructive wipe. Idempotent (safe to re-run on a live DB).
async function seedFresh() {
  const roles = await seedRoles();
  const existing = await prisma.user.findUnique({ where: { username: "superadmin" } });
  if (existing) {
    console.log("fresh seed: roles upserted; superadmin already exists (PIN unchanged).");
    return;
  }
  const rawPin = process.env.SUPERADMIN_PIN || String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(rawPin, 10);
  await prisma.user.create({
    data: { username: "superadmin", fullName: "Platform Admin", passwordHash: hash, pin: hash, roleId: roles.OWNER, isSuperAdmin: true },
  });
  console.log("fresh seed: roles + platform superadmin created (no demo data).");
  console.log(process.env.SUPERADMIN_PIN ? "  superadmin PIN: (from SUPERADMIN_PIN env)" : `  superadmin PIN: ${rawPin}  <-- save this, change it after first login`);
}

async function main() {
  const skipDemo = process.argv.includes("--fresh") || process.env.SEED_DEMO === "false";
  if (skipDemo) { await seedFresh(); return; }

  // demo mode performs a destructive wipe - never allow it against a production DB
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Refusing to seed demo data in production (it wipes all tenants). Use --fresh, or --force to override.");
    process.exit(1);
  }

  await clean();
  const pin = await bcrypt.hash("1234", 10);
  const roles = await seedRoles();

  const branchInfos = [
    { code: "BR01", name: "ร้านอาหารตัวอย่าง สาขาสีลม", address: "123 ถนนสีลม เขตบางรัก กรุงเทพฯ 10500", phone: "02-123-4567", taxId: "0105500000000", promptPayId: "0812345678", receiptHeader: "ยินดีต้อนรับ", receiptFooter: "ขอบคุณที่อุดหนุน แล้วพบกันใหม่" },
    { code: "BR02", name: "ร้านอาหารตัวอย่าง สาขาทองหล่อ", address: "456 ถนนสุขุมวิท เขตวัฒนา กรุงเทพฯ 10110", phone: "02-987-6543", taxId: "0105500000000", promptPayId: "0898765432", receiptHeader: "ยินดีต้อนรับ", receiptFooter: "ขอบคุณที่อุดหนุน" },
  ];
  // demo tenant (an ACTIVE Pro account) owning both branches
  const tenant = await prisma.tenant.create({
    data: { name: "ร้านอาหารตัวอย่าง", slug: "demo", plan: "PRO", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 86400000) },
  });

  const branchIds: number[] = [];
  for (const info of branchInfos) {
    const b = await prisma.branch.create({ data: { ...info, tenantId: tenant.id } });
    await createBranchData(b.id);
    branchIds.push(b.id);
  }

  // staff: 7 standard users on branch 1 (quick-login), 2 more on branch 2
  const staff = [
    { username: "owner", fullName: "สมชาย เจ้าของร้าน", role: "OWNER", b: 0 },
    { username: "manager", fullName: "สุดา ผู้จัดการ", role: "MANAGER", b: 0 },
    { username: "cashier", fullName: "นภา แคชเชียร์", role: "CASHIER", b: 0 },
    { username: "waiter", fullName: "ต่อ พนักงานเสิร์ฟ", role: "WAITER", b: 0 },
    { username: "kitchen", fullName: "เชฟอู๊ด", role: "KITCHEN", b: 0 },
    { username: "stock", fullName: "วิภา สต็อก", role: "STOCK", b: 0 },
    { username: "auditor", fullName: "ธนา ผู้ตรวจสอบ", role: "AUDITOR", b: 0 },
    { username: "manager2", fullName: "เกศ ผู้จัดการสาขา 2", role: "MANAGER", b: 1 },
    { username: "cashier2", fullName: "พร แคชเชียร์สาขา 2", role: "CASHIER", b: 1 },
  ];
  for (const s of staff)
    await prisma.user.create({
      data: { username: s.username, fullName: s.fullName, passwordHash: pin, pin, roleId: roles[s.role], branchId: branchIds[s.b], tenantId: tenant.id },
    });

  // platform super-admin (no tenant) - manages all tenants at /admin
  await prisma.user.create({
    data: { username: "superadmin", fullName: "Platform Admin", passwordHash: pin, pin, roleId: roles.OWNER, isSuperAdmin: true },
  });

  await prisma.member.createMany({
    data: [
      { tenantId: tenant.id, code: "MEM001", name: "คุณวีระ ลูกค้าประจำ", phone: "0811111111", points: 250, totalSpent: 12500 },
      { tenantId: tenant.id, code: "MEM002", name: "คุณมานี รักดี", phone: "0822222222", points: 80, totalSpent: 4000 },
      { tenantId: tenant.id, code: "MEM003", name: "คุณสมศรี ใจงาม", phone: "0833333333", points: 420, totalSpent: 21000 },
    ],
  });
  await prisma.counter.upsert({ where: { key: `MEM-${tenant.id}` }, create: { key: `MEM-${tenant.id}`, seq: 3 }, update: { seq: 3 } });

  // loyalty tiers (tenant-wide) + reward catalog
  const tiers = await Promise.all([
    prisma.memberTier.create({ data: { tenantId: tenant.id, name: "Silver", minSpent: 0, pointMultiplier: 1, sortOrder: 0 } }),
    prisma.memberTier.create({ data: { tenantId: tenant.id, name: "Gold", minSpent: 10000, pointMultiplier: 1.5, sortOrder: 1 } }),
    prisma.memberTier.create({ data: { tenantId: tenant.id, name: "Platinum", minSpent: 20000, pointMultiplier: 2, sortOrder: 2 } }),
  ]);
  for (const m of await prisma.member.findMany({ where: { tenantId: tenant.id } })) {
    const t = [...tiers].reverse().find((x) => m.totalSpent >= x.minSpent);
    if (t) await prisma.member.update({ where: { id: m.id }, data: { tierId: t.id } });
  }
  const freeDrink = await prisma.menuItem.findFirst({ where: { branchId: branchIds[0], code: "M072" } });
  await prisma.reward.createMany({
    data: [
      { tenantId: tenant.id, name: "ส่วนลด 50 บาท", pointsCost: 50, type: "DISCOUNT_AMOUNT", value: 50, menuItemId: null },
      { tenantId: tenant.id, name: "ส่วนลด 120 บาท", pointsCost: 100, type: "DISCOUNT_AMOUNT", value: 120, menuItemId: null },
      ...(freeDrink ? [{ tenantId: tenant.id, name: "น้ำเปล่าฟรี", pointsCost: 30, type: "FREE_ITEM", value: 0, menuItemId: freeDrink.id }] : []),
    ],
  });

  // demo attendance: branch-1 first user worked 08:00-16:00 today
  const firstUser = await prisma.user.findFirst({ where: { branchId: branchIds[0] }, orderBy: { id: "asc" } });
  if (firstUser) {
    const inAt = new Date(); inAt.setHours(8, 0, 0, 0);
    const outAt = new Date(); outAt.setHours(16, 0, 0, 0);
    await prisma.attendance.create({ data: { branchId: branchIds[0], userId: firstUser.id, clockIn: inAt, clockOut: outAt } });
  }

  // ----- Demo sales history (branch 1, last 7 days) for populated dashboard -----
  await generateDemoSales(branchIds[0]);

  console.log("Seed complete:");
  console.log(`  branches: ${branchInfos.length}`);
  console.log(`  roles: ${Object.keys(roles).length}, users: ${staff.length} (pin 1234)`);
  console.log(`  per branch: ${tableDefs.length} tables, ${ingDefs.length} ingredients, ${catDefs.reduce((n, c) => n + c.items.length, 0)} menu items`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
