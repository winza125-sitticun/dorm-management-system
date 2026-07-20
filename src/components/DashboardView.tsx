import React, { useMemo, useState } from "react";
import { Home, Users, Wallet, AlertTriangle, Plus, ChevronRight } from "lucide-react";
import type { Room, Bill } from "../types";

const thb = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

function StatCard({ icon: Icon, label, value, accent, onClick }: any) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-line rounded-xl px-4.5 py-4 flex-1 min-w-[160px] cursor-pointer hover:border-current transition"
      style={{ color: accent }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: accent + "20" }}>
            <Icon size={15} color={accent} />
          </div>
          <span className="text-[12.5px] text-inkSoft">{label}</span>
        </div>
        {onClick && <ChevronRight size={14} className="text-inkFaint" />}
      </div>
      <div className="font-display text-[26px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function DetailModal({ title, items, onClose, onOpenInvoice }: { title: string; items: Bill[]; onClose: () => void; onOpenInvoice: (id: number) => void }) {
  return (
    <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold mb-4">{title}</div>
        {items.length === 0 ? (
          <div className="text-sm text-inkFaint py-4">ไม่มีรายการ</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenInvoice(b.id)}
                className="flex justify-between items-center p-2.5 rounded-lg cursor-pointer border border-line hover:bg-paperDeep"
              >
                <div>
                  <div className="text-[13.5px] font-medium">ห้อง {b.roomNumber} — {b.tenantName || "-"}</div>
                  <div className="text-[11.5px] text-inkSoft">{monthLabel(b.month)}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[13.5px]">{thb(Number(b.total))}</div>
                  <div className={`text-[10.5px] ${b.status === "paid" ? "text-teal" : "text-rust"}`}>
                    {b.status === "paid" ? "ชำระแล้ว" : "ค้างชำระ"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardView({
  rooms, bills, onGoBill, onOpenInvoice,
}: { rooms: Room[]; bills: Bill[]; onGoBill: () => void; onOpenInvoice: (id: number) => void }) {
  const [detail, setDetail] = useState<{ title: string; items: Bill[] } | null>(null);
  const occupied = rooms.filter((r) => r.status === "occupied");
  const occupancyRate = rooms.length ? Math.round((occupied.length / rooms.length) * 100) : 0;
  const thisMonthPaid = bills.filter((b) => b.month === currentMonth() && b.status === "paid");
  const revenueThisMonth = thisMonthPaid.reduce((s, b) => s + Number(b.total), 0);
  const unpaidBills = bills.filter((b) => b.status === "unpaid");
  const outstanding = unpaidBills.reduce((s, b) => s + Number(b.total), 0);
  const recent = [...bills].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5);

  const last6Months = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthBills = bills.filter((b) => b.month === ym && b.status === "paid");
      const sum = monthBills.reduce((s, b) => s + Number(b.total), 0);
      arr.push({ ym, label: d.toLocaleDateString("th-TH", { month: "short" }), sum, bills: monthBills });
    }
    return arr;
  }, [bills]);
  const maxRevenue = Math.max(1, ...last6Months.map((m) => m.sum));

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="text-[11.5px] tracking-widest text-brassDeep uppercase mb-1">ภาพรวม</div>
          <h1 className="font-display text-2xl font-semibold">แดชบอร์ด</h1>
        </div>
        <button onClick={onGoBill} className="bg-brass text-white rounded-md px-4 py-2 text-sm font-medium flex items-center gap-1.5">
          <Plus size={15} />สร้างบิลใหม่
        </button>
      </div>

      <div className="flex gap-3.5 flex-wrap mb-6">
        <StatCard icon={Home} label="ห้องพักทั้งหมด" value={rooms.length} accent="#A9814A" />
        <StatCard icon={Users} label="ห้องมีผู้เช่า" value={`${occupied.length} (${occupancyRate}%)`} accent="#3E6E64" />
        <StatCard icon={Wallet} label="รายรับเดือนนี้" value={thb(revenueThisMonth)} accent="#3E6E64" onClick={() => setDetail({ title: `รายรับเดือน ${monthLabel(currentMonth())}`, items: thisMonthPaid })} />
        <StatCard icon={AlertTriangle} label="ยอดค้างชำระ" value={thb(outstanding)} accent="#B5502F" onClick={() => setDetail({ title: "บิลค้างชำระทั้งหมด", items: unpaidBills })} />
      </div>

      <div className="flex gap-4.5 flex-wrap">
        <div className="flex-1 min-w-[320px] bg-white border border-line rounded-xl p-5">
          <div className="text-sm font-medium mb-4">รายรับ 6 เดือนล่าสุด</div>
          <div className="flex items-end gap-3 h-36">
            {last6Months.map((m) => (
              <div key={m.ym} className="flex-1 flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => setDetail({ title: `รายรับเดือน ${monthLabel(m.ym)}`, items: m.bills })}>
                <div className="text-[10.5px] text-inkSoft font-mono">{m.sum > 0 ? thb(m.sum).replace("฿", "") : ""}</div>
                <div className="w-full rounded-t" style={{ height: Math.max(4, (m.sum / maxRevenue) * 90), background: m.sum > 0 ? "#A9814A" : "#F1ECE0" }} />
                <div className="text-[11.5px] text-inkSoft">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-[280px] bg-white border border-line rounded-xl p-5">
          <div className="text-sm font-medium mb-3.5">บิลล่าสุด</div>
          {recent.length === 0 ? (
            <div className="text-[13px] text-inkFaint py-2.5">ยังไม่มีบิลในระบบ</div>
          ) : (
            <div className="flex flex-col gap-1">
              {recent.map((b) => (
                <div key={b.id} onClick={() => onOpenInvoice(b.id)} className="flex justify-between items-center p-2 rounded-md cursor-pointer hover:bg-paperDeep">
                  <div>
                    <div className="text-[13.5px] font-medium">ห้อง {b.roomNumber}</div>
                    <div className="text-[11.5px] text-inkSoft">{monthLabel(b.month)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[13px]">{thb(Number(b.total))}</div>
                    <div className={`text-[10.5px] ${b.status === "paid" ? "text-teal" : "text-rust"}`}>
                      {b.status === "paid" ? "ชำระแล้ว" : "ค้างชำระ"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {detail && <DetailModal title={detail.title} items={detail.items} onClose={() => setDetail(null)} onOpenInvoice={(id) => { setDetail(null); onOpenInvoice(id); }} />}
    </div>
  );
}
