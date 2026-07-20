import React, { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Home, FilePlus2, History, Settings as SettingsIcon,
  UserCog, Gauge, LogOut, Loader2, Building2, CheckCircle2,
} from "lucide-react";
import { api } from "./lib/api";
import type { AuthUser, Room, Bill, Settings } from "./types";

import LoginView from "./components/LoginView";
import DashboardView from "./components/DashboardView";
import RoomsView from "./components/RoomsView";
import CreateBillView from "./components/CreateBillView";
import HistoryView from "./components/HistoryView";
import MeterHistoryView from "./components/MeterHistoryView";
import BillInvoice from "./components/BillInvoice";
import SettingsView from "./components/SettingsView";
import UsersView from "./components/UsersView";

export const ROLE_LABEL: Record<string, string> = { admin: "แอดมิน", staff: "ผู้ดูแล" };

type View = "dashboard" | "rooms" | "createBill" | "history" | "meterHistory" | "invoice" | "settings" | "users";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [meterRoomId, setMeterRoomId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const loadAll = useCallback(async () => {
    const [r, b, s] = await Promise.all([api.rooms.list(), api.bills.list(), api.settings.get()]);
    setRooms(r);
    setBills(b);
    setSettings(s);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.auth.me();
        setUser(me);
        await loadAll();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  async function handleLogin(username: string, password: string) {
    const me = await api.auth.login(username, password);
    setUser(me);
    await loadAll();
  }

  async function handleLogout() {
    await api.auth.logout();
    setUser(null);
    setView("dashboard");
  }

  const isAdmin = user?.role === "admin";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <Loader2 className="animate-spin" size={26} color="#A9814A" />
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  const navItems: { key: View; label: string; icon: any }[] = [
    { key: "dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
    { key: "rooms", label: "ห้องพัก", icon: Home },
    { key: "createBill", label: "สร้างบิล", icon: FilePlus2 },
    { key: "history", label: "ประวัติบิล", icon: History },
    { key: "meterHistory", label: "ประวัติมิเตอร์", icon: Gauge },
    ...(isAdmin ? [{ key: "users" as View, label: "ผู้ใช้งาน", icon: UserCog }] : []),
    ...(isAdmin ? [{ key: "settings" as View, label: "ตั้งค่า", icon: SettingsIcon }] : []),
  ];

  const selectedBill = bills.find((b) => b.id === invoiceId) || null;

  return (
    <div className="min-h-screen flex bg-paper font-body text-ink">
      <aside className="no-print w-56 bg-ink flex flex-col p-3 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 pt-1 pb-5">
          <Building2 size={19} color="#A9814A" />
          <div className="font-display text-white text-[15px] font-semibold leading-tight">
            {settings?.dormName}
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-md text-sm text-left text-paper transition ${
                view === item.key || (view === "invoice" && item.key === "history")
                  ? "opacity-100 bg-white/10"
                  : "opacity-70 hover:opacity-100 hover:bg-white/5"
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="w-[30px] h-[30px] rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-brass flex-shrink-0">
              {user.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] text-white font-medium truncate">{user.name}</div>
              <div className="text-[10.5px] text-brass">{ROLE_LABEL[user.role]}</div>
            </div>
            <button onClick={handleLogout} className="text-paper/60 hover:text-paper p-1.5" title="ออกจากระบบ">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-7">
        {toast && (
          <div className="fixed top-5 right-5 bg-ink text-white px-4 py-2.5 rounded-lg text-sm z-50 flex items-center gap-2">
            <CheckCircle2 size={15} color="#A9814A" /> {toast}
          </div>
        )}

        {view === "dashboard" && settings && (
          <DashboardView
            rooms={rooms}
            bills={bills}
            onGoBill={() => setView("createBill")}
            onOpenInvoice={(id) => { setInvoiceId(id); setView("invoice"); }}
          />
        )}

        {view === "rooms" && (
          <RoomsView
            rooms={rooms}
            canDelete={isAdmin}
            reload={loadAll}
            showToast={showToast}
            onViewMeter={(id) => { setMeterRoomId(id); setView("meterHistory"); }}
          />
        )}

        {view === "createBill" && settings && (
          <CreateBillView
            rooms={rooms}
            settings={settings}
            onCreated={async (id, lineResult) => {
              await loadAll();
              showToast(lineResult?.ok ? "สร้างบิลและส่ง LINE แจ้งเตือนแล้ว" : "สร้างบิลเรียบร้อยแล้ว");
              setInvoiceId(id);
              setView("invoice");
            }}
            onCancel={() => setView("dashboard")}
          />
        )}

        {view === "history" && (
          <HistoryView
            bills={bills}
            canDelete={isAdmin}
            reload={loadAll}
            showToast={showToast}
            onOpenInvoice={(id) => { setInvoiceId(id); setView("invoice"); }}
          />
        )}

        {view === "meterHistory" && (
          <MeterHistoryView rooms={rooms} bills={bills} roomId={meterRoomId} setRoomId={setMeterRoomId} />
        )}

        {view === "invoice" && selectedBill && settings && (
          <BillInvoice
            bill={selectedBill}
            settings={settings}
            onBack={() => setView("history")}
            reload={loadAll}
            showToast={showToast}
          />
        )}

        {view === "users" && isAdmin && (
          <UsersView currentUser={user} reload={loadAll} showToast={showToast} />
        )}

        {view === "settings" && isAdmin && settings && (
          <SettingsView
            settings={settings}
            onSave={async (data) => {
              await api.settings.update(data);
              await loadAll();
              showToast("บันทึกการตั้งค่าแล้ว");
            }}
          />
        )}
      </main>
    </div>
  );
}
