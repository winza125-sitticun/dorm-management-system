import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { AuthUser } from "../types";

const ROLE_LABEL: Record<string, string> = { admin: "แอดมิน", staff: "ผู้ดูแล" };

function UserModal({ user, onClose, onSaved }: { user: Partial<AuthUser> | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !user?.id;
  const [form, setForm] = useState({
    username: user?.username || "",
    password: "",
    name: user?.name || "",
    role: user?.role || "staff",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && (isNew ? form.username.trim() && form.password.length >= 6 : true);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (isNew) {
        await api.users.create({ username: form.username, password: form.password, name: form.name, role: form.role as any });
      } else {
        const data: any = { name: form.name, role: form.role };
        if (form.password) data.password = form.password;
        await api.users.update(user!.id!, data);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="font-display text-lg font-semibold">{isNew ? "เพิ่มผู้ใช้งาน" : `แก้ไข ${user?.name}`}</div>
          <button onClick={onClose} className="p-1.5 text-inkSoft"><X size={17} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-inkSoft mb-1 block">ชื่อ-นามสกุล</label>
            <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-inkSoft mb-1 block">ชื่อผู้ใช้ (username){!isNew && " — แก้ไม่ได้"}</label>
            <input disabled={!isNew} className="w-full border border-line rounded-md px-3 py-2 text-sm disabled:bg-paperDeep disabled:text-inkFaint" value={form.username} onChange={(e) => set("username", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-inkSoft mb-1 block">{isNew ? "รหัสผ่าน (อย่างน้อย 6 ตัว)" : "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)"}</label>
            <input className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.password} onChange={(e) => set("password", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-inkSoft mb-1 block">สิทธิ์การใช้งาน</label>
            <select className="w-full border border-line rounded-md px-3 py-2 text-sm" value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="staff">ผู้ดูแล — จัดการบิลและห้องพักประจำวัน</option>
              <option value="admin">แอดมิน — สิทธิ์เต็ม รวมตั้งค่าและจัดการผู้ใช้</option>
            </select>
          </div>
          {error && <div className="text-[12.5px] text-rust bg-rustPale rounded-md px-2.5 py-2">{error}</div>}
          <div className="flex justify-end gap-2 mt-1">
            <button onClick={onClose} className="border border-line rounded-md px-4 py-2 text-sm">ยกเลิก</button>
            <button onClick={submit} disabled={!valid || busy} className="bg-brass text-white rounded-md px-4 py-2 text-sm disabled:opacity-50">บันทึก</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsersView({ currentUser, showToast }: { currentUser: AuthUser; reload: () => Promise<void>; showToast: (m: string) => void }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; user: Partial<AuthUser> | null }>({ open: false, user: null });
  const [confirmDelete, setConfirmDelete] = useState<AuthUser | null>(null);

  async function load() {
    setLoading(true);
    setUsers(await api.users.list());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function doDelete() {
    if (!confirmDelete) return;
    await api.users.remove(confirmDelete.id);
    setConfirmDelete(null);
    await load();
    showToast("ลบผู้ใช้งานแล้ว");
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <h1 className="font-display text-2xl font-semibold">ผู้ใช้งานระบบ</h1>
        <button onClick={() => setModal({ open: true, user: {} })} className="bg-brass text-white rounded-md px-4 py-2 text-sm font-medium flex items-center gap-1.5">
          <Plus size={15} />เพิ่มผู้ใช้งาน
        </button>
      </div>

      {loading ? (
        <div className="text-inkSoft text-sm">กำลังโหลด...</div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="bg-white border border-line rounded-lg px-4 py-3.5 flex items-center gap-3.5">
              <div className="w-9.5 h-9.5 rounded-full bg-brassPale flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-[13px] font-medium text-brassDeep">{u.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {u.name}
                  {u.id === currentUser.id && <span className="text-[10.5px] text-teal bg-tealPale rounded-full px-2 py-0.5">คุณ</span>}
                </div>
                <div className="text-xs text-inkSoft">@{u.username}</div>
              </div>
              <span className={`flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-full font-medium ${u.role === "admin" ? "bg-brassPale text-brassDeep" : "bg-paperDeep text-inkSoft"}`}>
                {u.role === "admin" && <ShieldCheck size={12} />}
                {ROLE_LABEL[u.role]}
              </span>
              <button onClick={() => setModal({ open: true, user: u })} className="p-2 text-inkSoft"><Pencil size={13} /></button>
              <button
                onClick={() => u.id !== currentUser.id && setConfirmDelete(u)}
                disabled={u.id === currentUser.id}
                className={`p-2 ${u.id === currentUser.id ? "text-inkFaint cursor-not-allowed" : "text-rust"}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {modal.open && <UserModal user={modal.user} onClose={() => setModal({ open: false, user: null })} onSaved={load} />}

      {confirmDelete && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5.5" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-lg font-semibold mb-3">ยืนยันการลบ</div>
            <div className="text-sm text-inkSoft mb-4.5">ต้องการลบผู้ใช้ {confirmDelete.name} ใช่หรือไม่</div>
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
