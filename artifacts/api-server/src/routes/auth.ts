import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod";

const router: IRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Self-service registration only creates a NEW tenant + admin user.
// Joining an existing tenant requires an admin invitation (via POST /users).
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantName: z.string().min(1),
});

router.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email y contraseña requeridos" });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const token = signToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as "admin" | "operator",
    email: user.email,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
  });
});

// Public registration: always creates a brand-new tenant with the caller as admin.
// No way to join an existing tenant or self-assign a custom role.
router.post("/auth/register", authLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Se requieren email, contraseña (mínimo 8 caracteres) y nombre de empresa", details: parsed.error.errors });
    return;
  }

  const { email, password, tenantName } = parsed.data;

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "El email ya está registrado" });
    return;
  }

  const [newTenant] = await db.insert(tenantsTable).values({ name: tenantName }).returning();

  const hashedPassword = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    password: hashedPassword,
    tenantId: newTenant!.id,
    role: "admin",
  }).returning();

  const token = signToken({
    userId: user!.id,
    tenantId: user!.tenantId,
    role: "admin",
    email: user!.email,
  });

  res.status(201).json({
    token,
    user: {
      id: user!.id,
      email: user!.email,
      role: user!.role,
      tenantId: user!.tenantId,
    },
  });
});

router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
  res.json({
    user: {
      id: user.userId,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: tenant?.name,
    },
  });
});

export default router;
