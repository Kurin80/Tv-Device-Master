import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { devicesTable, logsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import { getIo } from "../lib/socket.js";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const ENROLLMENT_EXPIRY = 15 * 60;

const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

interface EnrollmentTokenPayload {
  type: "enrollment";
  tenantId: string;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
}

function signEnrollmentToken(tenantId: string): string {
  return jwt.sign(
    { type: "enrollment", tenantId } satisfies Omit<EnrollmentTokenPayload, "iat" | "exp">,
    getJwtSecret(),
    { expiresIn: ENROLLMENT_EXPIRY }
  );
}

function verifyEnrollmentToken(token: string): EnrollmentTokenPayload {
  const payload = jwt.verify(token, getJwtSecret()) as EnrollmentTokenPayload;
  if (payload.type !== "enrollment") {
    throw new Error("Invalid token type");
  }
  return payload;
}

router.get(
  "/enrollment/token",
  requireAuth,
  apiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.user!;
    const token = signEnrollmentToken(tenantId);
    // Use the actual request host so the URL works in both dev and production.
    // trust proxy is set so req.protocol is correctly "https" behind Replit's proxy.
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const enrollUrl = `${baseUrl}/api/devices/enroll`;
    const expiresAt = new Date(Date.now() + ENROLLMENT_EXPIRY * 1000).toISOString();

    res.json({ token, enrollUrl, expiresAt });
  }
);

const enrollSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  ip: z.string().regex(IPV4_REGEX, "Dirección IPv4 inválida"),
});

router.post("/devices/enroll", apiLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) {
    const ipError = parsed.error.issues.find((i) => i.path.includes("ip"));
    res.status(400).json({
      error: ipError ? ipError.message : "token, name e ip son requeridos",
    });
    return;
  }

  const { token, name, ip } = parsed.data;

  let payload: EnrollmentTokenPayload;
  try {
    payload = verifyEnrollmentToken(token);
  } catch {
    res.status(401).json({ error: "Token de inscripción inválido o expirado" });
    return;
  }

  const { tenantId } = payload;

  // Prevent duplicate registration: same IP within the same tenant
  const [existing] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(and(eq(devicesTable.ip, ip), eq(devicesTable.tenantId, tenantId)))
    .limit(1);

  if (existing) {
    res.status(409).json({
      error: "Ya existe un dispositivo con esta IP en tu organización",
      deviceId: existing.id,
    });
    return;
  }

  // Generate a unique token the TV agent will use to authenticate every request
  const deviceToken = randomUUID();

  const [device] = await db
    .insert(devicesTable)
    .values({ name, ip, tenantId, status: "unknown", deviceToken })
    .returning();

  await db.insert(logsTable).values({
    deviceId: device!.id,
    tenantId,
    message: `Dispositivo "${name}" inscrito automáticamente con IP ${ip}`,
    level: "info",
  });

  const io = getIo();
  if (io) {
    io.to(`tenant:${tenantId}`).emit("device:enrolled", { device });
  }

  // Return the full device record — the TV agent must persist deviceToken and id
  res.status(201).json(device);
});

export default router;
