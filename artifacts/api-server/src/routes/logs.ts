import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { devicesTable, logsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";

const router: IRouter = Router();

router.get("/devices/:id/logs", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [device] = await db.select().from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "100")), 500);
  const logs = await db.select().from(logsTable)
    .where(eq(logsTable.deviceId, device.id))
    .orderBy(desc(logsTable.createdAt))
    .limit(limit);

  res.json(logs.reverse());
});

router.get("/logs", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const devices = await db.select({ id: devicesTable.id }).from(devicesTable).where(eq(devicesTable.tenantId, tenantId));
  const deviceIds = devices.map(d => d.id);

  if (deviceIds.length === 0) {
    res.json([]);
    return;
  }

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "100")), 500);
  const allLogs = await db.select({
    id: logsTable.id,
    deviceId: logsTable.deviceId,
    message: logsTable.message,
    level: logsTable.level,
    createdAt: logsTable.createdAt,
  }).from(logsTable)
    .innerJoin(devicesTable, eq(logsTable.deviceId, devicesTable.id))
    .where(eq(devicesTable.tenantId, tenantId))
    .orderBy(desc(logsTable.createdAt))
    .limit(limit);

  res.json(allLogs.reverse());
});

export default router;
