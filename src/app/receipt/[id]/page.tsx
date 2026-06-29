import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { baht, fmtDateTime } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { PrintButton } from "@/components/PrintButton";
import { RefundButton } from "@/components/RefundButton";
import { ThermalPrintButtons } from "@/components/ThermalPrintButtons";
import { FileText } from "lucide-react";

const TYPE: Record<string, string> = { DINE_IN: "ทานที่ร้าน", TAKEAWAY: "กลับบ้าน", DELIVERY: "เดลิเวอรี" };
const METHOD: Record<string, string> = { CASH: "เงินสด", QR: "QR พร้อมเพย์", CARD: "บัตรเครดิต", DEPOSIT: "มัดจำการจอง" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = Number((await params).id);

  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      items: { where: { status: { not: "VOID" } }, orderBy: { createdAt: "asc" }, include: { options: true } },
      payments: { orderBy: { createdAt: "asc" } },
      table: true,
      member: true,
      branch: true,
      user: { select: { fullName: true } },
    },
  });
  if (!order || order.branchId !== session.branchId) notFound();

  const pays = order.payments.filter((p) => p.amount > 0); // original tenders (hide refund rows)
  const receipt = pays.find((p) => p.method !== "DEPOSIT") ?? pays[0]; // receipt no. = a real tender, not the deposit/refund
  const pointsEarned = order.memberId ? Math.floor(order.netAmount / 25) : 0;

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto w-[320px]">
        <div className="flex flex-col gap-2 mb-3 no-print">
          <div className="flex justify-between">
            <Link href="/reports" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
            <div className="flex gap-2">
              {order.status === "PAID" && hasPermission(session.permissions, PERMISSIONS.ORDER_VOID) && (
                <RefundButton orderId={order.id} />
              )}
              <PrintButton />
            </div>
          </div>
          <div className="flex justify-between">
            <Link href={`/receipt/${order.id}/tax`} className="btn-ghost"><FileText className="h-4 w-4" /> ใบกำกับภาษีเต็มรูป</Link>
            <ThermalPrintButtons orderId={order.id} />
          </div>
        </div>

        {order.status === "REFUNDED" && (
          <div className="mb-3 rounded-lg bg-rose-100 border border-rose-300 text-rose-700 text-center py-2 text-sm font-semibold no-print">
            บิลนี้ถูกคืนเงินแล้ว (REFUNDED)
          </div>
        )}

        <div className="receipt bg-white p-5 rounded-lg shadow print:shadow-none text-[13px] text-gray-800 font-mono">
          <div className="text-center mb-3">
            <h1 className="font-bold text-base">{order.branch.name}</h1>
            {order.branch.address && <p className="text-[11px] text-gray-500">{order.branch.address}</p>}
            {order.branch.phone && <p className="text-[11px] text-gray-500">โทร. {order.branch.phone}</p>}
            {order.branch.taxId && <p className="text-[11px] text-gray-500">เลขผู้เสียภาษี {order.branch.taxId}</p>}
            {order.branch.receiptHeader && <p className="text-[11px] text-gray-600 mt-1">{order.branch.receiptHeader}</p>}
          </div>

          <div className="border-y border-dashed border-gray-300 py-2 text-[11px] space-y-0.5">
            <Row l="เลขที่บิล" r={order.docNo} />
            {receipt && <Row l="ใบเสร็จ" r={receipt.docNo} />}
            <Row l="วันที่" r={fmtDateTime(order.paidAt ?? order.createdAt)} />
            <Row l="ประเภท" r={TYPE[order.orderType] ?? order.orderType} />
            {order.table && <Row l="โต๊ะ" r={order.table.code} />}
            <Row l="พนักงาน" r={order.user.fullName} />
            {order.member && <Row l="สมาชิก" r={order.member.name} />}
          </div>

          <table className="w-full my-2">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-0.5">{i.qty}x</td>
                  <td className="py-0.5">
                    {i.name}
                    {i.options.length > 0 && (
                      <span className="block text-[10px] text-gray-500">{i.options.map((o) => o.name).join(", ")}</span>
                    )}
                  </td>
                  <td className="py-0.5 text-right">{baht(i.lineAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-gray-300 pt-2 text-[12px] space-y-0.5">
            <Row l="ยอดรวม" r={baht(order.subtotal)} />
            {order.discount > 0 && <Row l="ส่วนลด" r={`-${baht(order.discount)}`} />}
            {order.serviceCharge > 0 && <Row l="Service 10%" r={baht(order.serviceCharge)} />}
            <Row l="VAT 7%" r={baht(order.taxAmount)} />
            <div className="flex justify-between font-bold text-sm border-t border-gray-300 mt-1 pt-1">
              <span>สุทธิ</span><span>{baht(order.netAmount)}</span>
            </div>
          </div>

          {pays.length > 0 && (
            <div className="border-t border-dashed border-gray-300 mt-2 pt-2 text-[12px] space-y-0.5">
              {pays.map((p) => (
                <div key={p.id}>
                  <Row l={METHOD[p.method] ?? p.method} r={baht(p.method === "DEPOSIT" ? p.amount : p.received)} />
                  {p.method === "CASH" && p.change > 0 && <Row l="เงินทอน" r={baht(p.change)} />}
                </div>
              ))}
            </div>
          )}

          {pointsEarned > 0 && (
            <p className="text-center text-[11px] text-gray-500 mt-2">ได้รับ {pointsEarned} แต้มสะสม</p>
          )}

          <p className="text-center text-[11px] text-gray-500 mt-3 border-t border-dashed border-gray-300 pt-2">
            {order.branch.receiptFooter || "ขอบคุณที่ใช้บริการ"}<br />*** PkPos ***
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{l}</span><span>{r}</span></div>;
}
