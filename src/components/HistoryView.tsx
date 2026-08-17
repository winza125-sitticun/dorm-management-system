import React, { useState } from "react";
import { CheckCircle2, Clock3, ChevronRight, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Bill } from "../types";

const thb = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

export default function HistoryView({
  bills, canDelete, reload, showToast, onOpenInvoice,
}: { bills: Bill[]; canDelete: boolean; reload: () => Promise<void>; showToast: (m: string) => void; onOpenInvoice: (id: number) => void }) {
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [confirmDelete, setConfirmDelete] = useState<Bill | null>(null);

  const filtered = bills
    .filter((b) => (filter === "all" ? true : b.status === filter))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  async function toggleStatus(b: Bill) {
    await api.bills.setStatus(b.id, b.status === "paid" ? "unpaid" : "paid");
    await reload();
  }

  async function doDelete() {
    if (!confirmDelete) return;
    await api.bills.remove(confirmDelete.id);
    setConfirmDelete(null);
    await reload();
    showToast("ลบบิลแล้ว");
  }

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "all", label: "ทั้งหมด" },
    { key: "unpaid", label: "ค้างชำระ" },
    { key: "paid", label: "ชำระแล้ว" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-5">ประวัติการออกบิล</h1>
      <div className="flex gap-1.5 mb-4.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-md px-3.5 py-1.5 text-sm border ${filter === t.key ? "bg-ink text-white border-ink" : "border-line text-inkSoft"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-inkSoft">ไม่มีบิลในหมวดนี้</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((b) => (
            <div key={b.id} className="bg-white border border-line rounded-lg px-4 py-3.5 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-brassPale flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-xs font-medium text-brassDeep">{b.roomNumber}</span>
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenInvoice(b.id)}>
                <div className="text-sm font-medium">{b.tenantName || `ห้อง ${b.roomNumber}`}</div>
                <div className="text-xs text-inkSoft">{monthLabel(b.month)}</div>
              </div>
              <div className="font-mono text-[14.5px] font-medium whitespace-nowrap">{thb(Number(b.total))}</div>
              <button
                onClick={() => toggleStatus(b)}
                className={`rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5 ${b.status === "paid" ? "bg-tealPale text-teal" : "bg-rustPale text-rust"}`}
              >
                {b.status === "paid" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                {b.status === "paid" ? "ชำระแล้ว" : "ค้างชำระ"}
              </button>
              <button onClick={() => onOpenInvoice(b.id)} className="p-2 text-inkSoft"><ChevronRight size={15} /></button>
              {canDelete && (
                <button onClick={() => setConfirmDelete(b)} className="p-2 text-rust"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5.5" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-lg font-semibold mb-3">ยืนยันการลบ</div>
            <div className="text-sm text-inkSoft mb-4.5">
              ต้องการลบบิลห้อง {confirmDelete.roomNumber} ({monthLabel(confirmDelete.month)}) ใช่หรือไม่
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="border border-line rounded-md px-4 py-2 text-sm">ยกเลิก</button>
              <button onClick={doDelete} className="bg-rust text-white rounded-md px-4 py-2 text-sm">ลบเลย</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
