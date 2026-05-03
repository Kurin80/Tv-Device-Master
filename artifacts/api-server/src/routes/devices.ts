import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { devicesTable, logsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import { checkConnection } from "../lib/adbService.js";
import { getIo } from "../lib/socket.js";
import { z } from "zod";

const router: IRouter = Router();

const createDeviceSchema = z.object({
  name: z.string().min(1),
  ip: z.string().min(1),
});

router.get("/devices", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const devices = await db.select().from(devicesTable).where(eq(devicesTable.tenantId, tenantId)).orderBy(devicesTable.createdAt);
  res.json(devices);
});

router.get("/devices/:id", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [device] = await db.select().from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }
  res.json(device);
});

router.post("/devices", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const parsed = createDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nombre e IP requeridos" });
    return;
  }

  const { name, ip } = parsed.data;
  const [device] = await db.insert(devicesTable).values({
    name,
    ip,
    tenantId,
    status: "unknown",
  }).returning();

  await db.insert(logsTable).values({
    deviceId: device!.id,
    tenantId,
    message: `Dispositivo "${name}" registrado con IP ${ip}`,
    level: "info",
  });

  res.status(201).json(device);
});

router.put("/devices/:id", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const parsed = createDeviceSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const [existing] = await db.select({ id: devicesTable.id }).from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  const [updated] = await db.update(devicesTable)
    .set(parsed.data)
    .where(eq(devicesTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/devices/:id", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [existing] = await db.select({ id: devicesTable.id }).from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  await db.delete(devicesTable).where(eq(devicesTable.id, id));
  res.status(204).send();
});

router.post("/devices/:id/ping", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const [device] = await db.select().from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  const online = await checkConnection(device.ip);
  const newStatus = online ? "online" : "offline";

  await db.update(devicesTable).set({
    status: newStatus,
    lastSeen: online ? new Date() : device.lastSeen,
  }).where(eq(devicesTable.id, device.id));

  const io = getIo();
  if (io) {
    io.to(`tenant:${tenantId}`).emit("device:status", {
      deviceId: device.id,
      status: newStatus,
      lastSeen: online ? new Date() : device.lastSeen,
    });
  }

  res.json({ deviceId: device.id, status: newStatus, online });
});

export default router;
