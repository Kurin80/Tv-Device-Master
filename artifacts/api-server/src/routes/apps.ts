import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { devicesTable, appsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";

const router: IRouter = Router();

router.get("/devices/:id/apps", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [device] = await db.select().from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  const apps = await db.select().from(appsTable).where(eq(appsTable.deviceId, device.id));
  res.json(apps);
});

export default router;
