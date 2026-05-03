import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { devicesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      device?: {
        id: string;
        tenantId: string;
        ip: string;
        name: string;
      };
    }
  }
}

/**
 * Middleware for TV agent requests.
 * Reads the X-Device-Token header, validates against the devices table,
 * and attaches device info to req.device.
 */
export async function requireDeviceAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers["x-device-token"] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "X-Device-Token header requerido" });
    return;
  }

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.deviceToken, token))
    .limit(1);

  if (!device) {
    res.status(401).json({ error: "Token de dispositivo inválido o no registrado" });
    return;
  }

  req.device = {
    id: device.id,
    tenantId: device.tenantId,
    ip: device.ip,
    name: device.name,
  };
  next();
}
