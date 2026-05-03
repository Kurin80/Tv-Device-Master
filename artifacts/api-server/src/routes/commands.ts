/**
 * Command dispatch route.
 *
 * Hybrid execution model — works for both same-network TVs and internet TVs:
 *
 * 1. Command is saved to DB immediately with status "pending".
 * 2. Response is returned to the dashboard right away (non-blocking).
 * 3. ADB execution is attempted in the background (5 s timeout):
 *    - Success → command marked "success", socket event emitted.
 *    - Failure → command left as "pending" so the TV agent can pick it up
 *      on its next poll (every 10 s).
 * 4. When the TV agent picks up the command it marks it "running", executes
 *    locally, and POSTs the result to /api/agent/commands/:id/result.
 *
 * This means commands work over the internet (via agent) and still execute
 * instantly when the TV is on the same network (via ADB fallback).
 */

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

const ADB_QUICK_TIMEOUT = 5_000; // ms — short timeout so we don't block the agent path

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
  const [device] = await db
    .select()
    .from(devicesTable)
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

/** Try ADB with a hard cap of ADB_QUICK_TIMEOUT ms. Returns null on any failure. */
async function tryAdbQuick(
  action: string,
  device: { ip: string },
  param?: string,
  keycode?: number
): Promise<adb.AdbResult | null> {
  // Override the global timeout with a shorter one for the background attempt
  const origTimeout = process.env["ADB_TIMEOUT_MS"];
  process.env["ADB_TIMEOUT_MS"] = String(ADB_QUICK_TIMEOUT);

  try {
    switch (action) {
      case "screen_toggle":  return await adb.toggleScreen(device.ip);
      case "screen_on":      return await adb.screenOn(device.ip);
      case "screen_off":     return await adb.screenOff(device.ip);
      case "home":           return await adb.pressHome(device.ip);
      case "back":           return await adb.pressBack(device.ip);
      case "reboot":         return await adb.rebootDevice(device.ip);
      case "open_app":       return param ? await adb.openApp(device.ip, param) : null;
      case "install_apk":    return param ? await adb.installApk(device.ip, param) : null;
      case "uninstall_app":  return param ? await adb.uninstallApp(device.ip, param) : null;
      case "sync_apps":
      case "list_apps":      return { success: true, output: "__sync__" }; // handled below
      case "keyevent":       return keycode ? await adb.sendKeyEvent(device.ip, keycode) : null;
      case "kiosk_enable":   return param ? await adb.enableKioskMode(device.ip, param) : null;
      case "kiosk_disable":  return await adb.disableKioskMode(device.ip);
      default:               return null;
    }
  } catch {
    return null;
  } finally {
    if (origTimeout !== undefined) process.env["ADB_TIMEOUT_MS"] = origTimeout;
    else delete process.env["ADB_TIMEOUT_MS"];
  }
}

router.post(
  "/devices/:id/command",
  requireAuth,
  commandLimiter,
  async (req: Request, res: Response): Promise<void> => {
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

    // Determine the stored param value (keycode is coerced to string for storage)
    const storedParam =
      param ?? (keycode !== undefined ? String(keycode) : undefined) ?? null;

    // 1. Save to DB as "pending" — the TV agent can always pick this up
    const [cmd] = await db
      .insert(commandsTable)
      .values({
        deviceId: device.id,
        tenantId,
        command: action,
        param: storedParam,
        status: "pending",
      })
      .returning();

    // 2. Respond immediately — dashboard listens on the socket for the final result
    res.json({
      commandId: cmd!.id,
      status: "pending",
      output: "",
      error: "",
    });

    // 3. Try ADB in background (non-blocking, 5 s timeout)
    //    If ADB works (same-network), finalize now.
    //    If it fails, the command stays "pending" for the TV agent to pick up.
    setImmediate(async () => {
      try {
        const result = await tryAdbQuick(action, device, param, keycode);

        if (!result || !result.success) {
          // ADB failed or timed out — leave command as "pending" for the TV agent
          return;
        }

        // ADB succeeded ─ handle sync_apps specially
        if ((action === "sync_apps" || action === "list_apps") && result.output === "__sync__") {
          const packages = await adb.listPackages(device.ip);
          await db
            .delete(appsTable)
            .where(and(eq(appsTable.deviceId, device.id), eq(appsTable.tenantId, tenantId)));
          if (packages.length > 0) {
            await db.insert(appsTable).values(
              packages.map((pkg) => ({ deviceId: device.id, tenantId, packageName: pkg }))
            );
          }
          result.output = packages.join("\n");
        }

        await db
          .update(commandsTable)
          .set({ status: "success", response: result.output, completedAt: new Date() })
          .where(eq(commandsTable.id, cmd!.id));

        await db
          .update(devicesTable)
          .set({ status: "online", lastSeen: new Date() })
          .where(eq(devicesTable.id, device.id));

        await saveLog(
          device.id,
          tenantId,
          `[ADB] Comando "${action}": ${result.output || "OK"}`,
          "info"
        );

        const io = getIo();
        if (io) {
          io.to(`tenant:${tenantId}`).emit("command:result", {
            commandId: cmd!.id,
            deviceId: device.id,
            action,
            status: "success",
            response: result.output,
          });
          io.to(`tenant:${tenantId}`).emit("device:status", {
            deviceId: device.id,
            status: "online",
            lastSeen: new Date(),
          });
        }
      } catch {
        // Silent failure — command stays pending for agent pickup
      }
    });
  }
);

router.get(
  "/devices/:id/commands",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.user!;
    const id = String(req.params["id"]);
    const device = await getDeviceForTenant(id, tenantId);
    if (!device) {
      res.status(404).json({ error: "Dispositivo no encontrado" });
      return;
    }

    const commands = await db
      .select()
      .from(commandsTable)
      .where(and(eq(commandsTable.deviceId, device.id), eq(commandsTable.tenantId, tenantId)))
      .orderBy(desc(commandsTable.createdAt))
      .limit(50);

    res.json(commands);
  }
);

export default router;
