import { pgTable, text, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";
import { tenantsTable } from "./tenants";

export const commandStatusEnum = pgEnum("command_status", ["pending", "running", "success", "error"]);

export const commandsTable = pgTable("commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  command: text("command").notNull(),
  // Optional parameter for the command (package name, keycode, APK path, etc.)
  param: text("param"),
  status: commandStatusEnum("status").notNull().default("pending"),
  response: text("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertCommandSchema = createInsertSchema(commandsTable).omit({ id: true, createdAt: true, completedAt: true, status: true, response: true });
export type InsertCommand = z.infer<typeof insertCommandSchema>;
export type Command = typeof commandsTable.$inferSelect;
