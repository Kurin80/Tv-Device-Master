import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import { z } from "zod";

const router: IRouter = Router();

// Get the current tenant's info
router.get("/tenants/me", requireAuth, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Tenant no encontrado" });
    return;
  }
  res.json(tenant);
});

const updateTenantSchema = z.object({
  name: z.string().min(1),
});

// Update current tenant's name (admin only)
router.put("/tenants/me", requireAuth, requireAdmin, apiLimiter, async (req: Request, res: Response) => {
  const { tenantId } = req.user!;
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nombre de empresa requerido" });
    return;
  }

  const [updated] = await db.update(tenantsTable)
    .set({ name: parsed.data.name })
    .where(eq(tenantsTable.id, tenantId))
    .returning();

  res.json(updated);
});

export default router;
