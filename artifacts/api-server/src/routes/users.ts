import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import { z } from "zod";

const router: IRouter = Router();

router.get("/users", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
    tenantId: usersTable.tenantId,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.tenantId, tenantId));
  res.json(users);
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "operator"]).optional(),
});

router.post("/users", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const { email, password, role } = parsed.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    password: hashedPassword,
    tenantId,
    role: role ?? "operator",
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
    tenantId: usersTable.tenantId,
    createdAt: usersTable.createdAt,
  });

  res.status(201).json(user);
});

router.delete("/users/:id", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId, userId } = req.user!;
  const targetId = String(req.params["id"]);
  if (targetId === userId) {
    res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
    return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, targetId));
  res.status(204).send();
});

export default router;
