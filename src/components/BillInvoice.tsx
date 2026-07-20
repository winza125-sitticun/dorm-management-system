import React from "react";
import { ArrowLeft, Copy, Printer, CheckCircle2, Send } from "lucide-react";
import { api } from "../lib/api";
import type { Bill, Settings } from "../types";

const thb = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13.5px] py-1.5">
      <span className="text-inkSoft">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function BillInvoice({
  bill, settings, onBack, reload, showToast,
}: { bill: Bill; settings: Settings; onBack: () => void; reload: () => Promise<void>; showToast: (m: string) => void }) {
  const lineMessage = `📋 ใบแจ้งหนี้ ${settings.dormName}
ห้อง ${bill.roomNumber} — ${monthLabel(bill.month)}
ค่าเช่า: ${thb(Number(bill.rent))}
ค่าน้ำ (${bill.waterUnits} หน่วย): ${thb(Number(bill.waterCost))}
ค่าไฟ (${bill.electricUnits} หน่วย): ${thb(Number(bill.electricCost))}
${Number(bill.extraFee) ? `${bill.extraLabel || "อื่นๆ"}: ${thb(Number(bill.extraFee))}\n` : ""}รวมทั้งสิ้น: ${thb(Number(bill.total))}
กำหนดชำระ: ${new Date(bill.dueDate).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
พร้อมเพย์: ${settings.promptpayId} (${settings.accountName})`;

  function copyMessage() {
    navigator.clipboard?.writeText(lineMessage).then(() => showToast("คัดลอกข้อความแล้ว"));
  }

  async function toggleStatus() {
    await api.bills.setStatus(bill.id, bill.status === "paid" ? "unpaid" : "paid");
    await reload();
  }

  async function resendLine() {
    const result = await api.bills.notify(bill.id);
    if (result.ok) { showToast("ส่ง LINE แจ้งเตือนแล้ว"); await reload(); }
    else showToast(result.error || "ส่ง LINE ไม่สำเร็จ");
  }

  return (
    <div>
      <div className="no-print flex justify-between items-center mb-5 flex-wrap gap-2">
        <button onClick={onBack} className="border border-line rounded-md px-3.5 py-2 text-sm flex items-center gap-1.5"><ArrowLeft size={14} />กลับ</button>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyMessage} className="border border-line rounded-md px-3.5 py-2 text-sm flex items-center gap-1.5"><Copy size={14} />คัดลอกข้อความ LINE</button>
          <button onClick={resendLine} className="border border-line rounded-md px-3.5 py-2 text-sm flex items-center gap-1.5"><Send size={14} />ส่ง LINE แจ้งเตือน</button>
          <button onClick={() => window.print()} className="border border-line rounded-md px-3.5 py-2 text-sm flex items-center gap-1.5"><Printer size={14} />พิมพ์ / บันทึก PDF</button>
          <button onClick={toggleStatus} className="bg-brass text-white rounded-md px-3.5 py-2 text-sm flex items-center gap-1.5">
            <CheckCircle2 size={14} />{bill.status === "paid" ? "ทำเครื่องหมายค้างชำระ" : "ทำเครื่องหมายชำระแล้ว"}
          </button>
        </div>
      </div>

      <div className="print-area bg-white border border-line rounded-2xl p-8.5 max-w-xl mx-auto relative">
        <div className="absolute top-7 right-8.5">
          <span className={`stamp ${bill.status === "paid" ? "text-teal" : "text-rust"}`}>
            {bill.status === "paid" ? "ชำระแล้ว" : "ค้างชำระ"}
          </span>
        </div>
        <div className="mb-6.5">
          <div className="text-[11.5px] tracking-widest text-brassDeep uppercase mb-1.5">ใบแจ้งหนี้</div>
          <div className="font-display text-2xl font-semibold">{settings.dormName}</div>
        </div>

        <div className="flex justify-between mb-5.5 text-[13.5px]">
          <div>
            <div className="text-inkSoft text-[11.5px] mb-0.5">เรียกเก็บจาก</div>
            <div className="font-medium">{bill.tenantName || "-"}</div>
            <div className="text-inkSoft">ห้อง {bill.roomNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-inkSoft text-[11.5px] mb-0.5">รอบบิล</div>
            <div className="font-medium">{monthLabel(bill.month)}</div>
            <div className="text-inkSoft">ครบกำหนด {new Date(bill.dueDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
        </div>

        <div className="border-t border-b border-line py-3.5 mb-4.5">
          <Row label="ค่าเช่าห้องพัก" value={thb(Number(bill.rent))} />
          <Row label={`ค่าน้ำ (${bill.waterOld} → ${bill.waterNew}, ${bill.waterUnits} หน่วย)`} value={thb(Number(bill.waterCost))} />
          <Row label={`ค่าไฟ (${bill.electricOld} → ${bill.electricNew}, ${bill.electricUnits} หน่วย)`} value={thb(Number(bill.electricCost))} />
          {Number(bill.extraFee) > 0 && <Row label={bill.extraLabel || "ค่าใช้จ่ายอื่น"} value={thb(Number(bill.extraFee))} />}
        </div>

        <div className="flex justify-between items-baseline mb-6">
          <span className="text-sm font-medium">ยอดชำระทั้งสิ้น</span>
          <span className="font-display text-[26px] font-semibold text-brassDeep">{thb(Number(bill.total))}</span>
        </div>

        <div className="bg-paperDeep rounded-lg p-4 flex gap-3.5 items-center">
          <div className="w-14 h-14 rounded-lg flex-shrink-0 border border-line" style={{ background: "repeating-conic-gradient(#1E2A38 0% 25%, #fff 0% 50%) 0 0 / 12px 12px" }} />
          <div>
            <div className="text-xs text-inkSoft mb-0.5">สแกนชำระผ่านพร้อมเพย์</div>
            <div className="font-mono text-sm font-medium">{settings.promptpayId}</div>
            <div className="text-xs text-inkSoft">{settings.accountName}</div>
          </div>
        </div>
        <div className="text-[11px] text-inkFaint mt-3.5 text-center">
          ค่าปรับล่าช้า {thb(Number(settings.lateFeePerDay))} ต่อวัน หากชำระหลังวันครบกำหนด
          {bill.lineNotified && <span className="block mt-1 text-teal">✓ ส่ง LINE แจ้งเตือนแล้ว</span>}
        </div>
      </div>
    </div>
  );
}
