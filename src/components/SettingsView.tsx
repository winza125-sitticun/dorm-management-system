import React, { useState } from "react";
import type { Settings } from "../types";

export default function SettingsView({ settings, onSave }: { settings: Settings; onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState({
    dormName: settings.dormName,
    waterRate: Number(settings.waterRate),
    electricRate: Number(settings.electricRate),
    dueDay: settings.dueDay,
    lateFeePerDay: Number(settings.lateFeePerDay),
    promptpayId: settings.promptpayId || "",
    accountName: settings.accountName || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify({
    dormName: settings.dormName, waterRate: Number(settings.waterRate), electricRate: Number(settings.electricRate),
    dueDay: settings.dueDay, lateFeePerDay: Number(settings.lateFeePerDay),
    promptpayId: settings.promptpayId || "", accountName: settings.accountName || "",
  });

  async function submit() {
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">ตั้งค่าหอพัก</h1>
      <div className="bg-white border border-line rounded-xl p-6 max-w-md">
        <div className="mb-4">
          <label className="text-xs text-inkSoft mb-1 block">ชื่อหอพัก</label>
          <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.dormName} onChange={(e) => set("dormName", e.target.value)} />
        </div>
        <div className="flex gap-2.5 mb-4">
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">อัตราค่าน้ำ (บาท/หน่วย)</label>
            <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.waterRate} onChange={(e) => set("waterRate", Number(e.target.value))} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">อัตราค่าไฟ (บาท/หน่วย)</label>
            <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.electricRate} onChange={(e) => set("electricRate", Number(e.target.value))} />
          </div>
        </div>
        <div className="flex gap-2.5 mb-4">
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">วันครบกำหนดชำระ (วันที่)</label>
            <input type="number" min={1} max={31} className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.dueDay} onChange={(e) => set("dueDay", Number(e.target.value))} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-inkSoft mb-1 block">ค่าปรับล่าช้า (บาท/วัน)</label>
            <input type="number" className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.lateFeePerDay} onChange={(e) => set("lateFeePerDay", Number(e.target.value))} />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-inkSoft mb-1 block">เลขพร้อมเพย์</label>
          <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.promptpayId} onChange={(e) => set("promptpayId", e.target.value)} />
        </div>
        <div className="mb-5.5">
          <label className="text-xs text-inkSoft mb-1 block">ชื่อบัญชีผู้รับเงิน</label>
          <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.accountName} onChange={(e) => set("accountName", e.target.value)} />
        </div>
        <button onClick={submit} disabled={!dirty || busy} className="bg-brass text-white rounded-md px-4 py-2 text-sm disabled:opacity-50">
          บันทึกการตั้งค่า
        </button>
      </div>
    </div>
  );
}
