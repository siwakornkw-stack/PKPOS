import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { baht, num, fmtDateTime, round2 } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";
import { BuyerForm } from "@/components/BuyerForm";

export default async function TaxInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = Number((await params).id);

  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      items: { where: { status: { not: "VOID" } }, orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      table: true,
      member: true,
      branch: true,
      user: { select: { fullName: true } },
    },
  });
  if (!order || order.branchId !== session.branchId) notFound();

  const goodsValue = round2(order.subtotal - order.discount - order.pointsDiscount + order.serviceCharge);

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto w-[720px] max-w-full">
        <div className="flex justify-between mb-3 no-print">
          <Link href="/reports" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
          <PrintButton />
        </div>

        <BuyerForm orderId={order.id} initial={{ buyerName: order.buyerName, buyerTaxId: order.buyerTaxId, buyerAddress: order.buyerAddress }} />

        <div className="receipt bg-white p-8 rounded-lg shadow print:shadow-none text-[13px] text-gray-800">
          <div className="text-center mb-5">
            <h1 className="font-bold text-lg">ใบกำกับภาษี/ใบเสร็จรับเงิน (ต้นฉบับ)</h1>
            <p className="text-[12px] text-gray-500">ใบกำกับภาษีเต็มรูป</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border border-gray-300 rounded-lg p-3">
              <p className="text-[11px] text-gray-500 mb-1">ผู้ขาย</p>
              <p className="font-bold">{order.branch.name}</p>
              {order.branch.address && <p className="text-[12px] text-gray-600">{order.branch.address}</p>}
              {order.branch.phone && <p className="text-[12px] text-gray-600">โทร. {order.branch.phone}</p>}
              <p className="text-[12px] text-gray-600">
                เลขประจำตัวผู้เสียภาษี {order.branch.taxId || "-"}
              </p>
            </div>

            <div className="border border-gray-300 rounded-lg p-3">
              <p className="text-[11px] text-gray-500 mb-1">ผู้ซื้อ</p>
              {order.buyerName || order.buyerTaxId || order.buyerAddress ? (
                <>
                  <p className="font-bold">{order.buyerName || order.member?.name || "-"}</p>
                  {order.buyerAddress && <p className="text-[12px] text-gray-600">{order.buyerAddress}</p>}
                  <p className="text-[12px] text-gray-600">เลขประจำตัวผู้เสียภาษี {order.buyerTaxId || "____________________"}</p>
                </>
              ) : order.member ? (
                <>
                  <p className="font-bold">{order.member.name}</p>
                  {order.member.phone && <p className="text-[12px] text-gray-600">โทร. {order.member.phone}</p>}
                  <p className="text-[12px] text-gray-600">เลขประจำตัวผู้เสียภาษี ____________________</p>
                </>
              ) : (
                <>
                  <p className="text-[12px] text-gray-400">ชื่อ ____________________________</p>
                  <p className="text-[12px] text-gray-400 mt-1">ที่อยู่ __________________________</p>
                  <p className="text-[12px] text-gray-400 mt-1">เลขประจำตัวผู้เสียภาษี ___________</p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between text-[12px] text-gray-600 mb-3 px-1">
            <span>เลขที่เอกสาร: <span className="font-semibold text-gray-800">{order.docNo}</span></span>
            <span>วันที่: <span className="font-semibold text-gray-800">{fmtDateTime(order.paidAt ?? order.createdAt)}</span></span>
          </div>

          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1.5 text-left">รายการ</th>
                <th className="border border-gray-300 px-2 py-1.5 text-center w-16">จำนวน</th>
                <th className="border border-gray-300 px-2 py-1.5 text-right w-28">ราคาต่อหน่วย</th>
                <th className="border border-gray-300 px-2 py-1.5 text-right w-28">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="border border-gray-300 px-2 py-1.5">{i.name}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">{num(i.qty)}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{baht(i.unitPrice)}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{baht(i.lineAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-72 text-[12px] space-y-1">
              {/* break out the components so the line items reconcile to the taxable base:
                  items subtotal - discount + service charge = มูลค่าที่ต้องเสียภาษี */}
              <Row l="รวมเป็นเงิน" r={baht(order.subtotal)} />
              {round2(order.discount + order.pointsDiscount) > 0 && (
                <Row l="ส่วนลด" r={`-${baht(round2(order.discount + order.pointsDiscount))}`} />
              )}
              {order.serviceCharge > 0 && <Row l="ค่าบริการ" r={baht(order.serviceCharge)} />}
              <Row l="มูลค่าที่ต้องเสียภาษี" r={baht(goodsValue)} />
              <Row l="ภาษีมูลค่าเพิ่ม 7%" r={baht(order.taxAmount)} />
              <div className="flex justify-between font-bold text-sm border-t border-gray-300 mt-1 pt-1.5">
                <span>จำนวนเงินรวมทั้งสิ้น</span><span>{baht(order.netAmount)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-10 text-[12px] text-gray-600">
            <div className="text-center">
              <p className="border-t border-gray-400 pt-1 mx-6">ผู้รับเงิน</p>
            </div>
            <div className="text-center">
              <p className="border-t border-gray-400 pt-1 mx-6">ผู้รับสินค้า/ผู้ซื้อ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{l}</span><span>{r}</span></div>;
}
