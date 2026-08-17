import React, { useEffect, useState } from "react";
import { Droplet, Zap } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Room, Settings } from "../types";

const thb = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function CreateBillView({
  rooms, settings, onCreated, onCancel,
}: { rooms: Room[]; settings: Settings; onCreated: (id: number, lineResult: any) => void; onCancel: () => void }) {
  const eligibleRooms = rooms.filter((r) => r.status === "occupied");
  const [roomId, setRoomId] = useState<number | "">(eligibleRooms[0]?.id ?? "");
  const [month, setMonth] = useState(currentMonth());
  const [waterNew, setWaterNew] = useState("");
  const [electricNew, setElectricNew] = useState("");
  const [extraFee, setExtraFee] = useState("0");
  const [extraLabel, setExtraLabel] = useState("");
  const [rentOverride, setRentOverride] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const room = rooms.find((r) => r.id === roomId);

  useEffect(() => {
    setWaterNew("");
    setElectricNew("");
    setRentOverride(null);
  }, [roomId]);

  if (eligibleRooms.length === 0) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold mb-6">สร้างบิลใหม่</h1>
        <div className="text-center py-12 text-inkSoft">ไม่มีห้องที่มีผู้เช่า — เพิ่มผู้เช่าในหน้าห้องพักก่อน</div>
      </div>
    );
  }

  const waterRate = Number(settings.waterRate);
  const electricRate = Number(settings.electricRate);
  const waterUnits = Math.max(0, (Number(waterNew) || 0) - (room?.lastWater || 0));
  const electricUnits = Math.max(0, (Number(electricNew) || 0) - (room?.lastElectric || 0));
  const waterCost = waterUnits * waterRate;
  const electricCost = electricUnits * electricRate;
  const rent = rentOverride ?? Number(room?.rent ?? 0);
  const total = rent + waterCost + electricCost + (Number(extraFee) || 0);

  const dueDate = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, settings.dueDay);
  })();

  async function submit() {
    if (!room) return;
    setBusy(true);
    setError("");
    try {
      const { bill, lineResult } = await api.bills.create({
        roomId: room.id,
        month,
        waterNew: Number(waterNew) || room.lastWater,
        electricNew: Number(electricNew) || room.lastElectric,
        rent,
        extraFee: Number(extraFee) || 0,
        extraLabel,
      });
      onCreated(bill.id, lineResult);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "สร้างบิลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">สร้างบิลใหม่</h1>
      <div className="flex gap-5.5 flex-wrap">
        <div className="flex-1 min-w-[340px] bg-white border border-line rounded-xl p-5.5">
          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1">
              <label className="text-xs text-inkSoft mb-1 block">ห้องพัก</label>
              <select className="w-full border border-line rounded-md px-3 py-2 text-sm" value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
                {eligibleRooms.map((r) => (
                  <option key={r.id} value={r.id}>ห้อง {r.number} — {r.tenantName}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-inkSoft mb-1 block">รอบบิลเดือน</label>
              <input type="month" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>

          <div className="bg-paperDeep rounded-lg p-3.5 mb-3.5">
            <div className="flex items-center gap-1.5 text-[12.5px] text-inkSoft mb-2">
              <Droplet size={13} className="text-teal" /> ค่าน้ำ (บาทละ {waterRate} / หน่วย)
            </div>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <label className="text-xs text-inkSoft mb-1 block">มิเตอร์เก่า</label>
                <input disabled className="w-full border border-line rounded-md px-3 py-2 text-sm bg-[#F5F2E9] text-inkFaint" value={room?.lastWater ?? 0} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-inkSoft mb-1 block">มิเตอร์ใหม่</label>
                <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={waterNew} onChange={(e) => setWaterNew(e.target.value)} placeholder={String(room?.lastWater ?? 0)} />
              </div>
            </div>
            <div className="text-[12.5px] text-inkSoft mt-2 font-mono">ใช้ไป {waterUnits} หน่วย · {thb(waterCost)}</div>
          </div>

          <div className="bg-paperDeep rounded-lg p-3.5 mb-3.5">
            <div className="flex items-center gap-1.5 text-[12.5px] text-inkSoft mb-2">
              <Zap size={13} className="text-brass" /> ค่าไฟ (บาทละ {electricRate} / หน่วย)
            </div>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <label className="text-xs text-inkSoft mb-1 block">มิเตอร์เก่า</label>
                <input disabled className="w-full border border-line rounded-md px-3 py-2 text-sm bg-[#F5F2E9] text-inkFaint" value={room?.lastElectric ?? 0} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-inkSoft mb-1 block">มิเตอร์ใหม่</label>
                <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={electricNew} onChange={(e) => setElectricNew(e.target.value)} placeholder={String(room?.lastElectric ?? 0)} />
              </div>
            </div>
            <div className="text-[12.5px] text-inkSoft mt-2 font-mono">ใช้ไป {electricUnits} หน่วย · {thb(electricCost)}</div>
          </div>

          <div className="flex gap-2.5 mb-1.5">
            <div className="flex-1">
              <label className="text-xs text-inkSoft mb-1 block">ค่าเช่า (แก้ไขได้)</label>
              <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={rent} onChange={(e) => setRentOverride(Number(e.target.value))} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-inkSoft mb-1 block">ค่าใช้จ่ายอื่น (ถ้ามี)</label>
              <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={extraFee} onChange={(e) => setExtraFee(e.target.value)} />
            </div>
          </div>
          {Number(extraFee) > 0 && (
            <div>
              <label className="text-xs text-inkSoft mb-1 block">รายการค่าใช้จ่ายอื่น</label>
              <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} placeholder="เช่น ค่าซ่อมแอร์" />
            </div>
          )}
          {error && <div className="text-[12.5px] text-rust bg-rustPale rounded-md px-2.5 py-2 mt-3">{error}</div>}
        </div>

        <div className="flex-none min-w-[240px] w-[280px]">
          <div className="bg-ink rounded-xl p-5.5 text-white sticky top-0">
            <div className="text-xs text-inkFaint mb-1 uppercase tracking-wider">สรุปยอด</div>
            <div className="font-display text-[30px] font-semibold mb-4">{thb(total)}</div>
            <div className="flex flex-col gap-1.5 text-[13px] mb-4.5">
              <div className="flex justify-between"><span className="opacity-70">ค่าเช่า</span><span className="font-mono">{thb(rent)}</span></div>
              <div className="flex justify-between"><span className="opacity-70">ค่าน้ำ</span><span className="font-mono">{thb(waterCost)}</span></div>
              <div className="flex justify-between"><span className="opacity-70">ค่าไฟ</span><span className="font-mono">{thb(electricCost)}</span></div>
              {Number(extraFee) > 0 && <div className="flex justify-between"><span className="opacity-70">{extraLabel || "อื่นๆ"}</span><span className="font-mono">{thb(Number(extraFee))}</span></div>}
            </div>
            <div className="text-[11.5px] opacity-65 mb-4.5">
              กำหนดชำระ {dueDate.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
            </div>
            {room?.lineUserId ? (
              <div className="text-[11px] opacity-60 mb-3">จะส่ง LINE แจ้งเตือนไปยังผู้เช่าอัตโนมัติ</div>
            ) : (
              <div className="text-[11px] opacity-60 mb-3">ห้องนี้ยังไม่ได้ผูก LINE — จะไม่มีการแจ้งเตือนอัตโนมัติ</div>
            )}
            <button onClick={submit} disabled={busy} className="w-full justify-center bg-brass rounded-md py-2.5 text-sm font-medium disabled:opacity-60">
              {busy ? "กำลังออกบิล..." : "ออกบิลนี้"}
            </button>
            <button onClick={onCancel} className="w-full justify-center border border-white/20 rounded-md py-2.5 text-sm mt-2 text-white">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
