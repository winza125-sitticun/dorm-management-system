import {
  pgTable, serial, text, integer, numeric, timestamp, pgEnum, boolean,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "staff"]);
export const roomStatusEnum = pgEnum("room_status", ["vacant", "occupied"]);
export const billStatusEnum = pgEnum("bill_status", ["unpaid", "paid"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("staff"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  tenantName: text("tenant_name").default(""),
  tenantPhone: text("tenant_phone").default(""),
  rent: numeric("rent", { precision: 10, scale: 2 }).notNull().default("0"),
  status: roomStatusEnum("status").notNull().default("vacant"),
  lastWater: integer("last_water").notNull().default(0),
  lastElectric: integer("last_electric").notNull().default(0),
  lineUserId: text("line_user_id").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  roomNumber: text("room_number").notNull(),
  tenantName: text("tenant_name").default(""),
  month: text("month").notNull(), // "YYYY-MM"
  waterOld: integer("water_old").notNull(),
  waterNew: integer("water_new").notNull(),
  waterUnits: integer("water_units").notNull(),
  waterCost: numeric("water_cost", { precision: 10, scale: 2 }).notNull(),
  electricOld: integer("electric_old").notNull(),
  electricNew: integer("electric_new").notNull(),
  electricUnits: integer("electric_units").notNull(),
  electricCost: numeric("electric_cost", { precision: 10, scale: 2 }).notNull(),
  rent: numeric("rent", { precision: 10, scale: 2 }).notNull(),
  extraFee: numeric("extra_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  extraLabel: text("extra_label").default(""),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: billStatusEnum("status").notNull().default("unpaid"),
  dueDate: timestamp("due_date").notNull(),
  lineNotified: boolean("line_notified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  dormName: text("dorm_name").notNull().default("หอพักของฉัน"),
  waterRate: numeric("water_rate", { precision: 6, scale: 2 }).notNull().default("18"),
  electricRate: numeric("electric_rate", { precision: 6, scale: 2 }).notNull().default("8"),
  dueDay: integer("due_day").notNull().default(5),
  lateFeePerDay: numeric("late_fee_per_day", { precision: 10, scale: 2 }).notNull().default("20"),
  promptpayId: text("promptpay_id").default(""),
  accountName: text("account_name").default(""),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
export type Settings = typeof settings.$inferSelect;
