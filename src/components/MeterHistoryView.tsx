import React from "react";
import { Droplet, Zap, Gauge } from "lucide-react";
import type { Room, Bill } from "../types";

const thb = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

export default function MeterHistoryView({
  rooms, bills, roomId, setRoomId,
}: { rooms: Room[]; bills: Bill[]; roomId: number | null; setRoomId: (id: number) => void }) {
  const activeRoomId = roomId && rooms.some((r) => r.id === roomId) ? roomId : rooms[0]?.id;
  const room = rooms.find((r) => r.id === activeRoomId);

  const roomBills = bills
    .filter((b) => b.roomId === activeRoomId)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 6);
  const chronological = [...roomBills].reverse();

  const maxWater = Math.max(1, ...chronological.map((b) => b.waterUnits));
  const maxElectric = Math.max(1, ...chronological.map((b) => b.electricUnits));

  if (rooms.length === 0) {
    return <div className="text-center py-12 text-inkSoft">ยังไม่มีห้องพัก</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-semibold">ประวัติมิเตอร์ย้อนหลัง 6 เดือน</h1>
        <select className="border border-line rounded-md px-3 py-2 text-sm w-56" value={activeRoomId} onChange={(e) => setRoomId(Number(e.target.value))}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>ห้อง {r.number}{r.tenantName ? ` — ${r.tenantName}` : ""}</option>
          ))}
        </select>
      </div>

      {chronological.length === 0 ? (
        <div className="text-center py-12 text-inkSoft">ห้อง {room?.number} ยังไม่เคยออกบิล ประวัติจะปรากฏหลังสร้างบิลครั้งแรก</div>
      ) : (
        <>
          <div className="bg-white border border-line rounded-xl p-5 mb-4.5">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-sm font-medium">หน่วยการใช้งานรายเดือน</div>
              <div className="flex gap-3.5 ml-auto text-[11.5px] text-inkSoft">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal inline-block" />น้ำ</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brass inline-block" />ไฟ</span>
              </div>
            </div>
            <div className="flex items-end gap-4 h-36">
              {chronological.map((b) => (
                <div key={b.id} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="flex items-end gap-1 h-[90px]">
                    <div className="w-3.5 bg-teal rounded-t" style={{ height: Math.max(4, (b.waterUnits / maxWater) * 90) }} title={`น้ำ ${b.waterUnits} หน่วย`} />
                    <div className="w-3.5 bg-brass rounded-t" style={{ height: Math.max(4, (b.electricUnits / maxElectric) * 90) }} title={`ไฟ ${b.electricUnits} หน่วย`} />
                  </div>
                  <div className="text-[11px] text-inkSoft text-center">{monthLabel(b.month).split(" ")[0]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {roomBills.map((b) => (
              <div key={b.id} className="bg-white border border-line rounded-lg px-4.5 py-3.5">
                <div className="flex justify-between items-center mb-2.5">
                  <div className="text-[13.5px] font-medium">{monthLabel(b.month)}</div>
                  <div className="font-mono text-xs text-inkSoft">รวม {thb(Number(b.waterCost) + Number(b.electricCost))}</div>
                </div>
                <div className="flex gap-5 flex-wrap">
                  <div className="flex items-center gap-2 text-xs">
                    <Droplet size={13} className="text-teal" />
                    <span className="font-mono">{b.waterOld} → {b.waterNew}</span>
                    <span className="text-inkSoft">({b.waterUnits} หน่วย · {thb(Number(b.waterCost))})</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Zap size={13} className="text-brass" />
                    <span className="font-mono">{b.electricOld} → {b.electricNew}</span>
                    <span className="text-inkSoft">({b.electricUnits} หน่วย · {thb(Number(b.electricCost))})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
