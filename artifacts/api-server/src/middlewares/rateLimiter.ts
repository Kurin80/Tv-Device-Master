import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos de autenticación. Intente en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Límite de solicitudes alcanzado. Intente en un minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const commandLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 30,
  message: { error: "Demasiados comandos enviados. Espere un momento." },
  standardHeaders: true,
  legacyHeaders: false,
});
