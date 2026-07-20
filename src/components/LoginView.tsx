import React, { useState } from "react";
import { Building2, Lock, Eye, EyeOff } from "lucide-react";
import { ApiError } from "../lib/api";

export default function LoginView({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password) { setError("กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ"); return; }
    setBusy(true);
    setError("");
    try {
      await onLogin(username, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-6 font-body text-ink">
      <div className="w-full max-w-sm bg-white border border-line rounded-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center mb-3.5">
            <Building2 size={22} color="#A9814A" />
          </div>
          <div className="font-display text-lg font-semibold text-center">ระบบจัดการหอพักและออกบิล</div>
          <div className="text-xs text-inkSoft mt-1">เข้าสู่ระบบเพื่อดำเนินการต่อ</div>
        </div>

        <label className="text-xs text-inkSoft mb-1 block">ชื่อผู้ใช้</label>
        <input
          className="w-full border border-line rounded-md px-3 py-2 text-sm mb-3.5 outline-none focus:border-brass focus:ring-2 focus:ring-brassPale"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError(""); }}
          onKeyDown={handleKeyDown}
          placeholder="admin"
          autoFocus
        />

        <label className="text-xs text-inkSoft mb-1 block">รหัสผ่าน</label>
        <div className="relative mb-2">
          <input
            className="w-full border border-line rounded-md px-3 py-2 pr-10 text-sm outline-none focus:border-brass focus:ring-2 focus:ring-brassPale"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-2 top-2 text-inkFaint p-1"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error && (
          <div className="text-[12.5px] text-rust bg-rustPale rounded-md px-2.5 py-2 mb-3">{error}</div>
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-brass text-white rounded-md py-2.5 text-sm font-medium flex items-center justify-center gap-2 mt-1.5 disabled:opacity-60"
        >
          <Lock size={14} />{busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>

        <div className="text-[11px] text-inkFaint text-center mt-4 leading-relaxed">
          บัญชีทดลองหลังรัน <code>npm run db:seed</code> —<br />
          แอดมิน: admin / admin123 · ผู้ดูแล: staff / staff123
        </div>
      </div>
    </div>
  );
}
