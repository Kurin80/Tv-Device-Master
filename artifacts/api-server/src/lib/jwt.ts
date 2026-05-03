import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required but was not provided.");
  }
  return secret;
}

const JWT_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: "admin" | "operator";
  email: string;
}

export function validateJwtSecret(): void {
  getJwtSecret();
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}
