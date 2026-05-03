import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { scheduledTasksTable, devicesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import { scheduleTask, cancelTask } from "../lib/scheduler.js";
import { z } from "zod";

const router: IRouter = Router();

const createTaskSchema = z.object({
  name: z.string().min(1),
  deviceId: z.string().uuid().optional(),
  cronExpression: z.string().min(1),
  action: z.string().min(1),
  actionParam: z.string().optional(),
  enabled: z.boolean().optional(),
});

router.get("/scheduled-tasks", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const tasks = await db.select().from(scheduledTasksTable)
    .where(eq(scheduledTasksTable.tenantId, tenantId));
  res.json(tasks);
});

router.post("/scheduled-tasks", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.errors });
    return;
  }

  if (parsed.data.deviceId) {
    const [device] = await db.select({ id: devicesTable.id }).from(devicesTable)
      .where(and(eq(devicesTable.id, parsed.data.deviceId), eq(devicesTable.tenantId, tenantId)))
      .limit(1);
    if (!device) {
      res.status(404).json({ error: "Dispositivo no encontrado" });
      return;
    }
  }

  const [task] = await db.insert(scheduledTasksTable).values({
    ...parsed.data,
    tenantId,
    enabled: parsed.data.enabled ?? true,
  }).returning();

  if (task!.enabled) {
    scheduleTask(task!);
  }

  res.status(201).json(task);
});

router.put("/scheduled-tasks/:id", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [existing] = await db.select().from(scheduledTasksTable)
    .where(and(eq(scheduledTasksTable.id, id), eq(scheduledTasksTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }

  const parsed = createTaskSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const [updated] = await db.update(scheduledTasksTable)
    .set(parsed.data)
    .where(eq(scheduledTasksTable.id, id))
    .returning();

  cancelTask(updated!.id);
  if (updated!.enabled) {
    scheduleTask(updated!);
  }

  res.json(updated);
});

router.delete("/scheduled-tasks/:id", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [existing] = await db.select({ id: scheduledTasksTable.id }).from(scheduledTasksTable)
    .where(and(eq(scheduledTasksTable.id, id), eq(scheduledTasksTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Tarea no encontrada" });
    return;
  }

  cancelTask(id);
  await db.delete(scheduledTasksTable).where(eq(scheduledTasksTable.id, id));
  res.status(204).send();
});

export default router;
