import React, { useState } from "react";
import { Plus, Pencil, Trash2, Gauge, X, AlertTriangle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Room } from "../types";

const thb = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Math.round(n || 0));

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="font-display text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="p-1.5 text-inkSoft"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RoomModal({ room, onClose, onSaved }: { room: Partial<Room> | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !room?.id;
  const [form, setForm] = useState({
    number: room?.number || "",
    tenantName: room?.tenantName || "",
    tenantPhone: room?.tenantPhone || "",
    rent: room?.rent ? Number(room.rent) : 3000,
    status: room?.status || "vacant",
    lastWater: room?.lastWater ?? 0,
    lastElectric: room?.lastElectric ?? 0,
    lineUserId: room?.lineUserId || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.number.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (isNew) await api.rooms.create(form as any);
      else await api.rooms.update(room!.id!, form as any);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? "เพิ่มห้องพัก" : `แก้ไขห้อง ${room?.number}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">หมายเลขห้อง</label>
            <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.number} onChange={(e) => set("number", e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">สถานะ</label>
            <select className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="vacant">ห้องว่าง</option>
              <option value="occupied">มีผู้เช่า</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-inkSoft mb-1 block">ชื่อผู้เช่า</label>
          <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.tenantName} onChange={(e) => set("tenantName", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-inkSoft mb-1 block">เบอร์โทรผู้เช่า</label>
          <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.tenantPhone} onChange={(e) => set("tenantPhone", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-inkSoft mb-1 block">ค่าเช่าต่อเดือน (บาท)</label>
          <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.rent} onChange={(e) => set("rent", Number(e.target.value))} />
        </div>
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">เลขมิเตอร์น้ำล่าสุด</label>
            <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.lastWater} onChange={(e) => set("lastWater", Number(e.target.value))} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">เลขมิเตอร์ไฟล่าสุด</label>
            <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.lastElectric} onChange={(e) => set("lastElectric", Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="text-xs text-inkSoft mb-1 block">LINE User ID ผู้เช่า (สำหรับแจ้งเตือนบิลอัตโนมัติ)</label>
          <input className="w-full border border-line rounded-md px-3 py-2 text-sm font-mono" value={form.lineUserId} onChange={(e) => set("lineUserId", e.target.value)} placeholder="U1234567890abcdef..." />
        </div>
        {error && <div className="text-[12.5px] text-rust bg-rustPale rounded-md px-2.5 py-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} className="border border-line rounded-md px-4 py-2 text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={busy || !form.number.trim()} className="bg-brass text-white rounded-md px-4 py-2 text-sm disabled:opacity-50">บันทึก</button>
        </div>
      </div>
    </Modal>
  );
}

export default function RoomsView({
  rooms, canDelete, reload, showToast, onViewMeter,
}: { rooms: Room[]; canDelete: boolean; reload: () => Promise<void>; showToast: (m: string) => void; onViewMeter: (id: number) => void }) {
  const [modal, setModal] = useState<{ open: boolean; room: Partial<Room> | null }>({ open: false, room: null });
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

  async function doDelete() {
    if (!confirmDelete) return;
    await api.rooms.remove(confirmDelete.id);
    setConfirmDelete(null);
    await reload();
    showToast("ลบห้องพักแล้ว");
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="text-[11.5px] tracking-widest text-brassDeep uppercase mb-1">จัดการห้องพัก</div>
          <h1 className="font-display text-2xl font-semibold">ห้องพักทั้งหมด</h1>
        </div>
        <button onClick={() => setModal({ open: true, room: {} })} className="bg-brass text-white rounded-md px-4 py-2 text-sm font-medium flex items-center gap-1.5">
          <Plus size={15} />เพิ่มห้องพัก
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-12 text-inkSoft">ยังไม่มีห้องพัก — เพิ่มห้องแรกของคุณได้เลย</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
          {rooms.map((r) => (
            <div key={r.id} className="bg-white border border-line rounded-xl p-4">
              <div className="flex justify-between items-start mb-2.5">
                <div className="font-display text-xl font-semibold">ห้อง {r.number}</div>
                <span className={`text-[10.5px] px-2.5 py-0.5 rounded-full font-medium ${r.status === "occupied" ? "bg-tealPale text-teal" : "bg-paperDeep text-inkSoft"}`}>
                  {r.status === "occupied" ? "มีผู้เช่า" : "ห้องว่าง"}
                </span>
              </div>
              <div className="text-[13px] text-inkSoft mb-0.5">{r.tenantName || "— ไม่มีผู้เช่า —"}</div>
              {r.tenantPhone && <div className="text-xs text-inkFaint mb-2.5">{r.tenantPhone}</div>}
              <div className="font-mono text-[15px] font-medium text-brassDeep mb-3">{thb(Number(r.rent))} / เดือน</div>
              <button onClick={() => onViewMeter(r.id)} className="w-full justify-center border border-line rounded-md py-1.5 mb-2.5 text-[12.5px] flex items-center gap-1.5 text-inkSoft hover:bg-paperDeep">
                <Gauge size={13} />ดูประวัติมิเตอร์
              </button>
              <div className="flex gap-2 border-t border-line pt-2.5">
                <button onClick={() => setModal({ open: true, room: r })} className="flex-1 justify-center border border-line rounded-md py-1.5 text-sm flex items-center gap-1.5">
                  <Pencil size={13} />แก้ไข
                </button>
                {canDelete && (
                  <button onClick={() => setConfirmDelete(r)} className="border border-rustPale text-rust rounded-md px-2.5 py-1.5">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && <RoomModal room={modal.room} onClose={() => setModal({ open: false, room: null })} onSaved={reload} />}

      {confirmDelete && (
        <Modal title="ยืนยันการลบ" onClose={() => setConfirmDelete(null)}>
          <div className="flex gap-2.5 mb-4.5">
            <AlertTriangle size={19} className="text-rust flex-shrink-0 mt-0.5" />
            <div className="text-sm text-inkSoft leading-relaxed">
              ต้องการลบห้อง <strong className="text-ink">{confirmDelete.number}</strong> ใช่หรือไม่ บิลที่เกี่ยวข้องกับห้องนี้จะถูกลบไปด้วย การลบไม่สามารถย้อนกลับได้
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="border border-line rounded-md px-4 py-2 text-sm">ยกเลิก</button>
            <button onClick={doDelete} className="bg-rust text-white rounded-md px-4 py-2 text-sm">ลบเลย</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
