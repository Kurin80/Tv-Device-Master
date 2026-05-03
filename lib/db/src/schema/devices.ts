import { pgTable, text, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const deviceStatusEnum = pgEnum("device_status", ["online", "offline", "unknown"]);

export const devicesTable = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  status: deviceStatusEnum("status").notNull().default("unknown"),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Token used by the TV agent to authenticate over the internet.
  // Generated at enrollment, persisted in the agent app's storage.
  deviceToken: text("device_token").unique(),
});

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, lastSeen: true, status: true, deviceToken: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
