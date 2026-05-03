import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyToken } from "./jwt.js";
import { db } from "@workspace/db";
import { devicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { checkConnection } from "./adbService.js";
import { logger } from "./logger.js";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth["token"] as string | undefined;
    if (!token) {
      return next(new Error("Token de autenticación requerido"));
    }
    try {
      const payload = verifyToken(token);
      socket.data["user"] = payload;
      next();
    } catch {
      next(new Error("Token inválido"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data["user"] as ReturnType<typeof verifyToken>;
    const tenantRoom = `tenant:${user.tenantId}`;
    socket.join(tenantRoom);

    logger.info({ userId: user.userId, tenantId: user.tenantId }, "WebSocket client connected");

    socket.on("device:subscribe", (deviceId: string) => {
      socket.join(`device:${deviceId}`);
    });

    socket.on("device:unsubscribe", (deviceId: string) => {
      socket.leave(`device:${deviceId}`);
    });

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "WebSocket client disconnected");
    });
  });

  return io;
}

export function getIo(): SocketIOServer | null {
  return io;
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function startDeviceHeartbeat(intervalMs = 60000): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(async () => {
    try {
      const devices = await db.select().from(devicesTable);
      for (const device of devices) {
        const online = await checkConnection(device.ip);
        const newStatus = online ? "online" : "offline";

        if (newStatus !== device.status) {
          await db.update(devicesTable).set({
            status: newStatus,
            lastSeen: online ? new Date() : device.lastSeen,
          }).where(eq(devicesTable.id, device.id));

          if (io) {
            io.to(`tenant:${device.tenantId}`).emit("device:status", {
              deviceId: device.id,
              status: newStatus,
              lastSeen: online ? new Date() : device.lastSeen,
            });
          }

          if (!online && newStatus === "offline") {
            if (io) {
              io.to(`tenant:${device.tenantId}`).emit("device:alert", {
                deviceId: device.id,
                deviceName: device.name,
                message: `Alerta: dispositivo "${device.name}" (${device.ip}) se ha desconectado`,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Error en heartbeat de dispositivos");
    }
  }, intervalMs);
}
