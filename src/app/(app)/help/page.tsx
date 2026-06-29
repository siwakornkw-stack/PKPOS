"use client";

import { useState } from "react";
import {
  HelpCircle, LogIn, ShoppingCart, Grid3x3, ChefHat, CalendarClock, Clock,
  BookOpen, Tag, Boxes, Truck, Users, BarChart3, Settings, Printer, QrCode, Lightbulb,
  Timer, ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

const SECTIONS = [
  { id: "start", title: "เริ่มต้นใช้งาน", icon: LogIn },
  { id: "pos", title: "ขายหน้าร้าน (POS)", icon: ShoppingCart },
  { id: "tables", title: "ผังโต๊ะ + QR สั่งเอง", icon: Grid3x3 },
  { id: "kitchen", title: "ครัว (KDS)", icon: ChefHat },
  { id: "booking", title: "จองโต๊ะ", icon: CalendarClock },
  { id: "shift", title: "กะการขาย / นับเงิน", icon: Clock },
  { id: "attendance", title: "ลงเวลางาน", icon: Timer },
  { id: "menu", title: "เมนู สูตร ราคาตามเวลา", icon: BookOpen },
  { id: "promo", title: "โปรโมชัน & บัตรกำนัล", icon: Tag },
  { id: "stock", title: "คลัง นับสต็อก จัดซื้อ", icon: Boxes },
  { id: "members", title: "สมาชิก / แต้ม / ระดับ", icon: Users },
  { id: "reports", title: "รายงาน / ปิดยอด", icon: BarChart3 },
  { id: "integrations", title: "เดลิเวอรี / LINE / e-Tax", icon: Truck },
  { id: "settings", title: "ตั้งค่า / เครื่องพิมพ์", icon: Settings },
  { id: "admin", title: "เจ้าของระบบ (Platform)", icon: ShieldCheck },
  { id: "tips", title: "เคล็ดลับ & แก้ปัญหา", icon: Lightbulb },
];

export default function HelpPage() {
  const [active, setActive] = useState("start");
  return (
    <div className="p-6">
      <PageHeader title="วิธีใช้งาน" subtitle="คู่มือการใช้งานระบบ POS แบบละเอียด" icon={HelpCircle} />

      <div className="flex gap-6">
        {/* TOC */}
        <aside className="hidden lg:block w-60 shrink-0">
          <nav className="sticky top-4 space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id} href={`#${s.id}`} onClick={() => setActive(s.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active === s.id ? "bg-brand-100 text-brand-700 font-semibold" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <s.icon className="h-4 w-4" /> {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="flex-1 max-w-3xl space-y-6">
          <Section id="start" icon={LogIn} title="เริ่มต้นใช้งาน">
            <Steps items={[
              ["เข้าสู่ระบบ", "หน้า Login กรอกชื่อผู้ใช้ + PIN (ทดสอบ: owner / 1234) หรือกดปุ่มเข้าด่วนตามบทบาท"],
              ["บทบาท (Role)", "owner=ทั้งหมด, manager=เกือบทั้งหมด, cashier=ขาย/ชำระ/void, waiter=ขาย/โต๊ะ/ครัว, kitchen=KDS, stock=คลัง/จัดซื้อ, auditor=ดูรายงาน. เมนูซ้ายจะแสดงเฉพาะที่มีสิทธิ์"],
              ["เปิดกะ", "ก่อนขาย ไปที่ กะการขาย > เปิดกะ ใส่เงินสดตั้งต้นในลิ้นชัก"],
              ["สลับภาษา / สาขา", "มุมขวาบน: ปุ่ม TH/EN, และ owner สลับสาขาได้จาก dropdown ชื่อสาขา"],
            ]} />
          </Section>

          <Section id="pos" icon={ShoppingCart} title="ขายหน้าร้าน (POS)">
            <p className="text-sm text-gray-600 mb-2">ไปที่ <b>ผังโต๊ะ</b> แตะโต๊ะที่ว่าง (หรือเมนู <b>ขายหน้าร้าน</b> สำหรับกลับบ้าน/เดลิเวอรี)</p>
            <Steps items={[
              ["เลือกประเภท", "ทานที่ร้าน / กลับบ้าน / เดลิเวอรี (ราคาบางเมนูต่างกันตามช่องทาง)"],
              ["เลือกเมนู", "แตะเมนูเพื่อใส่ตะกร้า. เมนูที่มี 'ตัวเลือก' (เช่น หวานน้อย/เพิ่มไข่) จะเด้งหน้าต่างให้เลือกก่อน"],
              ["สแกนบาร์โค้ด", "สินค้าที่มีบาร์โค้ด: สแกน (หรือพิมพ์เลขในช่อง 'สแกนบาร์โค้ด' แล้ว Enter) เพิ่มเข้าตะกร้าทันที"],
              ["ใส่สมาชิก / โปร", "กด 'ใส่สมาชิก' เพื่อสะสม/ใช้แต้ม, กด 'ใช้โปรโมชัน' เลือกโปรหรือกรอกโค้ด/voucher"],
              ["ใช้แต้ม / แลกของรางวัล", "เมื่อมีสมาชิกในบิล: 'ใช้แต้มสมาชิก' (1 แต้ม=1 บาท) หรือ 'แลกของรางวัล' (เลือกจาก catalog แต้ม → ส่วนลด/ฟรีเมนู)"],
              ["ส่งครัว", "กดปุ่ม 'ส่งครัว' (สีส้ม) รายการจะเข้าจอครัว (KDS). สั่งเพิ่มได้เรื่อยๆ"],
              ["ชำระเงิน", "กด 'ชำระเงิน' เลือก เงินสด (ใส่เงินรับ→เงินทอน) / QR พร้อมเพย์ (สแกนจ่าย) / บัตร. แยกจ่ายหลายวิธีได้ที่ปุ่ม 'แยกจ่าย'"],
              ["ใบเสร็จ", "หลังจ่าย ใบเสร็จเปิดอัตโนมัติ พิมพ์ได้ หรือพิมพ์ลงเครื่องพิมพ์ความร้อน/ตั๋วครัว. ลิ้นชักเงินสดเปิดเองเมื่อรับเงินสด"],
            ]} />
            <Tip>ปุ่มล่างขวา: <b>แยก</b>บิล (ย้ายบางรายการเป็นบิลใหม่), <b>รวม</b>บิล, <b>ย้าย</b>โต๊ะ, <b>พัก</b>บิล (เก็บไว้จ่ายทีหลัง). <b>ยกเลิก (Void)</b> สำหรับบิลที่ยังไม่จ่าย, <b>คืนเงิน (Refund)</b> ที่หน้าใบเสร็จสำหรับบิลที่จ่ายแล้ว</Tip>
          </Section>

          <Section id="tables" icon={Grid3x3} title="ผังโต๊ะ + QR สั่งเอง">
            <Steps items={[
              ["สถานะโต๊ะ", "สีเขียว=ว่าง, ส้ม=มีลูกค้า, แดง=รอชำระ, น้ำเงิน=จองแล้ว. แตะโต๊ะเพื่อรับออเดอร์/ดูบิล"],
              ["บิลที่พัก", "บิลที่กดพักไว้แสดงเป็นชิปด้านบน แตะเพื่อเรียกกลับมา"],
              ["QR สั่งเอง", "กด 'QR สั่งอาหาร' เลือกโต๊ะ จะได้ QR — ลูกค้าสแกนแล้วดูเมนู+สั่งเองที่โต๊ะ ออเดอร์เข้าครัวอัตโนมัติ"],
            ]} />
          </Section>

          <Section id="kitchen" icon={ChefHat} title="ครัว (KDS)">
            <Steps items={[
              ["คิวออเดอร์", "ออเดอร์ที่ส่งมาแสดงเป็นการ์ด เรียงตามเวลา พร้อมตัวเลือก/ส่วนประกอบชุด"],
              ["อัปเดตสถานะ", "กดปุ่มที่รายการ: เริ่มทำ → ทำเสร็จ → เสิร์ฟแล้ว (รายการที่เสิร์ฟจะหายจากคิว)"],
              ["แยกจุด", "ถ้าตั้งค่าครัวหลายจุด เลือก dropdown จุดเพื่อกรองเฉพาะของจุดนั้น"],
            ]} />
          </Section>

          <Section id="booking" icon={CalendarClock} title="จองโต๊ะ">
            <Steps items={[
              ["เพิ่มการจอง", "กรอกชื่อ/เบอร์/จำนวนคน/เวลา/โต๊ะ/มัดจำ"],
              ["จัดการ", "เมื่อลูกค้ามา กด 'มาแล้ว' (โต๊ะเป็นจองแล้ว), หรือ 'ยกเลิก'/'ไม่มา'"],
            ]} />
          </Section>

          <Section id="shift" icon={Clock} title="กะการขาย / นับเงิน">
            <Steps items={[
              ["เปิดกะ", "ใส่เงินสดตั้งต้น เริ่มต้นกะ"],
              ["ระหว่างกะ", "ดูยอดขาย/ขายเงินสด/จำนวนบิล แบบ real-time"],
              ["ปิดกะ", "นับเงินสดจริงในลิ้นชัก ระบบเทียบกับที่ควรมี (ตั้งต้น+ขายเงินสด) แสดงส่วนต่าง"],
              ["เปิดลิ้นชัก", "ปุ่มมุมขวาบนของหน้ากะ เปิดลิ้นชักเงินสดได้เอง"],
            ]} />
          </Section>

          <Section id="attendance" icon={Timer} title="ลงเวลางาน (Attendance)">
            <Steps items={[
              ["ลงเวลาเข้า", "พนักงานเข้าหน้า 'ลงเวลางาน' กด 'ลงเวลาเข้า' (ทุกบทบาทใช้ได้)"],
              ["ลงเวลาออก", "เลิกงานกด 'ลงเวลาออก' ระบบคิดชั่วโมงทำงานให้"],
              ["ดูสรุป", "ตารางแสดงเข้า-ออก + ชั่วโมงรวมของพนักงานย้อนหลัง 7 วัน"],
            ]} />
          </Section>

          <Section id="menu" icon={BookOpen} title="เมนู สูตร ราคาตามเวลา">
            <Steps items={[
              ["จัดการเมนู", "เมนู & ราคา: เพิ่ม/แก้ราคา, toggle 'หมด (86)' เมื่อของหมด"],
              ["บาร์โค้ด", "ใส่บาร์โค้ดในข้อมูลเมนู (ช่อง 'บาร์โค้ด') เพื่อสแกนขายที่ POS ได้"],
              ["ราคาตามเวลา (Happy Hour)", "ในหน้าแก้ไขเมนู เพิ่มช่วงราคา: ชื่อ + ราคา + เวลาเริ่ม-สิ้นสุด + วันในสัปดาห์ + ช่องทาง → ราคานี้ชนะราคาปกติเมื่ออยู่ในช่วงเวลา"],
              ["สูตร/BOM", "ปุ่ม 'สูตร/BOM' กำหนดวัตถุดิบต่อเมนู → ระบบตัดสต็อกอัตโนมัติเมื่อขาย"],
              ["ตัวเลือก/ท็อปปิ้ง", "เมนูผูกกลุ่มตัวเลือก (หวานน้อย/เพิ่มไข่ +10) แสดงตอนสั่ง + คิดราคาเพิ่ม"],
              ["เมนูชุด (combo)", "รวมหลายเมนูเป็นชุด ตัวเลือกในข้อมูลเมนู ครัวเห็นส่วนประกอบ ตัดสต็อกตามส่วนประกอบ"],
              ["ราคาตามช่องทาง", "ตั้งราคา delivery/takeaway ต่างจากทานที่ร้านได้"],
            ]} />
          </Section>

          <Section id="promo" icon={Tag} title="โปรโมชัน & บัตรกำนัล">
            <Steps items={[
              ["ขอบเขตโปร", "เลือกได้: ทั้งบิล / เฉพาะเมนู / เฉพาะหมวด / ซื้อ X แถม Y (BXGY)"],
              ["เงื่อนไข", "ตั้งยอดขั้นต่ำ, เฉพาะสมาชิก, ช่วงเวลาต่อวัน + วันในสัปดาห์, จำกัดจำนวนครั้ง (นับตอนจ่าย)"],
              ["ใช้ที่ POS", "กด 'ใช้โปรโมชัน' เลือกโปร — ระบบคำนวณส่วนลดตามขอบเขต (โปรเฉพาะสมาชิกต้องใส่สมาชิกก่อน)"],
              ["บัตรกำนัล (voucher)", "สร้างโค้ดใช้ครั้งเดียว ลูกค้ากรอกโค้ดที่ POS ระบบหักส่วนลด + mark ใช้แล้ว"],
            ]} />
          </Section>

          <Section id="stock" icon={Boxes} title="คลัง นับสต็อก จัดซื้อ">
            <Steps items={[
              ["คลังสินค้า", "ดูวัตถุดิบคงเหลือ (แดง=ใกล้หมด), ปุ่ม 'ปรับ' เพื่อ รับเข้า/เบิก/ปรับ/นับ"],
              ["นับสต็อก", "นับสต็อก: ใส่จำนวนนับจริงทั้งรอบ ระบบแสดงส่วนต่าง แล้วโพสต์ปรับยอด"],
              ["จัดซื้อ (PO)", "สร้างใบสั่งซื้อให้ผู้ขาย เมื่อของมา กด 'รับของ' → เพิ่มสต็อก + อัปเดตต้นทุน"],
            ]} />
          </Section>

          <Section id="members" icon={Users} title="สมาชิก / แต้ม / ระดับ">
            <Steps items={[
              ["สมาชิก", "เพิ่มสมาชิก, ดูแต้ม/ยอดสะสม/ระดับ. ผูกสมาชิกตอนขายเพื่อสะสมแต้ม (พื้นฐาน 1 แต้ม/25 บาท × ตัวคูณระดับ)"],
              ["โปรแกรมสมาชิก", "ปุ่ม 'โปรแกรมสมาชิก' (manager+): ตั้ง 'ระดับ' (Silver/Gold/Platinum: ยอดสะสมขั้นต่ำ → ตัวคูณแต้ม, เลื่อนชั้นอัตโนมัติ) + 'ของรางวัล' catalog (ใช้แต้มแลก: ส่วนลดบาท / ฟรีเมนู)"],
              ["แลกแต้ม / ของรางวัล", "ที่ POS หรือหน้าสมาชิก: หักแต้มเป็นส่วนลด หรือแลกของรางวัลจาก catalog"],
              ["PDPA", "'ส่งออกข้อมูล' (สิทธิ์เข้าถึงข้อมูล) และ 'ลบข้อมูลส่วนตัว' (ลบ PII เก็บประวัติขายไว้)"],
            ]} />
          </Section>

          <Section id="reports" icon={BarChart3} title="รายงาน / ปิดยอด">
            <Steps items={[
              ["รายงานยอดขาย", "เลือกช่วงเวลา ดูยอดสุทธิ/กำไรขั้นต้น/เมนูขายดี/แยกพนักงาน/รายชั่วโมง. Export CSV ได้"],
              ["ปิดยอด (Z report)", "ปุ่ม 'ปิดยอด (Z)' สรุปยอดรายวัน แยกวิธีชำระ/หมวด/ชั่วโมง/พนักงาน พิมพ์ได้"],
              ["จอลูกค้า (Customer Display)", "เปิดหน้า จอลูกค้า บนจอที่ 2 เลือกโต๊ะ แสดงรายการ+ยอดให้ลูกค้าเห็น"],
            ]} />
          </Section>

          <Section id="integrations" icon={Truck} title="เดลิเวอรี / LINE / e-Tax">
            <p className="text-sm text-gray-600 mb-2">ตัวเชื่อมภายนอก ทำงานโหมด mock จนกว่าจะใส่ key/บัญชีจริง (ดูตั้งค่าสาขา + GO-LIVE)</p>
            <Steps items={[
              ["เดลิเวอรี auto-import", "GrabFood / LINE MAN / ShopeeFood / Robinhood ส่งออเดอร์เข้าระบบอัตโนมัติ (เข้าครัวทันที, มีเลขคิว). ต้องลงทะเบียน webhook + merchant credentials จริงตอน go-live"],
              ["LINE OA ใบเสร็จ", "ส่ง e-receipt เข้า LINE ลูกค้า (ตั้ง LINE channel token ต่อสาขา)"],
              ["e-Tax invoice", "ส่งใบกำกับภาษีอิเล็กทรอนิกส์จากบิลที่จ่ายแล้ว (เปิด e-Tax + ผู้ให้บริการ ETDA). กรอกข้อมูลผู้ซื้อก่อนที่หน้าใบกำกับภาษีเต็มรูป"],
            ]} />
          </Section>

          <Section id="settings" icon={Settings} title="ตั้งค่า / เครื่องพิมพ์">
            <Steps items={[
              ["ผู้ใช้ & สิทธิ์", "เพิ่ม/แก้ผู้ใช้, เปลี่ยนบทบาท, reset PIN, ดูตารางสิทธิ์ + Audit Log"],
              ["ตั้งค่าธุรกิจ", "ชื่อร้าน/ที่อยู่/เลขภาษี, VAT %, service charge %, หัว-ท้ายใบเสร็จ, PromptPay ID"],
              ["เครื่องพิมพ์", "เพิ่มเครื่องพิมพ์ ESC/POS network: ใส่ IP + Port + ประเภท (ใบเสร็จ/ครัว). กดปุ่ม Wifi ทดสอบพิมพ์"],
              ["รับชำระบัตร", "ในตั้งค่าธุรกิจ: เลือก provider (Mock/Omise) ใส่ Omise key เพื่อรับบัตรจริง"],
            ]} />
            <Tip><Printer className="h-3.5 w-3.5 inline" /> เครื่องพิมพ์ต้องต่อ network เดียวกับเครื่อง POS. ใส่ IP เครื่องพิมพ์ → กดทดสอบ → ถ้าพิมพ์ออกแปลว่าพร้อมใช้</Tip>
          </Section>

          <Section id="admin" icon={ShieldCheck} title="เจ้าของระบบ (Platform Admin)">
            <p className="text-sm text-gray-600 mb-2">สำหรับเจ้าของแพลตฟอร์มที่ขายระบบให้หลายร้าน (SaaS) — เข้าด้วยบัญชี super-admin ที่หน้า <b>/admin</b></p>
            <Steps items={[
              ["ร้านสมัครเอง", "ร้านใหม่สมัครที่ /signup → ได้ทดลองฟรี 14 วัน ใช้ได้ทันที"],
              ["เก็บค่าบริการ - บัตร", "ร้านไป /billing เลือกแผน (BASIC 590 / PRO 1990 ต่อเดือน) จ่ายบัตร → ACTIVE +30 วัน + ใบแจ้งหนี้. ตัดบัตรต่ออายุอัตโนมัติทุกเดือน (จ่ายไม่ผ่าน → เตือน 3 วัน → ระงับ)"],
              ["เก็บค่าบริการ - โอน/PromptPay", "ร้านเลือกโอน → สแกน QR/โอน → แนบสลิป → ขึ้น 'รออนุมัติ'. คุณตรวจที่ /admin (แถบเหลือง) กด 'ดูสลิป' → 'อนุมัติ' = เปิด +30 วัน + ใบเสร็จ (หรือ 'ปฏิเสธ')"],
              ["หน้า /admin", "ดู MRR + จำนวนร้าน; อนุมัติสลิปโอน; คลิกเลข 'ผู้ใช้' ดูพนักงานของร้าน; จัดการแต่ละร้าน: เปลี่ยนแผน, เปิด/ระงับ, +30 วัน. (กดปุ่ม 'วิธีใช้' บน /admin ดูคู่มือในหน้า)"],
              ["เปิดเก็บเงินจริง", "ตั้ง env บน host: PLATFORM_OMISE_* (ตัดบัตรจริง) และ/หรือ PLATFORM_PROMPTPAY_ID (โชว์ QR ให้ร้านโอน+แนบสลิป). ไม่ตั้ง = โหมดทดสอบ"],
            ]} />
            <Tip>เงิน 2 ส่วนแยกกัน: (1) <b>ค่าระบบ</b> ที่ร้านจ่ายให้คุณ (บัตร/โอน ที่ /billing) (2) <b>เงินขายของร้าน</b> ที่ร้านเก็บจากลูกค้า (เงินสด/QR/บัตร ในจอขาย ตั้ง Omise ต่อสาขา)</Tip>
          </Section>

          <Section id="tips" icon={Lightbulb} title="เคล็ดลับ & แก้ปัญหา">
            <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
              <li><b>ออฟไลน์:</b> ถ้าเน็ตหลุด ออเดอร์ใหม่ถูกเก็บไว้ในเครื่อง (แสดง 'ออฟไลน์ N รอ sync') และส่งเข้าระบบอัตโนมัติเมื่อกลับมาออนไลน์</li>
              <li><b>ของหมด:</b> ไปเมนู & ราคา toggle 'หมด (86)' เมนูจะกดสั่งไม่ได้</li>
              <li><b>ยกเลิก vs คืนเงิน:</b> Void = บิลที่ยังไม่จ่าย, Refund = บิลที่จ่ายแล้ว (คืนสต็อก+หักแต้ม)</li>
              <li><b>สิทธิ์ไม่พอ:</b> ถ้าเมนูบางอันไม่เห็น แปลว่าบทบาทไม่มีสิทธิ์ — ให้ owner/manager ปรับใน ตั้งค่า</li>
              <li><b>ลืม PIN:</b> ให้ owner/manager ไป ตั้งค่า &gt; ผู้ใช้ กด reset PIN</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, children }: { id: string; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card p-5 scroll-mt-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700"><Icon className="h-4 w-4" /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="space-y-2.5">
      {items.map(([h, d], i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">{i + 1}</span>
          <p className="text-sm text-gray-600 pt-0.5"><b className="text-gray-800">{h}</b> — {d}</p>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
      <Lightbulb className="h-3.5 w-3.5 inline mr-1" /> {children}
    </div>
  );
}
