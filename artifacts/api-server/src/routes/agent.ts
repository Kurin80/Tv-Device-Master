/**
 * Agent API — consumed exclusively by the MDM TV Agent app running on Android TV devices.
 *
 * Authentication: X-Device-Token header (UUID issued at enrollment).
 * No user JWT required here — these endpoints are device-to-server only.
 *
 * Flow:
 *   TV Agent → POST /api/agent/heartbeat  (every 30s)
 *   TV Agent → GET  /api/agent/commands   (every 10s, picks up pending commands)
 *   TV Agent → POST /api/agent/commands/:id/result  (after executing each command)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { devicesTable, commandsTable, logsTable, appsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireDeviceAuth } from "../middlewares/deviceAuth.js";
import { getIo } from "../lib/socket.js";
import { z } from "zod";

const router: IRouter = Router();

/* ─────────────────────────────────────────
   POST /api/agent/heartbeat
   TV agent calls this every 30 seconds.
   Updates device status to online, refreshes lastSeen, optionally updates IP.
───────────────────────────────────────── */
router.post(
  "/agent/heartbeat",
  requireDeviceAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id: deviceId, tenantId } = req.device!;
    const body = req.body as { ip?: string; appVersion?: string };

    const updateData: { status: "online"; lastSeen: Date; ip?: string } = {
      status: "online",
      lastSeen: new Date(),
    };

    // Accept IP updates from the agent — useful when DHCP changes the address.
    if (body.ip && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(body.ip)) {
      updateData.ip = body.ip;
    }

    await db.update(devicesTable).set(updateData).where(eq(devicesTable.id, deviceId));

    const io = getIo();
    if (io) {
      io.to(`tenant:${tenantId}`).emit("device:status", {
        deviceId,
        status: "online",
        lastSeen: updateData.lastSeen,
      });
    }

    res.json({ ok: true });
  }
);

/* ─────────────────────────────────────────
   GET /api/agent/commands
   Returns pending commands for this device and immediately marks them as "running"
   so they are not returned in subsequent polls.
───────────────────────────────────────── */
router.get(
  "/agent/commands",
  requireDeviceAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id: deviceId } = req.device!;

    const pending = await db
      .select({
        id: commandsTable.id,
        command: commandsTable.command,
        param: commandsTable.param,
        createdAt: commandsTable.createdAt,
      })
      .from(commandsTable)
      .where(
        and(
          eq(commandsTable.deviceId, deviceId),
          eq(commandsTable.status, "pending")
        )
      )
      .limit(20);

    // Mark all as "running" in one update so they are not served again
    if (pending.length > 0) {
      await db
        .update(commandsTable)
        .set({ status: "running" })
        .where(
          and(
            eq(commandsTable.deviceId, deviceId),
            eq(commandsTable.status, "pending")
          )
        );
    }

    res.json(pending);
  }
);

/* ─────────────────────────────────────────
   POST /api/agent/commands/:id/result
   TV agent reports the outcome of a command it executed.
   Handles the special sync_apps case which also sends the package list.
───────────────────────────────────────── */
const resultSchema = z.object({
  status: z.enum(["success", "error"]),
  response: z.string().optional().default(""),
  packages: z.array(z.string()).optional(), // only for sync_apps
});

router.post(
  "/agent/commands/:id/result",
  requireDeviceAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id: deviceId, tenantId } = req.device!;
    const commandId = String(req.params["id"]);

    const parsed = resultSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Payload inválido — se requiere { status, response? }" });
      return;
    }

    const { status, response, packages } = parsed.data;

    const [cmd] = await db
      .select()
      .from(commandsTable)
      .where(
        and(
          eq(commandsTable.id, commandId),
          eq(commandsTable.deviceId, deviceId)
        )
      )
      .limit(1);

    if (!cmd) {
      res.status(404).json({ error: "Comando no encontrado" });
      return;
    }

    await db
      .update(commandsTable)
      .set({ status, response, completedAt: new Date() })
      .where(eq(commandsTable.id, commandId));

    // Keep device online
    await db
      .update(devicesTable)
      .set({ status: "online", lastSeen: new Date() })
      .where(eq(devicesTable.id, deviceId));

    // If sync_apps was reported, update the apps table
    if (cmd.command === "sync_apps" && Array.isArray(packages) && packages.length > 0) {
      await db
        .delete(appsTable)
        .where(and(eq(appsTable.deviceId, deviceId), eq(appsTable.tenantId, tenantId)));
      await db.insert(appsTable).values(
        packages.map((pkg) => ({ deviceId, tenantId, packageName: pkg }))
      );
    }

    const logMsg = `[Agente TV] Comando "${cmd.command}" — ${status}${response ? ": " + response : ""}`;
    await db.insert(logsTable).values({
      deviceId,
      tenantId,
      message: logMsg,
      level: status === "success" ? "info" : "error",
    });

    const io = getIo();
    if (io) {
      const room = `tenant:${tenantId}`;
      io.to(room).emit("command:result", {
        commandId,
        deviceId,
        action: cmd.command,
        status,
        response,
      });
      io.to(room).emit("device:status", {
        deviceId,
        status: "online",
        lastSeen: new Date(),
      });
      io.to(room).emit("device:log", {
        deviceId,
        message: logMsg,
        level: status === "success" ? "info" : "error",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ ok: true });
  }
);

export default router;
