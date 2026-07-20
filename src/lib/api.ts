import type { AuthUser, Room, Bill, Settings } from "../types";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = body?.error?.formErrors?.[0] || body?.error || `คำขอล้มเหลว (${res.status})`;
    throw new ApiError(res.status, typeof message === "string" ? message : "เกิดข้อผิดพลาด");
  }
  return body as T;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<AuthUser>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    me: () => request<AuthUser>("/api/auth/me"),
  },
  rooms: {
    list: () => request<Room[]>("/api/rooms"),
    create: (data: Partial<Room>) => request<Room>("/api/rooms", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Room>) =>
      request<Room>(`/api/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => request<{ ok: true }>(`/api/rooms/${id}`, { method: "DELETE" }),
  },
  bills: {
    list: () => request<Bill[]>("/api/bills"),
    create: (data: {
      roomId: number; month: string; waterNew: number; electricNew: number;
      rent?: number; extraFee?: number; extraLabel?: string;
    }) => request<{ bill: Bill; lineResult: { ok: boolean; error?: string } | null }>("/api/bills", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    setStatus: (id: number, status: "paid" | "unpaid") =>
      request<Bill>(`/api/bills/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    notify: (id: number) => request<{ ok: boolean; error?: string }>(`/api/bills/${id}/notify`, { method: "POST" }),
    remove: (id: number) => request<{ ok: true }>(`/api/bills/${id}`, { method: "DELETE" }),
  },
  settings: {
    get: () => request<Settings>("/api/settings"),
    update: (data: Partial<Settings>) =>
      request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  },
  users: {
    list: () => request<AuthUser[]>("/api/users"),
    create: (data: { username: string; password: string; name: string; role: "admin" | "staff" }) =>
      request<AuthUser>("/api/users", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; role?: "admin" | "staff"; password?: string }) =>
      request<AuthUser>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => request<{ ok: true }>(`/api/users/${id}`, { method: "DELETE" }),
  },
};

export { ApiError };
