import { type Request, type Response, type NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Se requiere rol de administrador" });
    return;
  }
  next();
}

export function requireTenantAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const requestedTenantId = req.params["tenantId"] ?? req.body?.tenantId;
  if (requestedTenantId && requestedTenantId !== req.user.tenantId) {
    res.status(403).json({ error: "Acceso denegado a este tenant" });
    return;
  }
  next();
}
