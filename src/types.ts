export type Role = "admin" | "staff";
export type RoomStatus = "vacant" | "occupied";
export type BillStatus = "unpaid" | "paid";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

export interface Room {
  id: number;
  number: string;
  tenantName: string | null;
  tenantPhone: string | null;
  rent: string;
  status: RoomStatus;
  lastWater: number;
  lastElectric: number;
  lineUserId: string | null;
  createdAt: string;
}

export interface Bill {
  id: number;
  roomId: number;
  roomNumber: string;
  tenantName: string | null;
  month: string;
  waterOld: number;
  waterNew: number;
  waterUnits: number;
  waterCost: string;
  electricOld: number;
  electricNew: number;
  electricUnits: number;
  electricCost: string;
  rent: string;
  extraFee: string;
  extraLabel: string | null;
  total: string;
  status: BillStatus;
  dueDate: string;
  lineNotified: boolean;
  createdAt: string;
}

export interface Settings {
  id: number;
  dormName: string;
  waterRate: string;
  electricRate: string;
  dueDay: number;
  lateFeePerDay: string;
  promptpayId: string | null;
  accountName: string | null;
}
