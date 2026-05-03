import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";
import { tenantsTable } from "./tenants";

export const scheduledTasksTable = pgTable("scheduled_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devicesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cronExpression: text("cron_expression").notNull(),
  action: text("action").notNull(),
  actionParam: text("action_param"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScheduledTaskSchema = createInsertSchema(scheduledTasksTable).omit({ id: true, createdAt: true });
export type InsertScheduledTask = z.infer<typeof insertScheduledTaskSchema>;
export type ScheduledTask = typeof scheduledTasksTable.$inferSelect;
