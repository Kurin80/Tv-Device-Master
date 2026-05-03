import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { devicesTable, commandsTable, logsTable, appsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { commandLimiter } from "../middlewares/rateLimiter.js";
import * as adb from "../lib/adbService.js";
import { getIo } from "../lib/socket.js";
import { z } from "zod";

const router: IRouter = Router();

const commandSchema = z.object({
  action: z.enum([
    "screen_toggle",
    "screen_on",
    "screen_off",
    "home",
    "back",
    "reboot",
    "open_app",
    "install_apk",
    "uninstall_app",
    "list_apps",
    "sync_apps",
    "keyevent",
    "kiosk_enable",
    "kiosk_disable",
  ]),
  param: z.string().optional(),
  keycode: z.number().optional(),
});

async function getDeviceForTenant(deviceId: string, tenantId: string) {
  const [device] = await db.select().from(devicesTable)
    .where(and(eq(devicesTable.id, deviceId), eq(devicesTable.tenantId, tenantId)))
    .limit(1);
  return device;
}

async function saveLog(deviceId: string, tenantId: string, message: string, level = "info") {
  await db.insert(logsTable).values({ deviceId, tenantId, message, level });
  const io = getIo();
  if (io) {
    io.to(`tenant:${tenantId}`).emit("device:log", {
      deviceId,
      message,
      level,
      timestamp: new Date().toISOString(),
    });
  }
}

router.post("/devices/:id/command", requireAuth, commandLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const device = await getDeviceForTenant(id, tenantId);
  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Acción inválida", details: parsed.error.errors });
    return;
  }

  const { action, param, keycode } = parsed.data;

  const [cmd] = await db.insert(commandsTable).values({
    deviceId: device.id,
    tenantId,
    command: action,
    status: "running",
  }).returning();

  let result: adb.AdbResult;

  try {
    switch (action) {
      case "screen_toggle":
        result = await adb.toggleScreen(device.ip);
        break;
      case "screen_on":
        result = await adb.screenOn(device.ip);
        break;
      case "screen_off":
        result = await adb.screenOff(device.ip);
        break;
      case "home":
        result = await adb.pressHome(device.ip);
        break;
      case "back":
        result = await adb.pressBack(device.ip);
        break;
      case "reboot":
        result = await adb.rebootDevice(device.ip);
        break;
      case "open_app":
        if (!param) { result = { success: false, output: "", error: "package_name requerido" }; break; }
        result = await adb.openApp(device.ip, param);
        break;
      case "install_apk":
        if (!param) { result = { success: false, output: "", error: "ruta APK requerida" }; break; }
        result = await adb.installApk(device.ip, param);
        break;
      case "uninstall_app":
        if (!param) { result = { success: false, output: "", error: "package_name requerido" }; break; }
        result = await adb.uninstallApp(device.ip, param);
        break;
      case "sync_apps":
      case "list_apps": {
        const packages = await adb.listPackages(device.ip);
        await db.delete(appsTable).where(and(
          eq(appsTable.deviceId, device.id),
          eq(appsTable.tenantId, tenantId)
        ));
        if (packages.length > 0) {
          await db.insert(appsTable).values(
            packages.map(pkg => ({ deviceId: device.id, tenantId, packageName: pkg }))
          );
        }
        result = { success: true, output: packages.join("\n") };
        break;
      }
      case "keyevent":
        if (!keycode) { result = { success: false, output: "", error: "keycode requerido" }; break; }
        result = await adb.sendKeyEvent(device.ip, keycode);
        break;
      case "kiosk_enable":
        if (!param) { result = { success: false, output: "", error: "package_name requerido" }; break; }
        result = await adb.enableKioskMode(device.ip, param);
        break;
      case "kiosk_disable":
        result = await adb.disableKioskMode(device.ip);
        break;
      default:
        result = { success: false, output: "", error: "Acción no reconocida" };
    }
  } catch (err) {
    result = { success: false, output: "", error: String(err) };
  }

  const status = result.success ? "success" : "error";
  await db.update(commandsTable).set({
    status,
    response: result.output || result.error,
    completedAt: new Date(),
  }).where(eq(commandsTable.id, cmd!.id));

  await db.update(devicesTable).set({
    status: result.success ? "online" : device.status,
    lastSeen: result.success ? new Date() : device.lastSeen,
  }).where(eq(devicesTable.id, device.id));

  const logLevel = result.success ? "info" : "error";
  await saveLog(device.id, tenantId, `Comando "${action}": ${result.output || result.error}`, logLevel);

  const io = getIo();
  if (io) {
    io.to(`tenant:${tenantId}`).emit("command:result", {
      commandId: cmd!.id,
      deviceId: device.id,
      action,
      status,
      response: result.output || result.error,
    });
  }

  res.json({
    commandId: cmd!.id,
    status,
    output: result.output,
    error: result.error,
  });
});

router.get("/devices/:id/commands", requireAuth, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const id = String(req.params["id"]);
  const device = await getDeviceForTenant(id, tenantId);
  if (!device) {
    res.status(404).json({ error: "Dispositivo no encontrado" });
    return;
  }

  const commands = await db.select().from(commandsTable)
    .where(and(
      eq(commandsTable.deviceId, device.id),
      eq(commandsTable.tenantId, tenantId)
    ))
    .orderBy(desc(commandsTable.createdAt))
    .limit(50);

  res.json(commands);
});

export default router;
